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
  private directToken?: string;

  constructor(baseUrl?: string) {
    this.baseUrl = baseUrl ?? process.env.BRAGFAST_API_URL ?? DEFAULT_BASE_URL;
  }

  get apiBaseUrl(): string {
    return this.baseUrl;
  }

  static withToken(apiKey: string, baseUrl?: string): BragfastApiClient {
    const client = new BragfastApiClient(baseUrl);
    client.directToken = apiKey;
    return client;
  }

  private async resolveKey(): Promise<string> {
    return this.directToken ?? resolveApiKey();
  }

  async get<T>(path: string): Promise<T> {
    const apiKey = await this.resolveKey();
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
    const apiKey = await this.resolveKey();
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

  async putRaw<T>(path: string, body: Uint8Array, contentType: string): Promise<T> {
    const apiKey = await this.resolveKey();
    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}${path}`, {
        method: "PUT",
        headers: {
          "Content-Type": contentType,
          // No Authorization header — chunked part PUTs are HMAC-signed via query params
        },
        body: body as unknown as BodyInit,
      });
    } catch {
      throw new Error("Cannot reach Bragfast API. Check your internet connection.");
    }
    return handleResponse<T>(res);
  }

  async postRaw<T>(path: string): Promise<T> {
    const apiKey = await this.resolveKey();
    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}${path}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
      });
    } catch {
      throw new Error("Cannot reach Bragfast API. Check your internet connection.");
    }
    return handleResponse<T>(res);
  }

  async postMultipart<T>(path: string, formData: FormData): Promise<T> {
    const apiKey = await this.resolveKey();
    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}${path}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
        body: formData,
      });
    } catch {
      throw new Error("Cannot reach Bragfast API. Check your internet connection.");
    }
    return handleResponse<T>(res);
  }
}
