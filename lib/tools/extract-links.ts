import * as cheerio from "cheerio";
import { tavilyRequest } from "../tavily";

export interface ExtractedLink {
  text: string;
  href: string;
  absolute_url: string;
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

  const rawHtml = results[0].raw_content || "";
  const $ = cheerio.load(rawHtml);
  const baseUrl = new URL(url);
  const links: ExtractedLink[] = [];

  $("a[href]").each((_, el) => {
    const href = $(el).attr("href") || "";
    const text = $(el).text().trim().replace(/\s+/g, " ");

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

    links.push({ text: text || href, href, absolute_url });
  });

  // Deduplicate by absolute_url
  const seen = new Set<string>();
  return links.filter((l) => {
    if (seen.has(l.absolute_url)) return false;
    seen.add(l.absolute_url);
    return true;
  });
}
