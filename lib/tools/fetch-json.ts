import axios from "axios";

export interface FetchJsonResult {
  url: string;
  status: number;
  data: unknown;
}

export async function fetchJson(
  url: string,
  headers: Record<string, unknown> = {}
): Promise<FetchJsonResult> {
  // Convert all header values to strings
  const stringHeaders = Object.fromEntries(
    Object.entries(headers).map(([k, v]) => [k, String(v)])
  );

  const response = await axios.get(url, {
    timeout: 30000,
    headers: {
      Accept: "application/json",
      "User-Agent": "mcp-web-search/1.0",
      ...stringHeaders,
    },
  });

  return {
    url,
    status: response.status,
    data: response.data,
  };
}
