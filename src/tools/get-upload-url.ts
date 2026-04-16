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
  expires_in: number;
  max_size_bytes: number;
}

export interface UploadResult {
  upload_id: string;
  url: string;
  status: string;
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
 * Upload a file to Bragfast via presigned R2 URL.
 *
 * When file_path or source_url is provided, the MCP server:
 *   1. Gets a presigned upload URL from the Bragfast API
 *   2. PUTs the file bytes directly to R2 (MCP server's own network — not
 *      subject to the Claude sandbox proxy that blocks bash curl/python)
 *   3. GETs /upload/:upload_id to resolve and return the hosted URL
 *
 * When neither is provided, falls back to returning the presigned URL + shell
 * commands for manual upload (may be blocked in sandboxed environments).
 */
export async function getUploadUrl(
  client: BragfastApiClient,
  input: GetUploadUrlInput
): Promise<
  | (PresignedUploadResult & { upload_commands: { curl: string; python: string } })
  | UploadResult
  | { url: string }
> {
  const contentType = getContentType(input.filename);

  // Load buffer first so we can choose the right upload path based on file size.
  if (input.file_path || input.source_url) {
    let buffer: Buffer;
    if (input.file_path) {
      if (input.file_path.startsWith("/mnt/user-data/")) {
        throw new Error(
          `file_path "${input.file_path}" is a Claude sandbox path — the MCP server cannot access it. ` +
          `Ask the user to provide one of: (1) the real filesystem path to the file ` +
          `(e.g. /Users/name/Desktop/hero.jpg or C:\\Users\\name\\Desktop\\hero.jpg), or ` +
          `(2) a public URL (Dropbox direct-download, Google Drive, WeTransfer, GitHub raw) — use that as source_url.`
        );
      }
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

  // No file provided: get presigned URL for manual upload.
  const presigned = await client.post<PresignedUploadResult>("/upload/presigned", {
    filename: input.filename,
    content_type: contentType,
  });

  // Fallback: return presigned URL + commands for manual execution.
  const curlCommand = `curl -X PUT -H 'Content-Type: ${contentType}' -T '${input.filename}' '${presigned.upload_url}'`;
  const pythonCommand = `python3 -c "import urllib.request; urllib.request.urlopen(urllib.request.Request('${presigned.upload_url}', data=open('${input.filename}', 'rb').read(), method='PUT', headers={'Content-Type': '${contentType}'}))"`;

  return { ...presigned, upload_commands: { curl: curlCommand, python: pythonCommand } };
}
