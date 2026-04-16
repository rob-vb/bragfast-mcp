import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

vi.mock("../src/lib/auth.js", () => ({
  resolveApiKey: vi.fn(),
}));

vi.mock("../src/lib/credentials.js", () => ({
  readCredentials: vi.fn(),
  writeCredentials: vi.fn(),
  deleteCredentials: vi.fn(),
  _testing: { setCredsDir: vi.fn(), resetCredsDir: vi.fn() },
}));

vi.mock("fs/promises", () => ({
  readFile: vi.fn(),
}));

vi.mock("../src/tools/chunked-upload.js", () => ({
  chunkedUpload: vi.fn(),
  CHUNK_SIZE_THRESHOLD: 4 * 1024 * 1024,
}));

import { BragfastApiClient } from "../src/lib/api-client.js";
import * as auth from "../src/lib/auth.js";
import { getUploadUrl } from "../src/tools/get-upload-url.js";
import * as fs from "fs/promises";
import * as chunkedUploadModule from "../src/tools/chunked-upload.js";

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
  vi.mocked(auth.resolveApiKey).mockResolvedValue("test_api_key");
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

// ─── Token-upload branch (filename only, no file_path / source_url) ──────────

describe("getUploadUrl — token-upload branch", () => {
  const mintResponse = {
    upload_token: "utk_abc123",
    upload_url: "https://brag.fast/api/v1/upload/by-token?upload_token=utk_abc123",
    expires_in_seconds: 900,
    max_size_bytes: 4194304,
  };

  it("returns TokenUploadResult with instructions and hint for an image", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(makeResponse(201, mintResponse));

    const client = new BragfastApiClient(TEST_BASE_URL);
    const result = await getUploadUrl(client, { filename: "hero.png" });

    expect(result).toMatchObject({
      upload_token: "utk_abc123",
      upload_url: mintResponse.upload_url,
      expires_in_seconds: 900,
      max_size_bytes: 4194304,
      method: "POST",
      content_type: "multipart/form-data",
    });

    const r = result as Awaited<ReturnType<typeof getUploadUrl>> & {
      instructions: string;
      hint: string;
    };
    expect(r.instructions).toContain("curl -X POST");
    expect(r.instructions).toContain("-F 'file=@<local_file_path>'");
    expect(r.instructions).toContain(mintResponse.upload_url);
    expect(r.hint).toContain("brag.fast");
    expect(r.hint).toContain("host_not_allowed");
  });

  it("sends correct filename and content_type for video", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(makeResponse(201, { ...mintResponse, upload_token: "utk_vid" }));

    const client = new BragfastApiClient(TEST_BASE_URL);
    await getUploadUrl(client, { filename: "demo.mp4" });

    const [, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.filename).toBe("demo.mp4");
    expect(body.content_type).toBe("video/mp4");
  });

  it("propagates 429 rate-limit error from mint call", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      makeResponse(429, { error: "Too many requests" }, { "Retry-After": "60" })
    );

    const client = new BragfastApiClient(TEST_BASE_URL);
    await expect(getUploadUrl(client, { filename: "hero.png" })).rejects.toThrow(
      "Rate limited. Try again in 60 seconds"
    );
  });

  it("throws on unsupported file extension without calling API", async () => {
    const client = new BragfastApiClient(TEST_BASE_URL);
    await expect(getUploadUrl(client, { filename: "doc.pdf" })).rejects.toThrow(
      "Unsupported file type: .pdf"
    );
    expect(fetch).not.toHaveBeenCalled();
  });
});

// ─── /mnt/user-data/ guard ────────────────────────────────────────────────────

describe("getUploadUrl — sandbox path guard", () => {
  it("throws immediately without calling API for /mnt/user-data/ path", async () => {
    const client = new BragfastApiClient(TEST_BASE_URL);
    await expect(
      getUploadUrl(client, {
        filename: "hero.png",
        file_path: "/mnt/user-data/uploads/hero.png",
      })
    ).rejects.toThrow("Claude sandbox path");
    expect(fetch).not.toHaveBeenCalled();
  });
});

// ─── file_path branch (server-side upload) ───────────────────────────────────

describe("getUploadUrl — file_path branch", () => {
  const presignedResponse = {
    upload_id: "upl_p1",
    upload_url: "https://r2.example.com/bucket/hero.png",
    expires_in: 900,
    max_size_bytes: 52428800,
  };
  const uploadResult = {
    upload_id: "upl_p1",
    url: "https://cdn.brag.fast/hero.png",
    status: "ready",
  };

  it("uses presigned PUT for small files and returns UploadResult", async () => {
    vi.mocked(fs.readFile).mockResolvedValue(Buffer.alloc(100) as never);
    vi.mocked(fetch)
      .mockResolvedValueOnce(makeResponse(200, presignedResponse)) // POST /upload/presigned
      .mockResolvedValueOnce(makeResponse(200, {}))                // PUT to R2
      .mockResolvedValueOnce(makeResponse(200, uploadResult));     // GET /upload/:id

    const client = new BragfastApiClient(TEST_BASE_URL);
    const result = await getUploadUrl(client, {
      filename: "hero.png",
      file_path: "/Users/name/hero.png",
    });

    expect(result).toEqual(uploadResult);
  });

  it("falls back to multipart POST when presigned PUT throws TypeError (network blocked)", async () => {
    vi.mocked(fs.readFile).mockResolvedValue(Buffer.alloc(100) as never);
    const multipartResult = { url: "https://cdn.brag.fast/hero.png" };
    vi.mocked(fetch)
      .mockResolvedValueOnce(makeResponse(200, presignedResponse)) // POST /upload/presigned
      .mockRejectedValueOnce(new TypeError("Network blocked"))     // PUT blocked
      .mockResolvedValueOnce(makeResponse(200, multipartResult));  // POST /upload (multipart)

    const client = new BragfastApiClient(TEST_BASE_URL);
    const result = await getUploadUrl(client, {
      filename: "hero.png",
      file_path: "/Users/name/hero.png",
    });

    expect(result).toEqual(multipartResult);
  });

  it("rethrows HTTP errors from presigned PUT without falling back", async () => {
    vi.mocked(fs.readFile).mockResolvedValue(Buffer.alloc(100) as never);
    vi.mocked(fetch)
      .mockResolvedValueOnce(makeResponse(200, presignedResponse)) // POST /upload/presigned
      .mockResolvedValueOnce(makeResponse(500, { error: "R2 down" })); // PUT fails

    const client = new BragfastApiClient(TEST_BASE_URL);
    await expect(
      getUploadUrl(client, { filename: "hero.png", file_path: "/Users/name/hero.png" })
    ).rejects.toThrow("Presigned upload failed: HTTP 500");
  });

  it("routes files above CHUNK_SIZE_THRESHOLD to chunked upload", async () => {
    vi.mocked(fs.readFile).mockResolvedValue(Buffer.alloc(4 * 1024 * 1024 + 1) as never);
    vi.mocked(chunkedUploadModule.chunkedUpload).mockResolvedValue(uploadResult as never);

    const client = new BragfastApiClient(TEST_BASE_URL);
    await getUploadUrl(client, { filename: "demo.mp4", file_path: "/Users/name/demo.mp4" });

    expect(chunkedUploadModule.chunkedUpload).toHaveBeenCalledOnce();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("stays on presigned path for exactly 4MB (at threshold boundary)", async () => {
    vi.mocked(fs.readFile).mockResolvedValue(Buffer.alloc(4 * 1024 * 1024) as never);
    vi.mocked(fetch)
      .mockResolvedValueOnce(makeResponse(200, presignedResponse))
      .mockResolvedValueOnce(makeResponse(200, {}))
      .mockResolvedValueOnce(makeResponse(200, uploadResult));

    const client = new BragfastApiClient(TEST_BASE_URL);
    await getUploadUrl(client, { filename: "img.png", file_path: "/Users/name/img.png" });

    expect(chunkedUploadModule.chunkedUpload).not.toHaveBeenCalled();
  });
});

// ─── source_url branch ───────────────────────────────────────────────────────

describe("getUploadUrl — source_url branch", () => {
  it("throws when source_url returns non-2xx", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(makeResponse(404, {}));

    const client = new BragfastApiClient(TEST_BASE_URL);
    await expect(
      getUploadUrl(client, {
        filename: "hero.png",
        source_url: "https://example.com/hero.png",
      })
    ).rejects.toThrow("Failed to fetch source_url: HTTP 404");
  });

  it("throws when source_url fetch throws a network error", async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new TypeError("DNS failure"));

    const client = new BragfastApiClient(TEST_BASE_URL);
    await expect(
      getUploadUrl(client, {
        filename: "hero.png",
        source_url: "https://example.com/hero.png",
      })
    ).rejects.toThrow("Failed to fetch source_url: DNS failure");
  });
});
