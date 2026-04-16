const DEFAULT_MAX_BYTES = 4_000_000; // ~5.5 MB after base64 encoding

export interface FetchedImage {
  data: string; // base64-encoded
  mimeType: string; // e.g. "image/png"
}

export type FetchImageResult =
  | FetchedImage
  | { error: "too_large"; bytes?: number }
  | { error: "not_image" }
  | { error: "fetch_failed" };

export function isFetchedImage(r: FetchImageResult): r is FetchedImage {
  return "data" in r;
}

export async function fetchImageAsBase64(
  url: string,
  maxBytes = DEFAULT_MAX_BYTES
): Promise<FetchImageResult> {
  try {
    const res = await fetch(url);
    if (!res.ok) return { error: "fetch_failed" };

    const contentType = res.headers.get("content-type") ?? "";
    if (!contentType.startsWith("image/")) return { error: "not_image" };

    const contentLength = res.headers.get("content-length");
    if (contentLength && parseInt(contentLength, 10) > maxBytes)
      return { error: "too_large", bytes: parseInt(contentLength, 10) };

    const buffer = await res.arrayBuffer();
    if (buffer.byteLength > maxBytes)
      return { error: "too_large", bytes: buffer.byteLength };

    const data = Buffer.from(buffer).toString("base64");
    const mimeType = contentType.split(";")[0].trim();

    return { data, mimeType };
  } catch {
    return { error: "fetch_failed" };
  }
}
