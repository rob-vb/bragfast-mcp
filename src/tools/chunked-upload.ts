import { BragfastApiClient } from "../lib/api-client.js";
import type { UploadResult } from "./get-upload-url.js";

const CHUNK_SIZE_THRESHOLD = 4 * 1024 * 1024; // 4MB — under Vercel's 4.5MB body cap

interface ChunkedInitResult {
  upload_id: string;
  part_size_bytes: number;
  total_parts: number;
  expires_in: number;
  expires_at: number;
  part_url_template: string;
  part_signatures: string[];
  complete_url: string;
  abort_url: string;
  max_size_bytes: number;
}

interface PartResult {
  upload_id: string;
  part_number: number;
  uploaded_count: number;
  total_parts: number;
}

/**
 * Upload a large file through the brag.fast chunked upload API.
 *
 * Splits the buffer into ≤4MB chunks, PUTs each through the brag.fast API
 * (which proxies to R2 server-side), then calls /complete to assemble.
 *
 * Use when buffer.length > CHUNK_SIZE_THRESHOLD to avoid Vercel's 4.5MB body cap.
 */
export async function chunkedUpload(
  client: BragfastApiClient,
  buffer: Buffer,
  filename: string,
  contentType: string
): Promise<UploadResult> {
  const init = await client.post<ChunkedInitResult>("/upload/chunked/init", {
    filename,
    content_type: contentType,
    size_bytes: buffer.length,
  });

  try {
    for (let n = 1; n <= init.total_parts; n++) {
      const start = (n - 1) * init.part_size_bytes;
      const end = Math.min(start + init.part_size_bytes, buffer.length);
      const chunk = buffer.subarray(start, end);

      const path = init.part_url_template
        .replace("{n}", String(n))
        .replace("{sig}", init.part_signatures[n - 1]);

      await client.putRaw<PartResult>(path, new Uint8Array(chunk), contentType);
    }

    const result = await client.postRaw<UploadResult>(init.complete_url);
    return result;
  } catch (err) {
    // Best-effort abort — clean up temp chunks server-side
    try {
      await client.postRaw(init.abort_url);
    } catch {
      // Swallow abort errors — server lifecycle rule will clean up eventually
    }
    throw err;
  }
}

export { CHUNK_SIZE_THRESHOLD };
