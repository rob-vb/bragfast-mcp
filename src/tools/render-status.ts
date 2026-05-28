import { BragfastApiClient } from "../lib/api-client.js";
import { fetchImageAsBase64, isFetchedImage } from "../lib/fetch-image.js";
import type { ReleaseResult } from "../lib/types.js";

export interface RenderStatusInput {
  cook_id: string;
  wait_seconds?: number;
}

export type ContentBlock =
  | { type: "text"; text: string }
  | {
      type: "image";
      data: string;
      mimeType: string;
      annotations?: { audience: ("user" | "assistant")[] };
    }
  | {
      type: "resource_link";
      uri: string;
      name: string;
      mimeType: string;
      description?: string;
      annotations?: { audience: ("user" | "assistant")[] };
    };

const MAX_WAIT_SECONDS = 55;
const POLL_INTERVAL_MS = 30000;
const PREVIEW_BASE = "https://brag.fast/admin/history";

function isTerminal(status: ReleaseResult["status"]): boolean {
  return status === "completed" || status === "failed" || status === "dismissed";
}

/** Essentials-only payload for the model — not the full ReleaseResult dump. */
export function summarizeReleaseResult(result: ReleaseResult): Record<string, unknown> {
  const summary: Record<string, unknown> = {
    cook_id: result.cook_id,
    output: result.output,
    status: result.status,
    credits_used: result.credits_used,
    credits_remaining: result.credits_remaining,
    preview_page: `${PREVIEW_BASE}?id=${encodeURIComponent(result.cook_id)}`,
  };

  if (result.completed_at) {
    summary.completed_at = result.completed_at;
  }

  if (result.status === "completed" && result.images) {
    summary.images = Object.fromEntries(
      Object.entries(result.images).map(([format, entry]) => [
        format,
        { dimensions: entry.dimensions, urls: entry.slides },
      ]),
    );
  }

  if (result.status === "completed" && result.videos) {
    summary.videos = Object.fromEntries(
      Object.entries(result.videos).map(([format, video]) => [
        format,
        {
          url: video.url,
          poster_url: video.poster_url,
          duration: video.duration,
          dimensions: video.dimensions,
        },
      ]),
    );
  }

  return summary;
}

export async function getRenderStatus(
  client: BragfastApiClient,
  input: RenderStatusInput,
): Promise<ReleaseResult> {
  const path = `/cook/${input.cook_id}`;
  const wait = Math.max(0, Math.min(input.wait_seconds ?? 0, MAX_WAIT_SECONDS));
  const deadline = Date.now() + wait * 1000;

  let result = await client.get<ReleaseResult>(path);
  while (!isTerminal(result.status) && Date.now() + POLL_INTERVAL_MS <= deadline) {
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    result = await client.get<ReleaseResult>(path);
  }
  return result;
}

export async function buildRenderStatusContent(
  result: ReleaseResult,
): Promise<ContentBlock[]> {
  const content: ContentBlock[] = [
    { type: "text", text: JSON.stringify(summarizeReleaseResult(result), null, 2) },
  ];

  if (result.status === "completed" && result.images) {
    let tooLargeCount = 0;

    for (const [format, entry] of Object.entries(result.images)) {
      for (const [i, url] of entry.slides.entries()) {
        const ext = url.split("?")[0].split(".").pop() ?? "png";
        const mimeType =
          ext === "jpg" || ext === "jpeg" ? "image/jpeg" : "image/png";
        const name = `${format}-slide-${i}`;

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

        content.push({
          type: "resource_link",
          uri: url,
          name: `${name}.${ext}`,
          mimeType,
          description: entry.dimensions,
          annotations: { audience: ["user"] },
        });
      }
    }

    if (tooLargeCount > 0) {
      content.push({
        type: "text",
        text: `${tooLargeCount} image(s) exceeded the inline preview size cap. Open the resource_link URLs above or your preview page: ${PREVIEW_BASE}?id=${encodeURIComponent(result.cook_id)}`,
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
