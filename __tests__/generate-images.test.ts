import { describe, it, expect, vi } from "vitest";
import { BragfastApiClient } from "../src/lib/api-client.js";
import { generateImages } from "../src/tools/generate-images.js";
import type { ReleaseResult } from "../src/lib/types.js";

function makeClient() {
  const client = new BragfastApiClient("https://test.bragfast.com/api/v1");
  client.post = vi.fn();
  return client;
}

const baseResult: ReleaseResult = {
  cook_id: "cook_abc",
  output: "image",
  status: "pending",
  images: null,
  credits_used: 2,
  credits_remaining: 98,
  created_at: "2026-03-24T00:00:00Z",
};

describe("generateImages", () => {
  it("calls POST /cook with input and returns result", async () => {
    const client = makeClient();
    vi.mocked(client.post).mockResolvedValue(baseResult);

    const input = {
      formats: [{ name: "landscape" as const, slides: [{}] }],
    };

    const result = await generateImages(client, input);

    expect(client.post).toHaveBeenCalledOnce();
    expect(client.post).toHaveBeenCalledWith("/cook", input);
    expect(result).toEqual(baseResult);
  });

  it("passes through all fields correctly", async () => {
    const client = makeClient();
    vi.mocked(client.post).mockResolvedValue(baseResult);

    const input = {
      brand_id: "brand_123",
      colors: { background: "#fff", text: "#000", primary: "#f00" },
      name: "v1.2.0",
      logo_url: "https://example.com/logo.png",
      font_family: "Inter",
      template: "hero",
      formats: [
        {
          name: "square" as const,
          slides: [
            {
              objects: [
                { id: "title", text: "Hello World", color: "#333" },
              ],
            },
          ],
        },
      ],
      metadata: "release-v1.2.0",
      webhook_url: "https://example.com/webhook",
    };

    await generateImages(client, input);

    expect(client.post).toHaveBeenCalledWith("/cook", input);
  });
});
