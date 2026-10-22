import { tavilyRequest } from "../tavily";

export interface ExtractedLink {
  text: string;
  href: string;
  absolute_url: string;
}

// O /extract da Tavily devolve o conteúdo em Markdown, não em HTML. Por isso
// os links são procurados nas formas de link do Markdown:
//   [texto](url)   ·  <url>  ·  url solta no meio do texto
const INLINE_LINK = /(!?)\[([^\]\n]*)\]\(\s*((?:[^()\s]|\([^()]*\))+?)(?:\s+"[^"]*")?\s*\)/g;

// Imagens. São trocadas pelo próprio alt antes da busca por links: assim um
// link que embrulha imagem — [ ![logo](a.svg) ](/) , comum em logo e badge —
// deixa de esconder o destino atrás do `]` da imagem.
const IMAGE = /!\[([^\]\n]*)\]\(\s*(?:[^()\s]|\([^()]*\))+?(?:\s+"[^"]*")?\s*\)/g;
const AUTOLINK = /<([^<>\s]+)>/g;
const BARE_URL = /https?:\/\/[^\s<>()[\]"'`]+/g;

// Um `<...>` sem espaços quase sempre é autolink, mas pode ser uma tag que
// sobrou de bloco de código. Estas são descartadas.
const HTML_TAGS = new Set([
  "a", "b", "body", "br", "code", "div", "em", "h1", "h2", "h3", "h4", "h5",
  "h6", "head", "hr", "html", "i", "img", "li", "ol", "p", "pre", "script",
  "span", "strong", "style", "table", "td", "th", "tr", "ul",
]);

/**
 * Extrai os links de um conteúdo em Markdown. Separado de extractLinks para
 * poder ser testado sem chamar a API.
 */
export function parseMarkdownLinks(
  markdown: string,
  base: string,
  filter?: string
): ExtractedLink[] {
  const content = markdown.replace(IMAGE, (_match, alt) => ` ${alt} `);
  const baseUrl = new URL(base);
  const links: ExtractedLink[] = [];
  const seen = new Set<string>();

  const add = (rawHref: string, rawText: string) => {
    const href = rawHref.trim();

    if (!href || href.startsWith("#") || href.startsWith("javascript:")) {
      return;
    }

    let absolute_url: string;
    try {
      absolute_url = new URL(href, baseUrl).href;
    } catch {
      return;
    }

    if (filter && !absolute_url.includes(filter)) {
      return;
    }

    // Mantém a primeira ocorrência, que é a que tem o melhor texto.
    if (seen.has(absolute_url)) {
      return;
    }
    seen.add(absolute_url);

    const text = rawText.trim().replace(/\s+/g, " ");
    links.push({ text: text || href, href, absolute_url });
  };

  for (const [, bang, text, href] of content.matchAll(INLINE_LINK)) {
    if (bang) continue; // ![alt](src) é imagem, não link
    add(href, text);
  }

  for (const [, target] of content.matchAll(AUTOLINK)) {
    if (HTML_TAGS.has(target.replace(/^\//, "").toLowerCase())) continue;
    add(target, target);
  }

  for (const [match] of content.matchAll(BARE_URL)) {
    add(match, match);
  }

  return links;
}

export async function extractLinks(
  url: string,
  filter?: string
): Promise<ExtractedLink[]> {
  // Usando a API de extração do Tavily para garantir que não seremos bloqueados
  const data = await tavilyRequest("extract", {
    urls: [url],
    include_raw_content: true,
  });

  const results = data.results;
  if (!results || results.length === 0) {
    throw new Error("Failed to extract content from URL.");
  }

  return parseMarkdownLinks(results[0].raw_content || "", url, filter);
}
