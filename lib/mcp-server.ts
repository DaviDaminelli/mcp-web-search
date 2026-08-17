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
        "Search the web using DuckDuckGo. Returns a list of results with title, URL, and snippet.",
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
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(results, null, 2),
          },
        ],
      };
    }
  );

  // ── read_webpage ────────────────────────────────────────────────────────────
  server.registerTool(
    "read_webpage",
    {
      title: "Read Webpage",
      description:
        "Fetch and extract the content of a webpage. Returns clean text or markdown, stripping ads and navigation.",
      inputSchema: z.object({
        url: z.string().url().describe("The URL to read"),
        mode: z
          .enum(["markdown", "text", "raw_html"])
          .default("markdown")
          .optional()
          .describe("Output format: markdown (default), text, or raw_html"),
      }),
    },
    async ({ url, mode }) => {
      const result = await readWebpage(url, mode ?? "markdown");
      return {
        content: [
          {
            type: "text" as const,
            text: `# ${result.title}\nURL: ${result.url}\nMode: ${result.mode}\nLength: ${result.length} chars\n\n---\n\n${result.content}`,
          },
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
        "Extract all hyperlinks from a webpage. Returns a deduplicated list with link text and absolute URLs.",
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
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(links, null, 2),
          },
        ],
      };
    }
  );
}

