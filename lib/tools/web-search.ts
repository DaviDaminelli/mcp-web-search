import { tavilyRequest } from "../tavily";

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
  source: string;
}

export async function webSearch(
  query: string,
  numResults: number = 5
): Promise<SearchResult[]> {
  // A troca de chave em caso de limite é feita dentro de tavilyRequest.
  const data = await tavilyRequest("search", {
    query: query,
    search_depth: "basic",
    include_answer: false,
    include_images: false,
    include_raw_content: false,
    max_results: numResults,
  });

  if (!data || !data.results) {
    return [];
  }

  return data.results.map((r) => ({
    title: r.title,
    url: r.url,
    snippet: r.content,
    source: new URL(r.url).hostname,
  }));
}
