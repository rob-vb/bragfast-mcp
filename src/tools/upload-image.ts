import { extname } from "path";
import { basename } from "path";
import { BragfastApiClient } from "../lib/api-client.js";
import { getUploadUrl } from "./get-upload-url.js";

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

function guessFilename(url: string): string {
  try {
    const pathname = new URL(url).pathname;
    const name = basename(pathname);
    if (name && extname(name)) return name;
  } catch {
    // ignore
  }
  return "upload.bin";
}

export async function uploadImage(
  client: BragfastApiClient,
  input: {
    file_path?: string;
    source_url?: string;
    file_base64?: string;
    image_base64?: string;
    filename?: string;
  }
): Promise<{ url: string }> {
  // For file_path and source_url, use the presigned R2 upload flow so large
  // files (big images, videos) don't hit the multipart body size limit.
  if (input.file_path || input.source_url) {
    const filename = input.file_path
      ? basename(input.file_path)
      : (input.filename ?? guessFilename(input.source_url!));

    const result = await getUploadUrl(client, {
      filename,
      file_path: input.file_path,
      source_url: input.source_url,
    });

    // getUploadUrl returns UploadResult ({ upload_id, url, status }) when
    // file_path/source_url is provided. Extract url.
    if ("url" in result) return { url: result.url };
    throw new Error("Upload did not return a hosted URL");
  }

  // Base64 path — file is already in memory and implicitly small.
  const b64 = input.file_base64 ?? input.image_base64;
  if (b64 && input.filename) {
    const name = input.filename;
    const mimeType = getMimeType(name);
    const buffer = Buffer.from(b64, "base64");
    const blob = new Blob([new Uint8Array(buffer)], { type: mimeType });
    const formData = new FormData();
    formData.set("file", blob, name);
    return client.postMultipart<{ url: string }>("/upload", formData);
  }

  throw new Error(
    "Provide one of: file_path (local file), source_url (public URL), or file_base64 + filename"
  );
}
