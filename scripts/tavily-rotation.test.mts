/* eslint-disable @typescript-eslint/no-explicit-any --
 * O teste monta AxiosError na mão e inspeciona erros desconhecidos; `any` aqui
 * é proposital e não sai deste arquivo, que não entra no bundle.
 */
/**
 * Teste da rotação de chaves da Tavily.
 *
 * Não usa chaves reais nem rede: substitui o adapter do axios por um que
 * devolve as respostas de erro documentadas pela Tavily (429, 432, 433, 400).
 *
 * Rodar com: node scripts/tavily-rotation.test.mts
 */
process.env.TAVILY_API_KEYS = "k-one,k-two,k-three";
delete process.env.TAVILY_API_KEY;

import axios from "axios";
import { tavilyRequest, resetTavilyKeyState, tavilyKeyStatus } from "../lib/tavily.ts";

type Reply = { status: number; body: unknown };

/** Define o que cada chave responde na próxima rodada. */
let responder: (key: string, endpoint: string) => Reply = () => ({
  status: 200,
  body: { results: [] },
});

/** Chaves usadas desde o último reset, na ordem. */
let calls: string[] = [];

/** Corpo enviado em cada tentativa, sem a chave — para comparar os payloads. */
let payloads: Record<string, unknown>[] = [];

/** Headers de resposta da próxima rodada (ex: retry-after). */
let replyHeaders: Record<string, string> = {};

axios.defaults.adapter = async (config) => {
  const body = JSON.parse(String(config.data));
  const endpoint = String(config.url).split("/").pop() ?? "";
  const key = body.api_key;
  calls.push(key);

  const params = { ...body };
  delete params.api_key;
  payloads.push(params);

  const reply = responder(key, endpoint);
  const response = {
    data: reply.body,
    status: reply.status,
    statusText: String(reply.status),
    headers: replyHeaders,
    config,
    request: {},
  };

  // Deixa o axios montar o AxiosError igual a uma resposta HTTP real.
  if (reply.status < 200 || reply.status >= 300) {
    const error: any = new Error(`Request failed with status code ${reply.status}`);
    error.isAxiosError = true;
    error.response = response;
    error.config = config;
    throw error;
  }

  return response as any;
};

const tavilyError = (message: string) => ({ detail: { error: message } });

let failed = 0;

function check(label: string, condition: boolean, detail?: unknown) {
  if (condition) {
    console.log(`  ok   ${label}`);
  } else {
    failed++;
    console.log(`  FAIL ${label}`, detail ?? "");
  }
}

/**
 * Cada cenário começa com o pool limpo, a não ser que `keepState` seja true —
 * aí ele continua de onde o cenário anterior parou (para testar o cooldown).
 */
async function scenario(
  label: string,
  reply: (key: string, endpoint: string) => Reply,
  run: () => Promise<void>,
  keepState = false
) {
  console.log(`\n${label}`);
  if (!keepState) resetTavilyKeyState();
  responder = reply;
  replyHeaders = {};
  calls = [];
  payloads = [];
  await run();
}

// 1. Caminho felizIt: usa a primeira chave do pool.
await scenario(
  "1. chave saudável",
  () => ({ status: 200, body: { results: [{ url: "https://example.com" }] } }),
  async () => {
    const data = await tavilyRequest("search", { query: "teste" });
    check("usou apenas k-one", calls.join(",") === "k-one", calls);
    check("devolveu o corpo da Tavily", Array.isArray(data.results));
  }
);

// 2. 429 na primeira chave: precisa repetir a requisição na segunda.
await scenario(
  "2. 429 (limite por minuto) na k-one",
  (key) =>
    key === "k-one"
      ? {
          status: 429,
          body: tavilyError(
            "Your request has been blocked due to excessive requests. Please reduce the rate of requests."
          ),
        }
      : { status: 200, body: { results: [{ url: "https://ok.com" }] } },
  async () => {
    const data = await tavilyRequest("search", { query: "teste" });
    check("tentou k-one e depois k-two", calls.join(",") === "k-one,k-two", calls);
    check("devolveu o resultado da k-two", data.results?.[0]?.url === "https://ok.com", data);
  }
);

// 3. A chave que funcionou vira a padrão e a queimada fica de fora.
await scenario(
  "3. próxima chamada não volta na k-one",
  () => ({ status: 200, body: { results: [] } }),
  async () => {
    await tavilyRequest("search", { query: "teste" });
    check("usou direto a k-two", calls.join(",") === "k-two", calls);
    check("k-one consta como em espera", tavilyKeyStatus().cooling.some((k) => k.index === 0), tavilyKeyStatus());
  },
  true // continua com a k-one em cooldown do cenário 2
);

// 4. 432 é cota do plano: rotaciona para a terceira chave.
await scenario(
  "4. 432 (cota do plano) na k-two",
  (key) =>
    key === "k-two"
      ? {
          status: 432,
          body: tavilyError(
            "This request exceeds your plan's set usage limit. Please upgrade your plan or contact support@tavily.com"
          ),
        }
      : { status: 200, body: { results: [{ url: "https://three.com" }] } },
  async () => {
    const data = await tavilyRequest("extract", { urls: ["https://x.com"] });
    check("pulou a k-one em espera e foi para a k-three", calls.join(",") === "k-two,k-three", calls);
    check("devolveu o resultado da k-three", data.results?.[0]?.url === "https://three.com", data);
  },
  true // k-one segue em cooldown
);

// 5. Erro que não é de limite não deve gastar as outras chaves.
await scenario(
  "5. 500 da Tavily",
  () => ({ status: 500, body: tavilyError("Internal Server Error") }),
  async () => {
    let thrown: any;
    try {
      await tavilyRequest("search", { query: "teste" });
    } catch (error) {
      thrown = error;
    }
    check("propagou o erro", thrown?.response?.status === 500, thrown?.message);
    check("tentou somente uma chave", calls.length === 1, calls);
  }
);

// 6. 400 com texto de cota no corpo também conta como limite.
await scenario(
  "6. 400 mencionando usage limit",
  (key) =>
    key === "k-one"
      ? { status: 400, body: tavilyError("You have exceeded your monthly usage limit") }
      : { status: 200, body: { results: [{ url: "https://rotated.com" }] } },
  async () => {
    const data = await tavilyRequest("search", { query: "teste" });
    check("rotacionou da k-one para a k-two", calls.join(",") === "k-one,k-two", calls);
    check("devolveu resultado da outra chave", data.results?.[0]?.url === "https://rotated.com", data);
  }
);

// 6b. 400 que não é de cota (ex: tópico inválido) não deve rotacionar.
await scenario(
  "6b. 400 comum (bad request)",
  () => ({ status: 400, body: tavilyError("Invalid topic. Must be 'general' or 'news'.") }),
  async () => {
    let thrown: any;
    try {
      await tavilyRequest("search", { query: "teste", topic: "errado" });
    } catch (error) {
      thrown = error;
    }
    check("propagou o 400 sem rotacionar", thrown?.response?.status === 400, thrown?.message);
    check("tentou somente uma chave", calls.length === 1, calls);
    check("não colocou a chave em espera", tavilyKeyStatus().cooling.length === 0, tavilyKeyStatus());
  }
);

// 7. Todas estouradas: a mensagem de erro precisa dizer o motivo de cada uma.
await scenario(
  "7. todas as chaves no limite",
  () => ({ status: 433, body: tavilyError("This request exceeds the pay-as-you-go limit.") }),
  async () => {
    let thrown: any;
    try {
      await tavilyRequest("search", { query: "teste" });
    } catch (error) {
      thrown = error;
    }
    check("tentou as três chaves", calls.join(",") === "k-one,k-two,k-three", calls);
    check("falhou com erro agregado", /Nenhuma das 3 chaves/.test(thrown?.message ?? ""), thrown?.message);
    check("listou as três na mensagem", /#1.*#2.*#3/.test(thrown?.message ?? ""), thrown?.message);
    check("mencionou o motivo da Tavily", /pay-as-you-go/.test(thrown?.message ?? ""), thrown?.message);
    console.log(`       mensagem: ${thrown?.message}`);
  }
);

// 8. Com todas em espera, ainda tenta a que libera primeiro em vez de falhar.
await scenario(
  "8. todas em espera, API já liberada",
  () => ({ status: 200, body: { results: [{ url: "https://recovered.com" }] } }),
  async () => {
    const data = await tavilyRequest("search", { query: "teste" });
    check("tentou uma chave mesmo em cooldown", calls.length === 1, calls);
    check("devolveu resultado", data.results?.[0]?.url === "https://recovered.com", data);
    check("liberou a chave que funcionou", tavilyKeyStatus().cooling.length === 2, tavilyKeyStatus());
  },
  true // todas as chaves ficaram em espera no cenário 7
);

// 9. O requisito central: a busca repetida na outra chave precisa levar
//    exatamente os mesmos parâmetros, sem o cliente refazer a chamada.
await scenario(
  "9. mesmo payload na chave seguinte",
  (key) =>
    key === "k-one"
      ? { status: 429, body: tavilyError("Too many requests") }
      : { status: 200, body: { results: [{ url: "https://ok.com" }] } },
  async () => {
    const params = {
      query: "preço do dólar hoje",
      search_depth: "basic",
      max_results: 7,
      include_answer: false,
    };
    await tavilyRequest("search", { ...params });

    check("duas tentativas, chaves diferentes", calls.join(",") === "k-one,k-two", calls);
    check(
      "payload idêntico nas duas",
      JSON.stringify(payloads[0]) === JSON.stringify(payloads[1]),
      payloads
    );
    check(
      "parâmetros preservados",
      payloads[1]?.query === params.query && payloads[1]?.max_results === 7,
      payloads[1]
    );
  }
);

// 10. Pool de uma chave só com 429 curto: espera o Retry-After e repete,
//     em vez de devolver erro e obrigar a IA a buscar de novo.
process.env.TAVILY_API_KEYS = "k-solo";
await scenario(
  "10. uma chave só, 429 com Retry-After: 1",
  () => {
    const first = calls.length === 1; // a chamada atual já foi registrada
    return first
      ? { status: 429, body: tavilyError("Too many requests") }
      : { status: 200, body: { results: [{ url: "https://depois-da-espera.com" }] } };
  },
  async () => {
    replyHeaders = { "retry-after": "1" };
    const started = Date.now();
    const data = await tavilyRequest("search", { query: "teste" });
    const elapsed = Date.now() - started;

    check("tentou duas vezes a mesma chave", calls.join(",") === "k-solo,k-solo", calls);
    check("esperou o Retry-After", elapsed >= 900 && elapsed < 3000, `${elapsed}ms`);
    check("devolveu resultado sem erro", data.results?.[0]?.url === "https://depois-da-espera.com", data);
    check("mesmo payload na repetição", JSON.stringify(payloads[0]) === JSON.stringify(payloads[1]), payloads);
  }
);

// 11. Retry-After longo: falha na hora, sem travar o cliente MCP esperando.
await scenario(
  "11. uma chave só, Retry-After: 600",
  () => ({ status: 429, body: tavilyError("Too many requests") }),
  async () => {
    replyHeaders = { "retry-after": "600" };
    const started = Date.now();
    let thrown: any;
    try {
      await tavilyRequest("search", { query: "teste" });
    } catch (error) {
      thrown = error;
    }
    const elapsed = Date.now() - started;

    check("falhou rápido", elapsed < 1000, `${elapsed}ms`);
    check("erro explica o motivo", /429/.test(thrown?.message ?? ""), thrown?.message);
  }
);
process.env.TAVILY_API_KEYS = "k-one,k-two,k-three";

console.log(failed === 0 ? "\nTodos os cenários passaram." : `\n${failed} verificação(ões) falharam.`);
process.exit(failed === 0 ? 0 : 1);
