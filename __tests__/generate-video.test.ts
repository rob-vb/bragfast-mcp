import { describe, it, expect, vi } from "vitest";
import { BragfastApiClient } from "../src/lib/api-client.js";
import { generateVideo } from "../src/tools/generate-video.js";
import type { ReleaseResult } from "../src/lib/types.js";

function makeClient() {
  const client = new BragfastApiClient("https://test.brag.fast/api/v1");
  client.post = vi.fn();
  return client;
}

const baseResult: ReleaseResult = {
  cook_id: "cook_vid",
  output: "video",
  status: "pending",
  images: null,
  credits_used: 5,
  credits_remaining: 95,
  created_at: "2026-03-24T00:00:00Z",
};

describe("generateVideo", () => {
  it("calls POST /cook with video field", async () => {
    const client = makeClient();
    vi.mocked(client.post).mockResolvedValue(baseResult);

    const input = {
      formats: [{ name: "landscape" as const, slides: [{}] }],
      video: { duration: 10 } as const,
    };

    const result = await generateVideo(client, input);

    expect(client.post).toHaveBeenCalledWith("/cook", {
      ...input,
      video: { duration: 10 },
    });
    expect(result).toEqual(baseResult);
  });

  it("defaults video to true when not specified", async () => {
    const client = makeClient();
    vi.mocked(client.post).mockResolvedValue(baseResult);

    const input = {
      formats: [{ name: "portrait" as const, slides: [{}] }],
    };

    await generateVideo(client, input);

    const [, body] = vi.mocked(client.post).mock.calls[0] as [string, { video: unknown }];
    expect(body.video).toBe(true);
  });

  it("preserves explicit video: true", async () => {
    const client = makeClient();
    vi.mocked(client.post).mockResolvedValue(baseResult);

    const input = {
      formats: [{ name: "square" as const, slides: [{}] }],
      video: true as const,
    };

    await generateVideo(client, input);

    const [, body] = vi.mocked(client.post).mock.calls[0] as [string, { video: unknown }];
    expect(body.video).toBe(true);
  });

  it("rejects og format with an error", async () => {
    const client = makeClient();

    const input = {
      formats: [
        { name: "landscape" as const, slides: [{}] },
        { name: "og" as const, slides: [{}] },
      ],
    };

    await expect(generateVideo(client, input)).rejects.toThrow(
      'Video does not support "og" format. Use landscape, square, or portrait.'
    );
    expect(client.post).not.toHaveBeenCalled();
  });
});
