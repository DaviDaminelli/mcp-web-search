import { search, SafeSearchType } from "duck-duck-scrape";

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
  const results = await search(query, {
    safeSearch: SafeSearchType.MODERATE,
  });

  if (!results || !results.results) {
    return [];
  }

  return results.results.slice(0, numResults).map((r) => ({
    title: r.title,
    url: r.url,
    snippet: r.description || "",
    source: new URL(r.url).hostname,
  }));
}
