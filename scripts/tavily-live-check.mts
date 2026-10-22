/* eslint-disable @typescript-eslint/no-explicit-any --
 * Script de diagnóstico: inspeciona erros crus da API. Não entra no bundle.
 */
/**
 * Checagem contra a API real da Tavily.
 *
 * Confirma: (1) cada chave do pool está válida, (2) o formato do corpo de erro
 * que o parser de rotação espera, (3) a troca de chave num pool com uma chave
 * inválida na frente.
 *
 * Consome 1 crédito por chave. Rodar com:
 *   node --env-file=.env.local scripts/tavily-live-check.mts
 */
import axios from "axios";
import { tavilyRequest, resetTavilyKeyState } from "../lib/tavily.ts";

const mask = (key: string) => `...${key.slice(-4)}`;

const poolFromEnv = [process.env.TAVILY_API_KEYS, process.env.TAVILY_API_KEY]
  .filter(Boolean)
  .join(",")
  .split(/[,;\s]+/)
  .map((k) => k.trim())
  .filter(Boolean);

console.log(`Chaves no pool: ${poolFromEnv.length} (${poolFromEnv.map(mask).join(", ")})\n`);

// 1. Cada chave isoladamente, para saber se alguma já está esgotada.
for (const key of poolFromEnv) {
  process.env.TAVILY_API_KEYS = key;
  resetTavilyKeyState();
  try {
    const data = await tavilyRequest("search", { query: "tavily api", max_results: 1 });
    console.log(`  ok   chave ${mask(key)}: ${data.results?.length ?? 0} resultado(s)`);
  } catch (error: any) {
    const status = error?.response?.status;
    console.log(
      `  FAIL chave ${mask(key)}: ${status ?? "sem status"} ${JSON.stringify(
        error?.response?.data ?? error.message
      )}`
    );
  }
}

// 2. Forma real do corpo de erro de uma chave inválida (sem gastar crédito).
console.log("\nCorpo de erro com chave inválida:");
try {
  await axios.post(
    "https://api.tavily.com/search",
    { api_key: "tvly-dev-chave-invalida-para-teste", query: "tavily api" },
    { headers: { Authorization: "Bearer tvly-dev-chave-invalida-para-teste" } }
  );
  console.log("  FAIL a API aceitou uma chave inválida");
} catch (error: any) {
  const data = error?.response?.data;
  console.log(`  status: ${error?.response?.status}`);
  console.log(`  body:   ${JSON.stringify(data)}`);
  console.log(`  detail.error legível: ${typeof data?.detail?.error === "string"}`);
}

// 3. Pool com chave inválida na frente: a rotação precisa salvar a requisição.
console.log("\nRotação com chave inválida na frente do pool:");
process.env.TAVILY_API_KEYS = ["tvly-dev-chave-invalida-para-teste", ...poolFromEnv].join(",");
resetTavilyKeyState();
try {
  const data = await tavilyRequest("search", { query: "tavily api", max_results: 1 });
  console.log(`  ok   rotacionou e buscou: ${data.results?.length ?? 0} resultado(s)`);
} catch (error: any) {
  console.log(`  FAIL ${error.message}`);
}
