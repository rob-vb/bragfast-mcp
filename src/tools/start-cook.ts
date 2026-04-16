export type OutputType = "images" | "video" | "both";
export type FormatName = "landscape" | "square" | "portrait";
export type VideoPreset = "showcase" | "3d-tilt-angles" | "simple-fade";

export interface WizardState {
  output_type?: OutputType;
  template?: string;
  brand_id?: string;
  colors?: { background: string; text: string; primary: string };
  visual_url?: string;
  title?: string;
  description?: string;
  formats?: FormatName[];
  video_preset?: VideoPreset;
}

export type WizardStep =
  | "output_type"
  | "template"
  | "brand_or_colors"
  | "visual"
  | "content"
  | "formats"
  | "video_preset"
  | "ready";

export interface WizardResult {
  step: WizardStep;
  question: string;
  choices?: string[];
  hint?: string;
  collected: WizardState;
}

export function startCook(state: WizardState = {}): WizardResult {
  if (!state.output_type) {
    return {
      step: "output_type",
      question: "What should I generate?",
      choices: ["images", "video", "both"],
      hint: "Images are static; Video adds animation (showcase / 3d-tilt-angles / simple-fade); Both produces both.",
      collected: state,
    };
  }

  if (!state.template) {
    return {
      step: "template",
      question:
        "Which template? Call bragfast_list_templates to show the user the options, then ask them to pick one.",
      hint:
        "Heuristics: mobile work (React Native / Swift / Flutter) → *-mobile; web/dashboard → *-browser; marketing/launches or unclear → hero. Pre-select based on context but confirm with the user.",
      collected: state,
    };
  }

  if (!state.brand_id && !state.colors) {
    return {
      step: "brand_or_colors",
      question:
        "Which brand? Call bragfast_list_brands. If only one brand exists use it automatically. If none exist, ask the user for background, text, and primary hex colors.",
      hint: "If multiple brands exist, pick the one matching the project/repo name or ask the user.",
      collected: state,
    };
  }

  if (!state.visual_url) {
    return {
      step: "visual",
      question:
        "Do you have a screenshot or video clip to include? Answer with a URL, an upload path, or 'none' to skip.",
      hint:
        "Routing: public URL → use directly as image_url/video_url; local file in Claude Code → bragfast_upload_image with file_path; claude.ai sandbox attachment (/mnt/user-data/…) → bragfast_get_upload_url with filename; remote file needing re-host → bragfast_get_upload_url with source_url.",
      collected: state,
    };
  }

  if (!state.title || !state.description) {
    return {
      step: "content",
      question:
        "What is the title and description? Title: ~40 chars, punchy. Description: 1-2 lines explaining the value.",
      hint:
        "Check git log first for announcement-worthy changes (feature branch → diff main; otherwise last ~5 commits). Propose copy and let the user edit before proceeding.",
      collected: state,
    };
  }

  if (!state.formats || state.formats.length === 0) {
    return {
      step: "formats",
      question: "Which output formats? Pick one or more.",
      choices: [
        "landscape (1200×675 — Twitter/X, blogs)",
        "square (1080×1080 — LinkedIn, Instagram)",
        "portrait (1080×1350 — Stories, TikTok)",
      ],
      collected: state,
    };
  }

  if (
    (state.output_type === "video" || state.output_type === "both") &&
    !state.video_preset
  ) {
    return {
      step: "video_preset",
      question: "Which animation preset for the video?",
      choices: [
        "showcase — cinematic rise + reveal",
        "3d-tilt-angles — perspective tilt",
        "simple-fade — clean fade-in",
      ],
      collected: state,
    };
  }

  return {
    step: "ready",
    question:
      "All information collected. Next: call bragfast_get_template with the chosen template to fetch object IDs, compose the slides, then call the appropriate generate tool.",
    hint:
      "Use collected.output_type to pick the tool: 'images' → bragfast_generate_release_images; 'video' → bragfast_generate_release_video; 'both' → call both. Map title → object id 'title', description → 'description', visual_url → image_url (or video_url if a video clip) on an 'image'/'visual' object.",
    collected: state,
  };
}
