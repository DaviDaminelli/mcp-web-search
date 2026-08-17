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
  const stringHeaders = Object.fromEntries(
    Object.entries(headers).map(([k, v]) => [k, String(v)])
  );

  try {
    const response = await axios.get(url, {
      timeout: 30000,
      headers: {
        Accept: "application/json",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        ...stringHeaders,
      },
    });

    return {
      url,
      status: response.status,
      data: response.data,
    };
  } catch (error: any) {
    if (error.response) {
      return {
        url,
        status: error.response.status,
        data: error.response.data,
      };
    }
    throw error;
  }
}
