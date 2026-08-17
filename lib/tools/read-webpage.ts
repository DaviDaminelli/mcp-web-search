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
  const response = await axios.get(url, {
    timeout: 30000,
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    },
    maxContentLength: 5 * 1024 * 1024, // 5MB max
  });

  if (mode === "raw_html") {
    return {
      url,
      title: "",
      content: response.data,
      mode,
      length: response.data.length,
    };
  }

  const $ = cheerio.load(response.data);

  // Extract title
  const title = $("title").text().trim() || $("h1").first().text().trim() || "";

  // Remove non-content elements
  $(
    "script, style, noscript, nav, footer, header, aside, [aria-hidden='true'], .cookie-banner, #cookie-banner, .ads, .advertisement"
  ).remove();

  // Get main content area if possible, fallback to body
  const mainEl =
    $("main, article, [role='main'], .content, .post-content, #content").first();
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
