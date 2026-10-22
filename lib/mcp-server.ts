import { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { webSearch } from "./tools/web-search";
import { readWebpage } from "./tools/read-webpage";
import { fetchJson } from "./tools/fetch-json";
import { extractLinks } from "./tools/extract-links";

export function registerTools(server: McpServer) {
  // ── web_search ─────────────────────────────────────────────────────────────
  server.registerTool(
    "web_search",
    {
      title: "Web Search",
      description:
        "Search the web using the Tavily API. Returns a numbered Markdown list of results, each with title, URL, and snippet.",
      inputSchema: z.object({
        query: z.string().describe("The search query"),
        num_results: z
          .number()
          .int()
          .min(1)
          .max(10)
          .default(5)
          .optional()
          .describe("Number of results to return (1-10, default 5)"),
      }),
    },
    async ({ query, num_results }) => {
      const results = await webSearch(query, num_results ?? 5);

      // Markdown compacto em vez de JSON indentado: mesma informação, bem
      // menos tokens no contexto de quem chama.
      const text = results.length
        ? results
            .map((r, i) => `${i + 1}. **${r.title}**\n   ${r.url}\n   ${r.snippet}`)
            .join("\n\n")
        : `No results for "${query}".`;

      return { content: [{ type: "text" as const, text }] };
    }
  );

  // ── read_webpage ────────────────────────────────────────────────────────────
  server.registerTool(
    "read_webpage",
    {
      title: "Read Webpage",
      description:
        "Fetch the content of a webpage as Markdown, bypassing anti-bot blocks. Ads, navigation and layout noise are stripped, and images are reduced to their alt text. HTML is not available: use markdown (default, keeps headings, lists, tables and links) or text (prose only).",
      inputSchema: z.object({
        url: z.string().url().describe("The URL to read"),
        mode: z
          .enum(["markdown", "text"])
          .default("markdown")
          .optional()
          .describe("Output format: markdown (default) or text"),
        query: z
          .string()
          .optional()
          .describe(
            "What you are looking for on the page. Returns only the relevant excerpts instead of the whole page — strongly recommended for long pages, since a full article can run past 100k tokens"
          ),
        chunks_per_source: z
          .number()
          .int()
          .min(1)
          .max(5)
          .optional()
          .describe("How many excerpts to return when query is set (1-5, default 3)"),
        max_chars: z
          .number()
          .int()
          .min(1000)
          .max(500000)
          .optional()
          .describe(
            "Cap on returned characters (default 50000, roughly 12k tokens). Content above the cap is cut and flagged in the output"
          ),
      }),
    },
    async ({ url, mode, query, chunks_per_source, max_chars }) => {
      const result = await readWebpage(url, mode ?? "markdown", {
        query,
        chunksPerSource: chunks_per_source,
        maxChars: max_chars,
      });
      const heading = result.title ? `# ${result.title}\n${result.url}` : result.url;

      return {
        content: [
          { type: "text" as const, text: `${heading}\n\n${result.content}` },
        ],
      };
    }
  );

  // ── fetch_json ──────────────────────────────────────────────────────────────
  server.registerTool(
    "fetch_json",
    {
      title: "Fetch JSON",
      description:
        "Make an HTTP GET request to a URL and return the JSON response. Useful for querying public REST APIs.",
      inputSchema: z.object({
        url: z.string().url().describe("The URL to fetch"),
        headers: z
          .record(z.string(), z.string())
          .optional()
          .describe("Optional HTTP headers to include in the request"),
      }),
    },
    async ({ url, headers }) => {
      const result = await fetchJson(url, headers ?? {});
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    }
  );

  // ── extract_links ───────────────────────────────────────────────────────────
  server.registerTool(
    "extract_links",
    {
      title: "Extract Links",
      description:
        "Extract all hyperlinks from a webpage. Returns a deduplicated Markdown list of 'link text → absolute URL', with relative URLs already resolved.",
      inputSchema: z.object({
        url: z.string().url().describe("The URL to extract links from"),
        filter: z
          .string()
          .optional()
          .describe(
            "Optional substring to filter links (e.g. 'github.com' to only return GitHub links)"
          ),
      }),
    },
    async ({ url, filter }) => {
      const links = await extractLinks(url, filter);

      // Uma linha por link. Em páginas com centenas de links isso economiza
      // muito mais contexto que o JSON indentado — e o href relativo sai, já
      // que a URL absoluta o torna redundante.
      const text = links.length
        ? `${links.length} links:\n\n${links.map((l) => `- ${l.text} → ${l.absolute_url}`).join("\n")}`
        : `No links found${filter ? ` matching "${filter}"` : ""}.`;

      return { content: [{ type: "text" as const, text }] };
    }
  );
}

