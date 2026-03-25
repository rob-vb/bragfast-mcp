import { readFile } from "fs/promises";
import { basename } from "path";
import { BragfastApiClient } from "../lib/api-client.js";

const MIME_TYPES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
};

export async function uploadImage(
  client: BragfastApiClient,
  input: { file_path: string }
): Promise<{ url: string }> {
  const ext = input.file_path.slice(input.file_path.lastIndexOf(".")).toLowerCase();
  const mimeType = MIME_TYPES[ext];
  if (!mimeType) {
    throw new Error(
      `Unsupported file type: ${ext}. Allowed: ${Object.keys(MIME_TYPES).join(", ")}`
    );
  }

  const buffer = await readFile(input.file_path);
  const blob = new Blob([buffer], { type: mimeType });
  const formData = new FormData();
  formData.set("file", blob, basename(input.file_path));

  return client.postMultipart<{ url: string }>("/upload", formData);
}
