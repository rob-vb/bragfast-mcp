import { describe, it, expect, vi, afterEach } from "vitest";
import { fetchImageAsBase64, isFetchedImage } from "../src/lib/fetch-image.js";

function makeResponse(opts: {
  ok?: boolean;
  contentType?: string;
  contentLength?: string;
  body?: ArrayBuffer;
}): Response {
  const { ok = true, contentType = "image/png", contentLength, body = new ArrayBuffer(100) } = opts;
  return {
    ok,
    headers: {
      get: (h: string) => {
        if (h === "content-type") return contentType;
        if (h === "content-length") return contentLength ?? null;
        return null;
      },
    },
    arrayBuffer: async () => body,
  } as unknown as Response;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("fetchImageAsBase64", () => {
  it("returns base64 data for a valid small image", async () => {
    const buf = Buffer.from("fakepng");
    const body = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(makeResponse({ body })));

    const result = await fetchImageAsBase64("https://example.com/img.png");

    expect(isFetchedImage(result)).toBe(true);
    if (isFetchedImage(result)) {
      expect(result.mimeType).toBe("image/png");
      expect(result.data).toBe(Buffer.from("fakepng").toString("base64"));
    }
  });

  it("returns fetch_failed when response is not ok", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(makeResponse({ ok: false })));

    const result = await fetchImageAsBase64("https://example.com/img.png");

    expect(result).toEqual({ error: "fetch_failed" });
  });

  it("returns not_image when content-type is not image/*", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(makeResponse({ contentType: "text/html" })));

    const result = await fetchImageAsBase64("https://example.com/page");

    expect(result).toEqual({ error: "not_image" });
  });

  it("returns too_large when content-length header exceeds cap", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(makeResponse({ contentLength: "5000000" }))
    );

    const result = await fetchImageAsBase64("https://example.com/big.png", 4_000_000);

    expect(result).toEqual({ error: "too_large", bytes: 5_000_000 });
  });

  it("returns too_large when body size exceeds cap (no content-length header)", async () => {
    const big = new ArrayBuffer(5_000_000);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(makeResponse({ body: big })));

    const result = await fetchImageAsBase64("https://example.com/big.png", 4_000_000);

    expect(result).toEqual({ error: "too_large", bytes: 5_000_000 });
  });

  it("returns fetch_failed when fetch throws", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network error")));

    const result = await fetchImageAsBase64("https://example.com/img.png");

    expect(result).toEqual({ error: "fetch_failed" });
  });

  it("uses custom maxBytes when provided", async () => {
    const body = new ArrayBuffer(200);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(makeResponse({ body })));

    const result = await fetchImageAsBase64("https://example.com/img.png", 100);

    expect(result).toEqual({ error: "too_large", bytes: 200 });
  });
});
