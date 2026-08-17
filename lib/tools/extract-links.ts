import axios from "axios";
import * as cheerio from "cheerio";

export interface ExtractedLink {
  text: string;
  href: string;
  absolute_url: string;
}

export async function extractLinks(
  url: string,
  filter?: string
): Promise<ExtractedLink[]> {
  const response = await axios.get(url, {
    timeout: 30000,
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    },
  });

  const $ = cheerio.load(response.data);
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
