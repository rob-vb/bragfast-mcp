// Subset of bragfast types needed by MCP tools

export interface BrandColors {
  background: string;
  text: string;
  primary: string;
}

export interface BrandRecord {
  id: string;
  name: string;
  logo_url?: string;
  website?: string;
  font_family?: string;
  colors: BrandColors;
  created_at: string;
  updated_at: string;
}

export interface ObjectModification {
  id: string;
  text?: string;
  font_family?: string;
  font_weight?: number;
  color?: string;
  image_url?: string;
  image_frame?: "browser" | "mobile" | "none";
  image_frame_color?: string;
  anchor_x?: "left" | "center" | "right";
  anchor_y?: "top" | "center" | "bottom";
  entrance?: "fade-in" | "slide-up" | "bounce" | "none";
}

export interface FormatEntry {
  name: "landscape" | "square" | "portrait" | "og";
  slides: Array<{
    objects?: ObjectModification[];
  }>;
}

export interface ReleaseRequest {
  brand_id?: string;
  colors?: BrandColors;
  name?: string;
  logo_url?: string;
  font_family?: string;
  template?: string;
  formats: FormatEntry[];
  video?: true | { duration?: number };
  metadata?: string;
  webhook_url?: string;
}

export interface ReleaseResult {
  cook_id: string;
  output: "image" | "video";
  status: "pending" | "pending_review" | "completed" | "failed" | "dismissed";
  images: Record<string, { slides: string[]; dimensions: string }> | null;
  videos?: Record<string, { url: string; duration: number; dimensions: string }> | null;
  credits_used: number;
  credits_remaining: number;
  created_at: string;
  completed_at?: string;
  metadata?: string;
  webhook_url?: string;
}

export interface TemplateRecord {
  id: string;
  name: string;
  is_default: boolean;
  config: unknown;
  preview_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface TemplateSummary {
  id: string;
  name: string;
  is_default: boolean;
  preview_url: string | null;
}

export interface AccountInfo {
  credits_remaining: number;
  plan: string;
}

export interface ApiError {
  error: string;
}
