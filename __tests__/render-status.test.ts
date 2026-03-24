import { describe, it, expect, vi } from "vitest";
import { BragfastApiClient } from "../src/lib/api-client.js";
import { getRenderStatus } from "../src/tools/render-status.js";
import type { ReleaseResult } from "../src/lib/types.js";

function makeClient() {
  const client = new BragfastApiClient("https://test.bragfast.com/api/v1");
  client.get = vi.fn();
  return client;
}

describe("getRenderStatus", () => {
  it("calls GET /cook/{id} and returns pending result", async () => {
    const client = makeClient();
    const pending: ReleaseResult = {
      cook_id: "cook_abc",
      output: "image",
      status: "pending",
      images: null,
      credits_used: 0,
      credits_remaining: 100,
      created_at: "2026-03-24T00:00:00Z",
    };
    vi.mocked(client.get).mockResolvedValue(pending);

    const result = await getRenderStatus(client, { cook_id: "cook_abc" });

    expect(client.get).toHaveBeenCalledOnce();
    expect(client.get).toHaveBeenCalledWith("/cook/cook_abc");
    expect(result.status).toBe("pending");
    expect(result.images).toBeNull();
  });

  it("calls GET /cook/{id} and returns completed result with URLs", async () => {
    const client = makeClient();
    const completed: ReleaseResult = {
      cook_id: "cook_xyz",
      output: "image",
      status: "completed",
      images: {
        landscape: {
          slides: ["https://r2.example.com/cook_xyz/landscape/slide-0.jpg"],
          dimensions: "1200x675",
        },
      },
      credits_used: 2,
      credits_remaining: 98,
      created_at: "2026-03-24T00:00:00Z",
      completed_at: "2026-03-24T00:00:05Z",
    };
    vi.mocked(client.get).mockResolvedValue(completed);

    const result = await getRenderStatus(client, { cook_id: "cook_xyz" });

    expect(client.get).toHaveBeenCalledWith("/cook/cook_xyz");
    expect(result.status).toBe("completed");
    expect(result.images).not.toBeNull();
    expect(result.completed_at).toBe("2026-03-24T00:00:05Z");
  });

  it("calls GET /cook/{id} and returns failed result", async () => {
    const client = makeClient();
    const failed: ReleaseResult = {
      cook_id: "cook_fail",
      output: "image",
      status: "failed",
      images: null,
      credits_used: 0,
      credits_remaining: 100,
      created_at: "2026-03-24T00:00:00Z",
    };
    vi.mocked(client.get).mockResolvedValue(failed);

    const result = await getRenderStatus(client, { cook_id: "cook_fail" });

    expect(client.get).toHaveBeenCalledWith("/cook/cook_fail");
    expect(result.status).toBe("failed");
  });
});
