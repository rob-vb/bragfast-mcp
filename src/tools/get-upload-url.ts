import { readFile } from "fs/promises";
import { BragfastApiClient } from "../lib/api-client.js";

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
> {
  const contentType = getContentType(input.filename);

  const presigned = await client.post<PresignedUploadResult>("/upload/presigned", {
    filename: input.filename,
    content_type: contentType,
  });

  // MCP server performs the upload directly — no proxy restrictions apply.
  if (input.file_path || input.source_url) {
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

    // PUT directly to the presigned R2 URL from the MCP server process.
    const putRes = await fetch(presigned.upload_url, {
      method: "PUT",
      headers: { "Content-Type": contentType },
      body: new Uint8Array(buffer),
    });
    if (!putRes.ok) {
      throw new Error(`Presigned upload failed: HTTP ${putRes.status}`);
    }

    // Resolve the hosted URL via the API.
    const result = await client.get<UploadResult>(`/upload/${presigned.upload_id}`);
    return result;
  }

  // Fallback: return presigned URL + commands for manual execution.
  const curlCommand = `curl -X PUT -H 'Content-Type: ${contentType}' -T '${input.filename}' '${presigned.upload_url}'`;
  const pythonCommand = `python3 -c "import urllib.request; urllib.request.urlopen(urllib.request.Request('${presigned.upload_url}', data=open('${input.filename}', 'rb').read(), method='PUT', headers={'Content-Type': '${contentType}'}))"`;

  return { ...presigned, upload_commands: { curl: curlCommand, python: pythonCommand } };
}
