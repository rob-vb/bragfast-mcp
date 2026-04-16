import { readFile } from "fs/promises";
import { basename, extname } from "path";
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

function getMimeType(filename: string): string {
  const ext = extname(filename).toLowerCase();
  const mimeType = MIME_TYPES[ext];
  if (!mimeType) {
    throw new Error(
      `Unsupported file type: ${ext}. Allowed: ${Object.keys(MIME_TYPES).join(", ")}`
    );
  }
  return mimeType;
}

export async function uploadImage(
  client: BragfastApiClient,
  input: { file_path?: string; image_base64?: string; filename?: string }
): Promise<{ url: string }> {
  let buffer: Buffer;
  let name: string;
  let mimeType: string;

  if (input.file_path) {
    name = basename(input.file_path);
    mimeType = getMimeType(name);
    buffer = await readFile(input.file_path);
  } else if (input.image_base64 && input.filename) {
    name = input.filename;
    mimeType = getMimeType(name);
    buffer = Buffer.from(input.image_base64, "base64");
  } else {
    throw new Error(
      "Provide either file_path (local file) or image_base64 + filename"
    );
  }

  const blob = new Blob([new Uint8Array(buffer)], { type: mimeType });
  const formData = new FormData();
  formData.set("file", blob, name);

  return client.postMultipart<{ url: string }>("/upload", formData);
}
