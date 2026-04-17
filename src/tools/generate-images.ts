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
    name: "landscape" | "square" | "portrait";
    slides: Array<{
      objects?: Array<{
        id: string;
        text?: string;
        image_url?: string;
        video_url?: string;
        font_family?: string;
        font_weight?: number;
        color?: string;
        visual_frame?: "browser" | "mobile" | "none";
        visual_frame_color?: string;
        anchor_x?: "left" | "center" | "right";
        anchor_y?: "top" | "center" | "bottom";
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
  return client.post<ReleaseResult>("/cook/image", input);
}
