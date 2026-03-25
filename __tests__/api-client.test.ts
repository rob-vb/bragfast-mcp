import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// Mock auth and credentials modules
vi.mock("../src/lib/auth.js", () => ({
  resolveApiKey: vi.fn(),
}));

vi.mock("../src/lib/credentials.js", () => ({
  readCredentials: vi.fn(),
  writeCredentials: vi.fn(),
  deleteCredentials: vi.fn(),
  _testing: { setCredsDir: vi.fn(), resetCredsDir: vi.fn() },
}));

import { BragfastApiClient } from "../src/lib/api-client.js";
import * as auth from "../src/lib/auth.js";
import * as credentials from "../src/lib/credentials.js";

const mockResolveApiKey = vi.mocked(auth.resolveApiKey);
const mockDeleteCredentials = vi.mocked(credentials.deleteCredentials);

const TEST_BASE_URL = "https://test.brag.fast/api/v1";

function makeResponse(
  status: number,
  body: unknown,
  headers: Record<string, string> = {}
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

beforeEach(() => {
  mockResolveApiKey.mockResolvedValue("test_api_key");
  mockDeleteCredentials.mockResolvedValue(undefined);
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe("BragfastApiClient.get", () => {
  it("returns parsed JSON on success", async () => {
    vi.mocked(fetch).mockResolvedValue(makeResponse(200, { credits_remaining: 42, plan: "free" }));

    const client = new BragfastApiClient(TEST_BASE_URL);
    const result = await client.get<{ credits_remaining: number; plan: string }>("/account");

    expect(result).toEqual({ credits_remaining: 42, plan: "free" });
  });

  it("sets Authorization header correctly", async () => {
    vi.mocked(fetch).mockResolvedValue(makeResponse(200, {}));

    const client = new BragfastApiClient(TEST_BASE_URL);
    await client.get("/account");

    const [url, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${TEST_BASE_URL}/account`);
    expect((init.headers as Record<string, string>)["Authorization"]).toBe(
      "Bearer test_api_key"
    );
  });

  it("throws auth error and deletes credentials on 401", async () => {
    vi.mocked(fetch).mockResolvedValue(makeResponse(401, { error: "Unauthorized" }));

    const client = new BragfastApiClient(TEST_BASE_URL);
    await expect(client.get("/account")).rejects.toThrow(
      "API key is invalid or revoked. Run: npx @bragfast/mcp-server login"
    );
    expect(mockDeleteCredentials).toHaveBeenCalledOnce();
  });

  it("throws rate limit error with retry-after on 429", async () => {
    vi.mocked(fetch).mockResolvedValue(
      makeResponse(429, { error: "Too many requests" }, { "Retry-After": "30" })
    );

    const client = new BragfastApiClient(TEST_BASE_URL);
    await expect(client.get("/account")).rejects.toThrow(
      "Rate limited. Try again in 30 seconds"
    );
  });

  it("throws error from response body on 500", async () => {
    vi.mocked(fetch).mockResolvedValue(
      makeResponse(500, { error: "Internal server error" })
    );

    const client = new BragfastApiClient(TEST_BASE_URL);
    await expect(client.get("/account")).rejects.toThrow("Internal server error");
  });

  it("throws connection error when fetch throws", async () => {
    vi.mocked(fetch).mockRejectedValue(new TypeError("Failed to fetch"));

    const client = new BragfastApiClient(TEST_BASE_URL);
    await expect(client.get("/account")).rejects.toThrow(
      "Cannot reach Bragfast API. Check your internet connection."
    );
  });
});

describe("BragfastApiClient.post", () => {
  it("sends body as JSON and returns parsed response", async () => {
    vi.mocked(fetch).mockResolvedValue(makeResponse(200, { cook_id: "abc123", status: "pending" }));

    const client = new BragfastApiClient(TEST_BASE_URL);
    const result = await client.post<{ cook_id: string; status: string }>("/cook", {
      formats: [{ name: "landscape", slides: [] }],
    });

    expect(result).toEqual({ cook_id: "abc123", status: "pending" });

    const [url, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${TEST_BASE_URL}/cook`);
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>)["Content-Type"]).toBe("application/json");
    expect((init.headers as Record<string, string>)["Authorization"]).toBe(
      "Bearer test_api_key"
    );
    expect(JSON.parse(init.body as string)).toEqual({
      formats: [{ name: "landscape", slides: [] }],
    });
  });

  it("throws auth error on 401", async () => {
    vi.mocked(fetch).mockResolvedValue(makeResponse(401, { error: "Unauthorized" }));

    const client = new BragfastApiClient(TEST_BASE_URL);
    await expect(client.post("/cook", {})).rejects.toThrow(
      "API key is invalid or revoked. Run: npx @bragfast/mcp-server login"
    );
    expect(mockDeleteCredentials).toHaveBeenCalledOnce();
  });

  it("throws connection error when fetch throws", async () => {
    vi.mocked(fetch).mockRejectedValue(new Error("ECONNREFUSED"));

    const client = new BragfastApiClient(TEST_BASE_URL);
    await expect(client.post("/cook", {})).rejects.toThrow(
      "Cannot reach Bragfast API. Check your internet connection."
    );
  });
});
