import { describe, it, expect, vi } from "vitest";
import { BragfastApiClient } from "../src/lib/api-client.js";
import { checkAccount } from "../src/tools/check-account.js";

function makeClient() {
  const client = new BragfastApiClient("https://test.brag.fast/api/v1");
  client.get = vi.fn();
  return client;
}

describe("checkAccount", () => {
  it("calls GET /account and returns credits and plan", async () => {
    const client = makeClient();
    vi.mocked(client.get).mockResolvedValue({ credits_remaining: 42, plan: "pro" });

    const result = await checkAccount(client);

    expect(client.get).toHaveBeenCalledOnce();
    expect(client.get).toHaveBeenCalledWith("/account");
    expect(result).toEqual({ credits_remaining: 42, plan: "pro" });
  });

  it("returns zero credits on free plan", async () => {
    const client = makeClient();
    vi.mocked(client.get).mockResolvedValue({ credits_remaining: 0, plan: "free" });

    const result = await checkAccount(client);

    expect(result.credits_remaining).toBe(0);
    expect(result.plan).toBe("free");
  });
});
