import { describe, it, expect, vi, afterEach } from "vitest";
import { BragfastApiClient } from "../src/lib/api-client.js";
import { getRenderStatus, buildRenderStatusContent } from "../src/tools/render-status.js";
import type { ReleaseResult } from "../src/lib/types.js";

function makeClient() {
  const client = new BragfastApiClient("https://test.brag.fast/api/v1");
  client.get = vi.fn();
  return client;
}

function fakeImageFetch(body = Buffer.from("fakepng"), contentType = "image/png") {
  const ab = body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength);
  return vi.fn().mockResolvedValue({
    ok: true,
    headers: { get: (h: string) => (h === "content-type" ? contentType : null) },
    arrayBuffer: async () => ab,
  } as unknown as Response);
}

afterEach(() => {
  vi.restoreAllMocks();
});

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

describe("buildRenderStatusContent", () => {
  const baseResult: ReleaseResult = {
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

  it("pending result emits only a text block", async () => {
    const pending: ReleaseResult = { ...baseResult, status: "pending", images: null };
    const content = await buildRenderStatusContent(pending);

    expect(content).toHaveLength(1);
    expect(content[0].type).toBe("text");
  });

  it("completed image: fetch succeeds → text + resource_link + image blocks", async () => {
    vi.stubGlobal("fetch", fakeImageFetch());

    const content = await buildRenderStatusContent(baseResult);

    const types = content.map((b) => b.type);
    expect(types).toEqual(["text", "resource_link", "image"]);

    const link = content[1] as Extract<typeof content[number], { type: "resource_link" }>;
    expect(link.uri).toBe("https://r2.example.com/cook_xyz/landscape/slide-0.jpg");
    expect(link.name).toBe("landscape-slide-0.jpg");
    expect(link.mimeType).toBe("image/jpeg");
    expect(link.description).toBe("1200x675");

    const img = content[2] as Extract<typeof content[number], { type: "image" }>;
    expect(img.mimeType).toBe("image/png");
    expect(img.data).toBe(Buffer.from("fakepng").toString("base64"));
  });

  it("completed image: fetch returns too_large → text + resource_link + explanatory text (no image block)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        headers: {
          get: (h: string) => {
            if (h === "content-type") return "image/png";
            if (h === "content-length") return "5000000";
            return null;
          },
        },
        arrayBuffer: async () => new ArrayBuffer(0),
      })
    );

    const content = await buildRenderStatusContent(baseResult);

    const types = content.map((b) => b.type);
    expect(types).toEqual(["text", "resource_link", "text"]);

    const note = content[2] as Extract<typeof content[number], { type: "text" }>;
    expect(note.text).toMatch(/1 image\(s\) exceeded/);
  });

  it("completed image: mixed results emit inline for success and resource_link for both", async () => {
    const result: ReleaseResult = {
      ...baseResult,
      images: {
        landscape: {
          slides: [
            "https://r2.example.com/slide-0.png",
            "https://r2.example.com/slide-big.png",
          ],
          dimensions: "1200x675",
        },
      },
    };

    let callCount = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve(fakeImageFetch()());
        }
        return Promise.resolve({
          ok: true,
          headers: {
            get: (h: string) => {
              if (h === "content-type") return "image/png";
              if (h === "content-length") return "5000000";
              return null;
            },
          },
          arrayBuffer: async () => new ArrayBuffer(0),
        });
      })
    );

    const content = await buildRenderStatusContent(result);

    const types = content.map((b) => b.type);
    // text, resource_link, image (slide-0 ok), resource_link, (slide-big too_large), text note
    expect(types).toEqual(["text", "resource_link", "image", "resource_link", "text"]);
    const note = content[4] as Extract<typeof content[number], { type: "text" }>;
    expect(note.text).toMatch(/1 image\(s\) exceeded/);
  });

  it("completed video with poster_url → poster image block + video resource_link", async () => {
    const result: ReleaseResult = {
      ...baseResult,
      output: "video",
      images: null,
      videos: {
        landscape: {
          url: "https://r2.example.com/cook_xyz/landscape/output.mp4",
          duration: 15,
          dimensions: "1200x675",
          poster_url: "https://r2.example.com/cook_xyz/landscape/poster.jpg",
        },
      },
    };
    vi.stubGlobal("fetch", fakeImageFetch(Buffer.from("fakejpg"), "image/jpeg"));

    const content = await buildRenderStatusContent(result);

    const types = content.map((b) => b.type);
    expect(types).toEqual(["text", "image", "resource_link"]);

    const img = content[1] as Extract<typeof content[number], { type: "image" }>;
    expect(img.mimeType).toBe("image/jpeg");

    const link = content[2] as Extract<typeof content[number], { type: "resource_link" }>;
    expect(link.uri).toBe("https://r2.example.com/cook_xyz/landscape/output.mp4");
    expect(link.mimeType).toBe("video/mp4");
    expect(link.description).toBe("1200x675 · 15s");
  });

  it("completed video without poster_url → resource_link only", async () => {
    const result: ReleaseResult = {
      ...baseResult,
      output: "video",
      images: null,
      videos: {
        landscape: {
          url: "https://r2.example.com/cook_xyz/landscape/output.mp4",
          duration: 15,
          dimensions: "1200x675",
        },
      },
    };

    const content = await buildRenderStatusContent(result);

    const types = content.map((b) => b.type);
    expect(types).toEqual(["text", "resource_link"]);

    const link = content[1] as Extract<typeof content[number], { type: "resource_link" }>;
    expect(link.mimeType).toBe("video/mp4");
    expect(link.name).toBe("landscape.mp4");
  });
});
