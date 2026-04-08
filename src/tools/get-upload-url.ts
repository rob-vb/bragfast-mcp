import { BragfastApiClient } from "../lib/api-client.js";

const MIME_TYPES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
};

export interface GetUploadUrlInput {
  filename: string;
}

export interface PresignedUploadResult {
  upload_id: string;
  upload_url: string;
  expires_in: number;
  max_size_bytes: number;
}

export async function getUploadUrl(
  client: BragfastApiClient,
  input: GetUploadUrlInput
): Promise<PresignedUploadResult & { upload_commands: { curl: string; python: string } }> {
  const ext = input.filename.slice(input.filename.lastIndexOf(".")).toLowerCase();
  const contentType = MIME_TYPES[ext];
  if (!contentType) {
    throw new Error(
      `Unsupported file type: ${ext}. Allowed: ${Object.keys(MIME_TYPES).join(", ")}`
    );
  }

  const result = await client.post<PresignedUploadResult>("/upload/presigned", {
    filename: input.filename,
    content_type: contentType,
  });

  const curlCommand = `curl -X PUT -H 'Content-Type: ${contentType}' -T '${input.filename}' '${result.upload_url}'`;
  const pythonCommand = `python3 -c "import urllib.request; urllib.request.urlopen(urllib.request.Request('${result.upload_url}', data=open('${input.filename}', 'rb').read(), method='PUT', headers={'Content-Type': '${contentType}'}))"`;

  return { ...result, upload_commands: { curl: curlCommand, python: pythonCommand } };
}
