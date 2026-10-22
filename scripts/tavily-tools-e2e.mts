/* eslint-disable @typescript-eslint/no-explicit-any --
 * Script de diagnóstico: imprime erros crus. Não entra no bundle.
 */
/**
 * Teste ponta a ponta das três ferramentas que usam a Tavily, com o pool real.
 *
 * Consome créditos (1 search + 2 extract). Rodar com:
 *   node --env-file=.env.local scripts/tavily-tools-e2e.mts
 */
import { webSearch } from "../lib/tools/web-search.ts";
import { readWebpage } from "../lib/tools/read-webpage.ts";
import { extractLinks } from "../lib/tools/extract-links.ts";
import { tavilyKeyStatus } from "../lib/tavily.ts";

const show = (label: string, value: unknown) => console.log(`  ${label}: ${value}`);

console.log(`Pool: ${tavilyKeyStatus().total} chave(s)\n`);

console.log("web_search('modelcontextprotocol spec'):");
try {
  const results = await webSearch("modelcontextprotocol spec", 3);
  show("resultados", results.length);
  show("primeiro", `${results[0]?.source} — ${results[0]?.title?.slice(0, 60)}`);
  show("tem snippet", Boolean(results[0]?.snippet));
} catch (error: any) {
  show("FALHOU", error.message);
}

console.log("\nread_webpage('https://example.com', markdown):");
try {
  const page = await readWebpage("https://example.com", "markdown");
  show("título", page.title || "(vazio)");
  show("tamanho", `${page.length} chars (~${Math.round(page.length / 4)} tokens)`);
  show("truncado", page.truncated);
  show("trecho", JSON.stringify(page.content.slice(0, 80)));
} catch (error: any) {
  show("FALHOU", error.message);
}

console.log("\nextract_links('https://news.ycombinator.com'):");
try {
  const links = await extractLinks("https://news.ycombinator.com");
  show("links", links.length);
  show("primeiro", links[0] ? `${links[0].text.slice(0, 30)} -> ${links[0].absolute_url}` : "(nenhum)");
} catch (error: any) {
  show("FALHOU", error.message);
}

const status = tavilyKeyStatus();
console.log(
  `\nEstado final do pool: chave atual #${status.current + 1}, ${status.cooling.length} em espera` +
    (status.cooling.length > 0
      ? ` (${status.cooling.map((c) => `#${c.index + 1}`).join(", ")})`
      : "")
);
