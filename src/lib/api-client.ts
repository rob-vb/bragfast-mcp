import { resolveApiKey } from "./auth.js";
import { deleteCredentials } from "./credentials.js";

const DEFAULT_BASE_URL = "https://brag.fast/api/v1";

async function handleResponse<T>(res: Response): Promise<T> {
  if (res.ok) {
    return res.json() as Promise<T>;
  }

  if (res.status === 401) {
    await deleteCredentials();
    throw new Error("API key is invalid or revoked. Run: npx @bragfast/mcp-server login");
  }

  if (res.status === 429) {
    const retryAfter = res.headers.get("Retry-After") ?? "unknown";
    throw new Error(`Rate limited. Try again in ${retryAfter} seconds`);
  }

  let message: string;
  try {
    const body = (await res.json()) as { error?: string };
    message = body.error ?? `HTTP ${res.status}`;
  } catch {
    message = `HTTP ${res.status}`;
  }
  throw new Error(message);
}

export class BragfastApiClient {
  private baseUrl: string;

  constructor(baseUrl?: string) {
    this.baseUrl = baseUrl ?? process.env.BRAGFAST_API_URL ?? DEFAULT_BASE_URL;
  }

  async get<T>(path: string): Promise<T> {
    const apiKey = await resolveApiKey();
    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}${path}`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
      });
    } catch {
      throw new Error("Cannot reach Bragfast API. Check your internet connection.");
    }
    return handleResponse<T>(res);
  }

  async post<T>(path: string, body: unknown): Promise<T> {
    const apiKey = await resolveApiKey();
    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}${path}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
    } catch {
      throw new Error("Cannot reach Bragfast API. Check your internet connection.");
    }
    return handleResponse<T>(res);
  }
}
