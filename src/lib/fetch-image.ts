const DEFAULT_MAX_BYTES = 750_000; // ~1MB after base64 encoding

export interface FetchedImage {
  data: string; // base64-encoded
  mimeType: string; // e.g. "image/png"
}

export async function fetchImageAsBase64(
  url: string,
  maxBytes = DEFAULT_MAX_BYTES
): Promise<FetchedImage | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;

    const contentType = res.headers.get("content-type") ?? "";
    if (!contentType.startsWith("image/")) return null;

    const contentLength = res.headers.get("content-length");
    if (contentLength && parseInt(contentLength, 10) > maxBytes) return null;

    const buffer = await res.arrayBuffer();
    if (buffer.byteLength > maxBytes) return null;

    const data = Buffer.from(buffer).toString("base64");
    const mimeType = contentType.split(";")[0].trim();

    return { data, mimeType };
  } catch {
    return null;
  }
}
