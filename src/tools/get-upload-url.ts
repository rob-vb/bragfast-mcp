import { readFile } from "fs/promises";
import { basename } from "path";
import { BragfastApiClient } from "../lib/api-client.js";
import { chunkedUpload, CHUNK_SIZE_THRESHOLD } from "./chunked-upload.js";

const MIME_TYPES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mov": "video/quicktime",
};

export interface GetUploadUrlInput {
  filename: string;
  file_path?: string;
  source_url?: string;
}

export interface PresignedUploadResult {
  upload_id: string;
  upload_url: string;
  public_url: string;
  expires_in: number;
  max_size_bytes: number;
}

export interface UploadResult {
  upload_id: string;
  url: string;
  status: string;
}

export interface SandboxUploadResult {
  upload_id: string;
  upload_url: string;
  url: string;
  expires_in: number;
  max_size_bytes: number;
  method: "PUT";
  content_type: string;
  instructions: string;
  hint: string;
}

function getContentType(filename: string): string {
  const ext = filename.slice(filename.lastIndexOf(".")).toLowerCase();
  const contentType = MIME_TYPES[ext];
  if (!contentType) {
    throw new Error(
      `Unsupported file type: ${ext}. Allowed: ${Object.keys(MIME_TYPES).join(", ")}`
    );
  }
  return contentType;
}

/**
 * Upload a file to Bragfast.
 *
 * Three dispatch branches, selected by what the caller provides:
 *
 * 1. file_path (Claude Code CLI): MCP server reads the local file and uploads.
 *    Large files (>4MB) use chunked upload; smaller files use presigned R2 PUT
 *    with multipart POST fallback when the PUT is network-blocked.
 *
 * 2. source_url: MCP server fetches the remote file and uploads via the same
 *    chunked / presigned / multipart decision tree as file_path.
 *
 * 3. filename only (claude.ai sandbox): MCP server calls POST /upload/presigned
 *    and returns the R2-signed PUT URL + the final R2 public CDN URL upfront.
 *    The sandbox curls PUT directly to R2 — brag.fast domain is not touched
 *    from the sandbox. Both R2 hostnames (*.r2.cloudflarestorage.com and the
 *    public CDN) are on claude.ai's default egress allowlist.
 */
export async function getUploadUrl(
  client: BragfastApiClient,
  input: GetUploadUrlInput
): Promise<UploadResult | { url: string } | SandboxUploadResult> {
  const contentType = getContentType(input.filename);

  // Load buffer first so we can choose the right upload path based on file size.
  if ((input.file_path && !input.file_path.startsWith("/mnt/user-data/")) || input.source_url) {
    let buffer: Buffer;
    if (input.file_path) {
      buffer = await readFile(input.file_path);
    } else {
      let res: Response;
      try {
        res = await fetch(input.source_url!);
      } catch (err) {
        throw new Error(`Failed to fetch source_url: ${(err as Error).message}`);
      }
      if (!res.ok) {
        throw new Error(`Failed to fetch source_url: HTTP ${res.status}`);
      }
      buffer = Buffer.from(await res.arrayBuffer());
    }

    // Large files (>4MB): use chunked upload through the brag.fast API.
    // This avoids Vercel's 4.5MB request body cap and works regardless of
    // network allowlist restrictions (no direct R2 access needed).
    if (buffer.length > CHUNK_SIZE_THRESHOLD) {
      return chunkedUpload(client, buffer, input.filename, contentType);
    }

    // Small files: get presigned URL then attempt direct R2 PUT.
    const presigned = await client.post<PresignedUploadResult>("/upload/presigned", {
      filename: input.filename,
      content_type: contentType,
    });

    // Attempt 1: PUT directly to the presigned R2 URL from the MCP server
    // process (fast, no size limit). May be blocked by network allowlist in
    // some hosted/sandboxed environments.
    let putBlocked = false;
    try {
      const putRes = await fetch(presigned.upload_url, {
        method: "PUT",
        headers: { "Content-Type": contentType },
        body: new Uint8Array(buffer),
      });
      if (putRes.ok) {
        const result = await client.get<UploadResult>(`/upload/${presigned.upload_id}`);
        return result;
      }
      // Non-2xx but reachable — real error, don't fall back.
      throw new Error(`Presigned upload failed: HTTP ${putRes.status}`);
    } catch (err) {
      // fetch() throws TypeError on network-level failures (connection refused,
      // allowlist denial, DNS failure). Non-TypeError = real HTTP error, re-throw.
      if (err instanceof TypeError) {
        putBlocked = true;
      } else {
        throw err;
      }
    }

    if (putBlocked) {
      // Attempt 2: multipart POST through the brag.fast API (always reachable,
      // file is ≤4MB so Vercel body cap is not an issue here).
      const name = input.file_path ? basename(input.file_path) : input.filename;
      const blob = new Blob([new Uint8Array(buffer)], { type: contentType });
      const formData = new FormData();
      formData.set("file", blob, name);
      return client.postMultipart<{ url: string }>("/upload", formData);
    }

    return presigned as unknown as UploadResult;
  }

  // No file provided (claude.ai sandbox path): return a presigned R2 PUT URL
  // and the final public CDN URL upfront. The sandbox curls PUT directly to
  // R2 — brag.fast domain is not involved in the transfer. Both R2 hostnames
  // are on claude.ai's default egress allowlist.
  const presigned = await client.post<PresignedUploadResult>("/upload/presigned", {
    filename: input.filename,
    content_type: contentType,
  });

  const instructions = `curl -X PUT -H 'Content-Type: ${contentType}' --upload-file <local_file_path> '${presigned.upload_url}'`;
  const hint =
    "Replace <local_file_path> with the actual path to the file (e.g. /mnt/user-data/uploads/hero.png). " +
    "After curl succeeds, use the `url` field as image_url or video_url in downstream generate calls — no further upload calls needed. " +
    "The upload URL is a curl-able R2 presigned URL; requires shell access to execute (e.g. Claude Code, claude.ai sandbox).";

  return {
    upload_id: presigned.upload_id,
    upload_url: presigned.upload_url,
    url: presigned.public_url,
    expires_in: presigned.expires_in,
    max_size_bytes: presigned.max_size_bytes,
    method: "PUT" as const,
    content_type: contentType,
    instructions,
    hint,
  };
}
