import { BragfastApiClient } from "../lib/api-client.js";
import { fetchImageAsBase64, isFetchedImage } from "../lib/fetch-image.js";
import type { ReleaseResult } from "../lib/types.js";

export interface RenderStatusInput {
  cook_id: string;
}

export type ContentBlock =
  | { type: "text"; text: string }
  | { type: "image"; data: string; mimeType: string; annotations?: { audience: ("user" | "assistant")[] } }
  | { type: "resource_link"; uri: string; name: string; mimeType: string; description?: string; annotations?: { audience: ("user" | "assistant")[] } };

export async function getRenderStatus(
  client: BragfastApiClient,
  input: RenderStatusInput
): Promise<ReleaseResult> {
  return client.get<ReleaseResult>(`/cook/${input.cook_id}`);
}

export async function buildRenderStatusContent(result: ReleaseResult): Promise<ContentBlock[]> {
  const content: ContentBlock[] = [{ type: "text", text: JSON.stringify(result, null, 2) }];

  if (result.status === "completed" && result.images) {
    let tooLargeCount = 0;

    for (const [format, entry] of Object.entries(result.images)) {
      for (const [i, url] of entry.slides.entries()) {
        const ext = url.split("?")[0].split(".").pop() ?? "png";
        const mimeType = ext === "jpg" || ext === "jpeg" ? "image/jpeg" : "image/png";

        content.push({
          type: "resource_link",
          uri: url,
          name: `${format}-slide-${i}.${ext}`,
          mimeType,
          description: entry.dimensions,
          annotations: { audience: ["user"] },
        });

        const fetched = await fetchImageAsBase64(url);
        if (isFetchedImage(fetched)) {
          content.push({
            type: "image",
            data: fetched.data,
            mimeType: fetched.mimeType,
            annotations: { audience: ["user"] },
          });
        } else if (fetched.error === "too_large") {
          tooLargeCount++;
        }
      }
    }

    if (tooLargeCount > 0) {
      content.push({
        type: "text",
        text: `Note: ${tooLargeCount} image(s) exceeded the inline preview cap — open the resource links above.`,
      });
    }
  }

  if (result.status === "completed" && result.videos) {
    for (const [format, video] of Object.entries(result.videos)) {
      if (video.poster_url) {
        const poster = await fetchImageAsBase64(video.poster_url);
        if (isFetchedImage(poster)) {
          content.push({
            type: "image",
            data: poster.data,
            mimeType: poster.mimeType,
            annotations: { audience: ["user"] },
          });
        }
      }

      content.push({
        type: "resource_link",
        uri: video.url,
        name: `${format}.mp4`,
        mimeType: "video/mp4",
        description: `${video.dimensions} · ${video.duration}s`,
        annotations: { audience: ["user"] },
      });
    }
  }

  return content;
}
