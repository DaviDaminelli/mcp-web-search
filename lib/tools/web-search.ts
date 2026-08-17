import axios from "axios";

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
  // Lê a chave das variáveis de ambiente. Se não existir, usa a fornecida.
  const apiKey = process.env.TAVILY_API_KEY || "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";
  
  if (!apiKey) {
    throw new Error("TAVILY_API_KEY is not configured.");
  }

  const response = await axios.post(
    "https://api.tavily.com/search",
    {
      api_key: apiKey,
      query: query,
      search_depth: "basic",
      include_answer: false,
      include_images: false,
      include_raw_content: false,
      max_results: numResults,
    },
    {
      headers: {
        "Content-Type": "application/json",
      },
    }
  );

  if (!response.data || !response.data.results) {
    return [];
  }

  return response.data.results.map((r: any) => ({
    title: r.title,
    url: r.url,
    snippet: r.content,
    source: new URL(r.url).hostname,
  }));
}
