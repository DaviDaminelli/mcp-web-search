/**
 * Teste do parser de links do extract_links.
 *
 * Não usa rede nem crédito: roda sobre Markdown fixo, inclusive um trecho real
 * do que o /extract da Tavily devolveu para news.ycombinator.com.
 *
 * Rodar com: node --import ./scripts/ts-resolver.mjs scripts/extract-links.test.mts
 */
import { parseMarkdownLinks } from "../lib/tools/extract-links.ts";

let failed = 0;

function check(label: string, condition: boolean, detail?: unknown) {
  if (condition) {
    console.log(`  ok   ${label}`);
  } else {
    failed++;
    console.log(`  FAIL ${label}`, detail ?? "");
  }
}

// Trecho real da resposta do /extract (tabelas de layout do HN em Markdown).
const HN_SNIPPET = `|  |  |  |  |
| --- | --- | --- | --- |
| |  |  |  | | --- | --- | --- | |  | **[Hacker News](news)**[new](newest) | [past](front) | [comments](newcomments) | <ask> | <show> | <jobs> | <submit> | [login](login?goto=news) | |
|
| |  |  |  | | --- | --- | --- | | 1. |  | [Today's PHP security release](https://externo.com/php) | ([externo.com](from?site=externo.com)) |`;

console.log("1. Markdown real do Hacker News");
{
  const links = parseMarkdownLinks(HN_SNIPPET, "https://news.ycombinator.com");
  const urls = links.map((l) => l.absolute_url);

  check("achou links", links.length > 0, links.length);
  check(
    "resolveu relativo",
    urls.includes("https://news.ycombinator.com/newest"),
    urls.slice(0, 8)
  );
  check(
    "manteve a query string",
    urls.includes("https://news.ycombinator.com/login?goto=news"),
    urls
  );
  check("pegou o autolink <ask>", urls.includes("https://news.ycombinator.com/ask"), urls);
  check("pegou o link externo", urls.includes("https://externo.com/php"), urls);
  check(
    "texto limpo, sem markdown",
    links.find((l) => l.absolute_url.endsWith("/news"))?.text === "Hacker News",
    links.find((l) => l.absolute_url.endsWith("/news"))
  );
  console.log(`       ${links.length} links: ${urls.slice(0, 4).join(", ")} ...`);
}

console.log("\n2. Casos de borda");
{
  const markdown = [
    "![logo](/img/logo.png) texto",
    "[imagem com link](/com-link)",
    "[parênteses](https://pt.wikipedia.org/wiki/Fulano_(ator))",
    '[com título](/titulo "Um título")',
    "[âncora](#secao) e [script](javascript:alert(1))",
    "<https://autolink.com/pagina>",
    "<br> <div> </p>",
    "url solta: https://solta.com/x?a=1 fim",
    "[dup](/mesma) e [dup de novo](/mesma)",
    "[vazio]()",
  ].join("\n\n");

  const links = parseMarkdownLinks(markdown, "https://exemplo.com/base/pagina");
  const urls = links.map((l) => l.absolute_url);

  check("ignorou imagem ![]()", !urls.includes("https://exemplo.com/img/logo.png"), urls);
  check("manteve link normal", urls.includes("https://exemplo.com/com-link"), urls);
  check(
    "URL com parênteses inteira",
    urls.includes("https://pt.wikipedia.org/wiki/Fulano_(ator)"),
    urls
  );
  check("descartou o título do link", urls.includes("https://exemplo.com/titulo"), urls);
  check("ignorou âncora #", !urls.some((u) => u.includes("#secao")), urls);
  check("ignorou javascript:", !urls.some((u) => u.startsWith("javascript:")), urls);
  check("pegou autolink <url>", urls.includes("https://autolink.com/pagina"), urls);
  check("ignorou tags HTML soltas", !urls.some((u) => /\/(br|div|p)$/.test(u)), urls);
  check("pegou URL solta no texto", urls.includes("https://solta.com/x?a=1"), urls);
  check(
    "deduplicou",
    urls.filter((u) => u === "https://exemplo.com/mesma").length === 1,
    urls
  );
  check("ignorou link vazio", !urls.includes("https://exemplo.com/base/pagina"), urls);
  check(
    "relativo resolvido contra o diretório base",
    urls.includes("https://exemplo.com/com-link"),
    urls
  );
}

console.log("\n2b. Link que embrulha imagem (logo, badge, thumbnail)");
{
  // Forma real da home do modelcontextprotocol.io, com logo claro e escuro.
  const markdown = [
    "[Model Context Protocol home page![light logo](https://cdn.com/logo/light.svg?s=1)![dark logo](https://cdn.com/logo/dark.svg)](/)",
    "[![Build status](https://ci.com/badge.svg)](https://ci.com/projeto/123)",
  ].join("\n\n");

  const links = parseMarkdownLinks(markdown, "https://exemplo.com/docs/pagina");
  const urls = links.map((l) => l.absolute_url);

  check("destino do logo, não o .svg", urls.includes("https://exemplo.com/"), urls);
  check("nenhuma imagem na lista", !urls.some((u) => u.endsWith(".svg")), urls);
  check("destino do badge", urls.includes("https://ci.com/projeto/123"), urls);
  check(
    "alt da imagem vira o texto do link",
    links.find((l) => l.absolute_url === "https://ci.com/projeto/123")?.text === "Build status",
    links
  );
  check("dois links, nada além disso", links.length === 2, links);
}

console.log("\n3. Filtro por substring");
{
  const markdown = "[a](https://github.com/um) [b](https://outro.com/dois) [c](https://github.com/tres)";
  const links = parseMarkdownLinks(markdown, "https://exemplo.com", "github.com");

  check("só os que casam com o filtro", links.length === 2, links.map((l) => l.absolute_url));
  check(
    "nenhum fora do filtro",
    links.every((l) => l.absolute_url.includes("github.com")),
    links
  );
}

console.log("\n4. Conteúdo sem links");
{
  const links = parseMarkdownLinks("Só texto puro, sem nada clicável.", "https://exemplo.com");
  check("devolveu lista vazia", links.length === 0, links);
}

console.log(failed === 0 ? "\nTodos os cenários passaram." : `\n${failed} verificação(ões) falharam.`);
process.exit(failed === 0 ? 0 : 1);
