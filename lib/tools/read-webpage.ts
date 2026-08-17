import axios from "axios";
import * as cheerio from "cheerio";
import TurndownService from "turndown";

export type ReadMode = "markdown" | "text" | "raw_html";

export interface WebpageContent {
  url: string;
  title: string;
  content: string;
  mode: ReadMode;
  length: number;
}

const turndown = new TurndownService({
  headingStyle: "atx",
  bulletListMarker: "-",
  codeBlockStyle: "fenced",
});

export async function readWebpage(
  url: string,
  mode: ReadMode = "markdown"
): Promise<WebpageContent> {
  const apiKey = process.env.TAVILY_API_KEY || "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";
  
  if (!apiKey) {
    throw new Error("TAVILY_API_KEY is not configured.");
  }

  // Usando a API de extração do Tavily para burlar bloqueios de scraping
  const response = await axios.post("https://api.tavily.com/extract", {
    api_key: apiKey,
    urls: [url],
    include_raw_content: true,
  });

  const results = response.data.results;
  if (!results || results.length === 0) {
    throw new Error("Failed to extract content from URL.");
  }

  const rawHtml = results[0].raw_content || "";
  const pageTitle = results[0].title || "";

  if (mode === "raw_html") {
    return {
      url,
      title: pageTitle,
      content: rawHtml,
      mode,
      length: rawHtml.length,
    };
  }

  const $ = cheerio.load(rawHtml);

  // Extract title
  const title = pageTitle || $("title").text().trim() || $("h1").first().text().trim() || "";

  // Remove non-content elements
  $(
    "script, style, noscript, nav, footer, header, aside, [aria-hidden='true'], .cookie-banner, #cookie-banner, .ads, .advertisement"
  ).remove();

  const mainEl = $("main, article, [role='main'], .content, .post-content, #content").first();
  const contentEl = mainEl.length ? mainEl : $("body");

  if (mode === "text") {
    const text = contentEl
      .text()
      .replace(/\n{3,}/g, "\n\n")
      .trim();
    return { url, title, content: text, mode, length: text.length };
  }

  // markdown mode
  const markdown = turndown.turndown(contentEl.html() || "");
  const cleaned = markdown.replace(/\n{3,}/g, "\n\n").trim();

  return { url, title, content: cleaned, mode, length: cleaned.length };
}
