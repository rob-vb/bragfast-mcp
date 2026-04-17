import { BragfastApiClient } from "../lib/api-client.js";
import type { ReleaseResult } from "../lib/types.js";
import type { GenerateImagesInput } from "./generate-images.js";

export interface GenerateVideoInput extends GenerateImagesInput {
  video?: { duration?: number; preset?: "showcase" | "3d-tilt-angles" | "simple-fade" } | true;
}

export async function generateVideo(
  client: BragfastApiClient,
  input: GenerateVideoInput
): Promise<ReleaseResult> {
  const body = { ...input, video: input.video ?? true };
  return client.post<ReleaseResult>("/cook/video", body);
}
