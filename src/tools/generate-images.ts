import { BragfastApiClient } from "../lib/api-client.js";
import type { ReleaseResult } from "../lib/types.js";

export interface GenerateImagesInput {
  brand_id?: string;
  colors?: { background: string; text: string; primary: string };
  name?: string;
  logo_url?: string;
  font_family?: string;
  template?: string;
  formats: Array<{
    name: "landscape" | "square" | "portrait" | "og";
    slides: Array<{
      objects?: Array<{
        id: string;
        text?: string;
        image_url?: string;
        font_family?: string;
        color?: string;
        image_frame?: "browser" | "mobile" | "none";
        image_frame_color?: string;
      }>;
    }>;
  }>;
  metadata?: string;
  webhook_url?: string;
}

export async function generateImages(
  client: BragfastApiClient,
  input: GenerateImagesInput
): Promise<ReleaseResult> {
  return client.post<ReleaseResult>("/cook", input);
}
