import { BragfastApiClient } from "../lib/api-client.js";
import type { ReleaseResult } from "../lib/types.js";
import type { GenerateImagesInput } from "./generate-images.js";

export interface GenerateVideoInput extends GenerateImagesInput {
  video?: { duration?: number } | true;
}

export async function generateVideo(
  client: BragfastApiClient,
  input: GenerateVideoInput
): Promise<ReleaseResult> {
  const hasOg = input.formats.some((f) => f.name === "og");
  if (hasOg) {
    throw new Error('Video does not support "og" format. Use landscape, square, or portrait.');
  }
  const body = { ...input, video: input.video ?? true };
  return client.post<ReleaseResult>("/cook", body);
}
