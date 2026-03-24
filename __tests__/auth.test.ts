import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { StoredCredentials } from "../src/lib/credentials.js";

// Mock the credentials module before importing auth
vi.mock("../src/lib/credentials.js", () => ({
  readCredentials: vi.fn(),
  writeCredentials: vi.fn(),
  deleteCredentials: vi.fn(),
  _testing: { setCredsDir: vi.fn(), resetCredsDir: vi.fn() },
}));

import { resolveApiKey } from "../src/lib/auth.js";
import * as credentials from "../src/lib/credentials.js";

const mockReadCredentials = vi.mocked(credentials.readCredentials);

beforeEach(() => {
  delete process.env.BRAGFAST_API_KEY;
  mockReadCredentials.mockResolvedValue(null);
});

afterEach(() => {
  delete process.env.BRAGFAST_API_KEY;
  vi.clearAllMocks();
});

describe("resolveApiKey", () => {
  it("returns env var when BRAGFAST_API_KEY is set", async () => {
    process.env.BRAGFAST_API_KEY = "env_key_xyz";
    const key = await resolveApiKey();
    expect(key).toBe("env_key_xyz");
    expect(mockReadCredentials).not.toHaveBeenCalled();
  });

  it("returns stored credential when env var is not set", async () => {
    const stored: StoredCredentials = { api_key: "stored_key_abc" };
    mockReadCredentials.mockResolvedValue(stored);

    const key = await resolveApiKey();
    expect(key).toBe("stored_key_abc");
    expect(mockReadCredentials).toHaveBeenCalledOnce();
  });

  it("throws with helpful message when neither env var nor stored key is available", async () => {
    mockReadCredentials.mockResolvedValue(null);

    await expect(resolveApiKey()).rejects.toThrow(
      "Not authenticated. Run: npx @bragfast/mcp-server login"
    );
    await expect(resolveApiKey()).rejects.toThrow("BRAGFAST_API_KEY");
    await expect(resolveApiKey()).rejects.toThrow("https://bragfast.com/dashboard/api-keys");
  });
});
