import { tavilyRequest } from "../tavily";

// A Tavily entrega o conteúdo já em Markdown ou em texto puro — não há HTML no
// caminho. Os modos espelham o parâmetro `format` da API, sem conversão local.
export type ReadMode = "markdown" | "text";

export interface WebpageContent {
  url: string;
  title: string;
  content: string;
  mode: ReadMode;
  length: number;
  truncated: boolean;
}

export interface ReadOptions {
  /** Assunto de interesse: a Tavily devolve só os trechos relevantes. */
  query?: string;
  /** Quantos trechos por página quando há query (1-5, padrão da API: 3). */
  chunksPerSource?: number;
  /** Teto de caracteres devolvidos. */
  maxChars?: number;
}

// Uma página inteira pode passar de 500 mil caracteres (~140 mil tokens) e
// estourar o contexto de quem chamou. 50 mil (~12 mil tokens) é um teto que
// ainda cabe um artigo longo; acima disso o corte é avisado no conteúdo.
const DEFAULT_MAX_CHARS = 50_000;

// Linha de tabela sem nenhum conteúdo: "|  |  |  |".
const EMPTY_ROW = /^\s*\|(?:\s*\|)+\s*$/;

// Linha separadora de tabela: "| --- | :-: |".
const SEPARATOR_ROW = /^\s*\|(?:\s*:?-{2,}:?\s*\|)+\s*$/;

// Três ou mais células vazias seguidas dentro de uma linha.
const EMPTY_CELLS = /\|(?:\s*\|){3,}/g;

// Duas ou mais células separadoras no meio de uma linha com conteúdo: sobra de
// tabela aninhada usada só para layout. Linhas que são *só* separador não
// passam por aqui, para não quebrar tabela de verdade.
const INLINE_SEPARATORS = /\|(?:\s*:?-{2,}:?\s*\|){2,}/g;

/**
 * Enxuga o Markdown para gastar menos tokens sem perder conteúdo.
 *
 * Sites montados com tabelas de layout (Hacker News é o caso extremo) rendem
 * dezenas de linhas de `|  |  |  |` e separadores soltos, que só consomem
 * contexto. Remove esse ruído, normaliza espaços e colapsa linhas em branco.
 */
export function tidyMarkdown(markdown: string): string {
  const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
  const kept: string[] = [];

  for (const line of lines) {
    let trimmed = line.replace(EMPTY_CELLS, "|").replace(/\s+$/, "");

    if (EMPTY_ROW.test(trimmed)) {
      continue;
    }

    if (SEPARATOR_ROW.test(trimmed)) {
      // Separador só faz sentido abaixo de um cabeçalho de tabela de verdade.
      const previous = kept[kept.length - 1] ?? "";
      if (!previous.includes("|") || EMPTY_ROW.test(previous)) {
        continue;
      }
    } else {
      trimmed = trimmed.replace(INLINE_SEPARATORS, "|").replace(EMPTY_CELLS, "|");
    }

    kept.push(trimmed);
  }

  return kept.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

/**
 * Corta o conteúdo no teto de caracteres, avisando no próprio texto o que
 * ficou de fora — para o modelo saber que a página continua e como pedir o
 * resto, em vez de concluir que leu tudo.
 */
export function truncateContent(
  content: string,
  maxChars: number
): { content: string; truncated: boolean } {
  if (content.length <= maxChars) {
    return { content, truncated: false };
  }

  // Corta em quebra de linha para não partir um link ou uma palavra no meio.
  const slice = content.slice(0, maxChars);
  const lastBreak = slice.lastIndexOf("\n");
  const kept = (lastBreak > maxChars * 0.8 ? slice.slice(0, lastBreak) : slice).trimEnd();

  return {
    content:
      `${kept}\n\n[Truncated: ${kept.length} of ${content.length} characters shown. ` +
      `Pass a "query" to get only the relevant parts of the page, or raise "max_chars".]`,
    truncated: true,
  };
}

export async function readWebpage(
  url: string,
  mode: ReadMode = "markdown",
  options: ReadOptions = {}
): Promise<WebpageContent> {
  const { query, chunksPerSource, maxChars = DEFAULT_MAX_CHARS } = options;

  // O /extract da Tavily lê a página pelo lado dela, sem levar bloqueio
  // anti-bot, e já devolve o conteúdo no formato pedido. Com query, ela
  // reordena e recorta a página nos trechos relevantes — o que economiza
  // muito mais contexto que qualquer limpeza de Markdown.
  const data = await tavilyRequest("extract", {
    urls: [url],
    format: mode,
    ...(query ? { query, ...(chunksPerSource ? { chunks_per_source: chunksPerSource } : {}) } : {}),
  });

  const result = data.results?.[0];
  if (!result) {
    const failure = data.failed_results?.[0]?.error;
    throw new Error(
      failure ? `Failed to extract content from URL: ${failure}` : "Failed to extract content from URL."
    );
  }

  const tidy = tidyMarkdown(result.raw_content || "");
  const { content, truncated } = truncateContent(tidy, maxChars);

  return {
    url,
    title: result.title || "",
    content,
    mode,
    length: content.length,
    truncated,
  };
}
