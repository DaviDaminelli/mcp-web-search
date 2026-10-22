/**
 * Utilidades de Markdown compartilhadas pelas ferramentas.
 *
 * A Tavily entrega tudo em Markdown, então estas peças aparecem tanto na
 * leitura de página quanto na extração de links.
 */

/**
 * Imagem em Markdown: `![alt](src "título")`.
 *
 * A alternância `[^()\s]|\([^()]*\)` cobre URL com um nível de parênteses,
 * como as da Wikipédia.
 */
export const IMAGE = /!\[([^\]\n]*)\]\(\s*(?:[^()\s]|\([^()]*\))+?(?:\s+"[^"]*")?\s*\)/g;

/**
 * Troca cada imagem pelo seu texto alternativo.
 *
 * Para a IA que consome o MCP, a URL do arquivo é peso morto — caminhos de CDN
 * passam de 100 caracteres e não dizem nada sobre o conteúdo —, enquanto o alt
 * costuma descrever a imagem. Também desarma o caso `[![alt](img)](destino)`,
 * em que a imagem esconde o link que de fato interessa.
 */
export function replaceImagesWithAlt(markdown: string): string {
  return markdown.replace(IMAGE, (_match, alt: string) => (alt ? ` ${alt} ` : " "));
}
