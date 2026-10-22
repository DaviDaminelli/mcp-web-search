import axios, { isAxiosError, type AxiosResponse } from "axios";

const TAVILY_BASE_URL = "https://api.tavily.com";

// Quanto tempo uma chave fica fora do pool depois de estourar o limite.
const RATE_LIMIT_COOLDOWN_MS = 60_000; // 429: limite por minuto, volta rápido
const QUOTA_COOLDOWN_MS = 6 * 60 * 60 * 1000; // 432/433: cota do plano
const INVALID_KEY_COOLDOWN_MS = 24 * 60 * 60 * 1000; // 401/403: chave inválida

// Espera máxima dentro de uma chamada antes de repetir a requisição. Acima
// disso é melhor devolver erro do que travar o cliente MCP esperando.
const MAX_WAIT_MS = 3_000;

/** Índice da chave em uso. Mantido entre chamadas no mesmo processo. */
let cursor = 0;

/** Chave -> timestamp em que ela pode voltar a ser usada. */
const cooldowns = new Map<string, number>();

/** Zera cursor e cooldowns. Usado pelos testes e por diagnóstico manual. */
export function resetTavilyKeyState() {
  cursor = 0;
  cooldowns.clear();
}

/** Estado atual do pool, para depuração: chaves em espera e até quando. */
export function tavilyKeyStatus() {
  const keys = loadKeys();
  return {
    total: keys.length,
    current: keys.length > 0 ? cursor % keys.length : 0,
    cooling: keys
      .map((key, index) => ({ index, availableAt: cooldowns.get(key) ?? 0 }))
      .filter((k) => k.availableAt > Date.now()),
  };
}

/**
 * Lê o pool de chaves do ambiente. TAVILY_API_KEYS aceita várias chaves
 * separadas por vírgula; TAVILY_API_KEY (uma só) é somada ao final.
 */
function loadKeys(): string[] {
  const raw = [process.env.TAVILY_API_KEYS, process.env.TAVILY_API_KEY]
    .filter(Boolean)
    .join(",");

  const keys = raw
    .split(/[,;\s]+/)
    .map((k) => k.trim())
    .filter(Boolean);

  return [...new Set(keys)];
}

/** Resposta de /search. */
export interface TavilySearchResponse {
  results?: Array<{ title: string; url: string; content: string; score?: number }>;
  answer?: string;
}

/** Resposta de /extract. */
export interface TavilyExtractResponse {
  results?: Array<{ url: string; title?: string; raw_content?: string | null }>;
  failed_results?: Array<{ url: string; error?: string }>;
}

type TavilyResponse = TavilySearchResponse | TavilyExtractResponse;

/** Corpo de erro da Tavily: { detail: { error: "..." } }. */
interface TavilyErrorBody {
  detail?: { error?: string } | string;
  error?: string;
  message?: string;
}

function responseOf(error: unknown): AxiosResponse<TavilyErrorBody> | undefined {
  return isAxiosError<TavilyErrorBody>(error) ? error.response : undefined;
}

/** Índice da chave cujo cooldown termina primeiro. */
function soonestAvailable(keys: string[]): number {
  let best = 0;
  for (let index = 1; index < keys.length; index++) {
    if ((cooldowns.get(keys[index]) ?? 0) < (cooldowns.get(keys[best]) ?? 0)) {
      best = index;
    }
  }
  return best;
}

function cooldownFor(error: unknown): number {
  const response = responseOf(error);
  const status = response?.status;
  if (status === 401 || status === 403) return INVALID_KEY_COOLDOWN_MS;
  if (status === 432 || status === 433) return QUOTA_COOLDOWN_MS;

  // A Tavily manda Retry-After (em segundos) junto com o 429.
  const retryAfter = Number(response?.headers?.["retry-after"]);
  if (Number.isFinite(retryAfter) && retryAfter > 0) {
    return retryAfter * 1000;
  }

  return RATE_LIMIT_COOLDOWN_MS;
}

/** True quando o erro indica chave esgotada/inválida e vale tentar a próxima. */
function shouldRotate(error: unknown): boolean {
  const status = responseOf(error)?.status;
  if (status === 429 || status === 432 || status === 433) return true;
  if (status === 401 || status === 403) return true;

  // Alguns erros de cota chegam com 400 e a explicação no corpo.
  if (status === 400) {
    const body = responseOf(error)?.data;
    const message = typeof body === "string" ? body : JSON.stringify(body ?? "");
    return /limit|exceeded|quota|credit|usage/i.test(message);
  }

  return false;
}

function describe(error: unknown): string {
  const response = responseOf(error);
  const body = response?.data;
  const fromBody =
    typeof body === "string"
      ? body
      : typeof body?.detail === "string"
        ? body.detail
        : body?.detail?.error || body?.error || body?.message;

  const detail = fromBody || (error instanceof Error ? error.message : String(error));
  return `${response?.status ?? "network"} ${detail}`;
}

async function post(endpoint: string, key: string, payload: Record<string, unknown>) {
  const { data } = await axios.post<TavilyResponse>(
    `${TAVILY_BASE_URL}/${endpoint}`,
    // api_key no corpo é o formato legado; o header Bearer é o atual. Mandar
    // os dois mantém a troca de chave funcionando nas duas formas de auth.
    { api_key: key, ...payload },
    {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
    }
  );
  return data;
}

/**
 * Faz uma requisição à Tavily trocando de chave automaticamente quando a
 * atual estoura o limite de requisições. Percorre todo o pool antes de falhar.
 */
export async function tavilyRequest(
  endpoint: "search",
  payload: Record<string, unknown>
): Promise<TavilySearchResponse>;
export async function tavilyRequest(
  endpoint: "extract",
  payload: Record<string, unknown>
): Promise<TavilyExtractResponse>;
export async function tavilyRequest(
  endpoint: "search" | "extract",
  payload: Record<string, unknown>
): Promise<TavilyResponse> {
  const keys = loadKeys();

  if (keys.length === 0) {
    throw new Error(
      "Nenhuma chave da Tavily configurada. Defina TAVILY_API_KEY ou TAVILY_API_KEYS."
    );
  }

  // Motivo da falha por chave, na ordem em que foram tentadas.
  const failures = new Map<number, string>();

  for (let round = 0; round < 2; round++) {
    // Fixa o ponto de partida: mexer em cursor dentro do laço faria o índice
    // avançar duas vezes por falha, pulando chaves boas do pool.
    const start = cursor;
    const roundStartedAt = Date.now();
    let attempted = 0;

    for (let attempt = 0; attempt < keys.length; attempt++) {
      const index = (start + attempt) % keys.length;
      const key = keys[index];

      // Pula chaves que ainda estão de castigo por limite recente.
      if ((cooldowns.get(key) ?? 0) > roundStartedAt) {
        continue;
      }

      attempted++;
      try {
        const data = await post(endpoint, key, payload);
        cursor = index; // continua nesta chave enquanto ela funcionar
        cooldowns.delete(key);
        return data;
      } catch (error) {
        if (!shouldRotate(error)) {
          throw error;
        }

        cooldowns.set(key, Date.now() + cooldownFor(error));
        cursor = (index + 1) % keys.length;
        failures.set(index, describe(error));
      }
    }

    // Todas em cooldown e nenhuma sequer tentada: o tempo de espera é uma
    // estimativa nossa, então tenta a que libera primeiro em vez de desistir.
    if (attempted === 0) {
      const index = soonestAvailable(keys);
      const key = keys[index];
      try {
        const data = await post(endpoint, key, payload);
        cursor = index;
        cooldowns.delete(key);
        return data;
      } catch (error) {
        if (!shouldRotate(error)) {
          throw error;
        }
        cooldowns.set(key, Date.now() + cooldownFor(error));
        failures.set(index, describe(error));
      }
    }

    // Se alguma chave volta em poucos segundos (429 com Retry-After curto),
    // espera e repete a MESMA requisição, para o cliente não ter que buscar
    // de novo. Esperas longas (cota do plano) falham na hora.
    const waitMs = (cooldowns.get(keys[soonestAvailable(keys)]) ?? 0) - Date.now();
    if (round === 0 && waitMs > 0 && waitMs <= MAX_WAIT_MS) {
      await new Promise((resolve) => setTimeout(resolve, waitMs));
      continue;
    }

    break;
  }

  const motivos = [...failures.entries()]
    .sort(([a], [b]) => a - b)
    .map(([index, reason]) => `chave #${index + 1} (${reason})`);

  throw new Error(
    `Nenhuma das ${keys.length} chaves da Tavily aceitou a requisição: ${motivos.join("; ")}.`
  );
}
