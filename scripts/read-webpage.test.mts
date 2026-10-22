/**
 * Teste da limpeza de Markdown do read_webpage.
 *
 * Sem rede e sem crédito. O trecho do Hacker News é saída real do /extract.
 *
 * Rodar com: node --import ./scripts/ts-resolver.mjs scripts/read-webpage.test.mts
 */
import { tidyMarkdown, truncateContent } from "../lib/tools/read-webpage.ts";

let failed = 0;

function check(label: string, condition: boolean, detail?: unknown) {
  if (condition) {
    console.log(`  ok   ${label}`);
  } else {
    failed++;
    console.log(`  FAIL ${label}`, detail ?? "");
  }
}

console.log("1. Tabelas de layout (saída real do Hacker News)");
{
  const raw = `|  |  |  |  |
| --- | --- | --- | --- |
| |  |  |  | | --- | --- | --- | |  | **[Hacker News](news)** | [new](newest) | |
|
|  |  |
| --- | --- |
| | 1. | [Today's PHP security release](https://externo.com/php) |`;

  const tidy = tidyMarkdown(raw);

  check("encolheu", tidy.length < raw.length, `${raw.length} -> ${tidy.length}`);
  check("sem linha de células vazias", !/^\s*\|(\s*\|)+\s*$/m.test(tidy), tidy);
  check("manteve o link principal", tidy.includes("[Hacker News](news)"), tidy);
  check("manteve o link da notícia", tidy.includes("https://externo.com/php"), tidy);
  check("manteve o texto da notícia", tidy.includes("Today's PHP security release"), tidy);
  console.log(`       ${raw.length} -> ${tidy.length} chars (-${Math.round((1 - tidy.length / raw.length) * 100)}%)`);
}

console.log("\n2. Tabela de verdade fica intacta");
{
  const raw = `| Produto | Preço |
| --- | --- |
| Café | R$ 20 |
| Chá | R$ 15 |`;

  const tidy = tidyMarkdown(raw);

  check("cabeçalho preservado", tidy.includes("| Produto | Preço |"), tidy);
  check("separador preservado", tidy.includes("| --- | --- |"), tidy);
  check("linhas de dados preservadas", tidy.includes("| Café | R$ 20 |"), tidy);
  check("nada foi removido", tidy === raw, tidy);
}

console.log("\n3. Normalizações");
{
  const raw = "# Título   \n\n\n\n\nParágrafo com espaço no fim   \n\n\n- item\n\n\n\n";
  const tidy = tidyMarkdown(raw);

  check("colapsou linhas em branco", !/\n{3,}/.test(tidy), JSON.stringify(tidy));
  check("removeu espaço no fim da linha", !/ \n/.test(tidy), JSON.stringify(tidy));
  check("sem sobra nas pontas", tidy === tidy.trim(), JSON.stringify(tidy));
  check("conteúdo intacto", tidy.includes("# Título") && tidy.includes("- item"), tidy);
}

console.log("\n4. Separador órfão, sem cabeçalho acima");
{
  const tidy = tidyMarkdown("Texto solto\n\n| --- | --- |\n\nMais texto");
  check("separador órfão removido", !tidy.includes("---"), tidy);
  check("texto preservado", tidy.includes("Texto solto") && tidy.includes("Mais texto"), tidy);
}

console.log("\n5. Entradas degeneradas");
{
  check("string vazia", tidyMarkdown("") === "", tidyMarkdown(""));
  check("só ruído de tabela", tidyMarkdown("|  |  |\n| --- | --- |") === "", tidyMarkdown("|  |  |\n| --- | --- |"));
  check("CRLF normalizado", !tidyMarkdown("a\r\nb").includes("\r"), JSON.stringify(tidyMarkdown("a\r\nb")));
}

console.log("\n5b. Imagens viram alt (URL de CDN fora do contexto)");
{
  // Forma real do catálogo da MANN-FILTER, onde cada imagem carrega um caminho
  // de CDN com mais de 100 caracteres.
  const raw = [
    '![MANN-FILTER logo](/en/_jcr_content/mainBrandLogo.coreimg.svg/1762774610821/logo.svg "MANN-FILTER logo")',
    "## Dealer Finder",
    '![The MANN-FILTER Online Catalog for different devices](/en/applications/_jcr_content/teasers/item1.coreimg.jpeg/1784879702296/mann-filter-online-catalog-mockup-desktop-mobile.jpeg "MANN-FILTER Online Catalogs")',
    "Texto do produto C 23 21.",
    "![](/decorativa-sem-alt.png)",
    "[![Baixar catálogo](/icone.svg)](/downloads/catalogo.pdf)",
  ].join("\n\n");

  const tidy = tidyMarkdown(raw);

  check("nenhuma URL de imagem sobrou", !/\.(svg|jpeg|jpg|png)/.test(tidy), tidy);
  check("alt preservado", tidy.includes("MANN-FILTER logo"), tidy);
  check("título preservado", tidy.includes("## Dealer Finder"), tidy);
  check("texto preservado", tidy.includes("Texto do produto C 23 21."), tidy);
  check("imagem sem alt sumiu por completo", !tidy.includes("decorativa"), tidy);
  check(
    "link que embrulha imagem mantém o destino",
    tidy.includes("](/downloads/catalogo.pdf)") && tidy.includes("Baixar catálogo"),
    tidy
  );
  console.log(`       ${raw.length} -> ${tidy.length} chars (-${Math.round((1 - tidy.length / raw.length) * 100)}%)`);
}

console.log("\n6. Teto de caracteres");
{
  const curto = truncateContent("conteúdo curto", 1000);
  check("abaixo do teto passa intacto", curto.content === "conteúdo curto" && !curto.truncated, curto);

  const exato = truncateContent("12345", 5);
  check("no limite exato não corta", !exato.truncated, exato);

  const linhas = Array.from({ length: 200 }, (_, i) => `linha ${i} com algum conteúdo`).join("\n");
  const cortado = truncateContent(linhas, 500);

  check("marcou como truncado", cortado.truncated, cortado.truncated);
  check("respeitou a ordem de grandeza do teto", cortado.content.length < 800, cortado.content.length);
  check("avisou o corte no texto", cortado.content.includes("[Truncated:"), cortado.content.slice(-120));
  check("informou o total original", cortado.content.includes(`of ${linhas.length} characters`), cortado.content.slice(-120));
  check("sugeriu query e max_chars", /query/.test(cortado.content) && /max_chars/.test(cortado.content), cortado.content.slice(-120));
  check("cortou em quebra de linha", !/linha \d+ com algu$/.test(cortado.content.split("\n\n[Truncated")[0]), cortado.content.split("\n\n[Truncated")[0].slice(-40));
  check("começo preservado", cortado.content.startsWith("linha 0 com algum conteúdo"), cortado.content.slice(0, 40));

  // Sem quebra de linha útil, o corte é no caractere, sem estourar o teto.
  const semQuebra = truncateContent("x".repeat(1000), 100);
  check("corta mesmo sem quebra de linha", semQuebra.content.startsWith("x".repeat(100)), semQuebra.content.slice(0, 20));
  check("avisa também nesse caso", semQuebra.content.includes("[Truncated:"), semQuebra.content.slice(-80));
}

console.log(failed === 0 ? "\nTodos os cenários passaram." : `\n${failed} verificação(ões) falharam.`);
process.exit(failed === 0 ? 0 : 1);
