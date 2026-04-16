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

export interface TokenUploadResult {
  upload_token: string;
  upload_url: string;
  expires_in_seconds: number;
  max_size_bytes: number;
  method: "POST";
  content_type: "multipart/form-data";
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
 * Four dispatch branches, selected by what the caller provides:
 *
 * 1. file_path (Claude Code CLI): MCP server reads the local file and uploads.
 *    Large files (>4MB) use chunked upload; smaller files use presigned R2 PUT
 *    with multipart POST fallback when the PUT is network-blocked.
 *
 * 2. source_url: MCP server fetches the remote file and uploads via the same
 *    chunked / presigned / multipart decision tree as file_path.
 *
 * 3. filename only (claude.ai sandbox): MCP server mints a single-use upload
 *    token via POST /upload/token and returns a TokenUploadResult containing
 *    an `instructions` curl command. The Claude sandbox runs that curl against
 *    brag.fast to upload the file directly (no MCP server involvement in the
 *    actual transfer).
 *
 * 4. Nothing meaningful: error — filename is required at minimum.
 */
export async function getUploadUrl(
  client: BragfastApiClient,
  input: GetUploadUrlInput
): Promise<UploadResult | { url: string } | TokenUploadResult> {
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

  // No file provided: mint a single-use upload token the sandbox can curl.
  // The sandbox (claude.ai, Claude Desktop, Claude Cowork) POSTs to the
  // returned upload_url — no MCP server involvement in the actual transfer.
  const mint = await client.post<{
    upload_token: string;
    upload_url: string;
    expires_in_seconds: number;
    max_size_bytes: number;
  }>("/upload/token", {
    filename: input.filename,
    content_type: contentType,
  });

  const instructions = `curl -X POST -F 'file=@<local_file_path>' '${mint.upload_url}'`;
  const hint =
    "Replace <local_file_path> with the actual path to the file (e.g. /mnt/user-data/uploads/hero.png). " +
    "If curl fails with 'host_not_allowed' or 403, ask the user to add 'brag.fast' to " +
    "Settings → Capabilities → Network Egress → Additional allowed domains.";

  return {
    ...mint,
    method: "POST" as const,
    content_type: "multipart/form-data" as const,
    instructions,
    hint,
  };
}
