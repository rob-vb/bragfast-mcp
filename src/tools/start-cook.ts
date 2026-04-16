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

export interface AskUserQuestionOption {
  label: string;
  description: string;
}

export interface AskUserQuestionPayload {
  question: string;
  header: string;
  multiSelect: boolean;
  options: AskUserQuestionOption[];
}

export interface WizardResult {
  step: WizardStep;
  question: string;
  choices?: string[];
  hint?: string;
  ask_user_question?: AskUserQuestionPayload;
  collected: WizardState;
}

const ASK_USER_QUESTION_HINT =
  "If the AskUserQuestion tool is available (e.g. in Claude Code), present the options to the user by calling AskUserQuestion with the `ask_user_question` payload below — don't paste the choices as plain text. Fall back to plain text only if AskUserQuestion isn't available.";

export function startCook(state: WizardState = {}): WizardResult {
  if (!state.output_type) {
    return {
      step: "output_type",
      question: "What should I generate?",
      choices: ["images", "video", "both"],
      hint: ASK_USER_QUESTION_HINT,
      ask_user_question: {
        question: "What should bragfast generate?",
        header: "Output",
        multiSelect: false,
        options: [
          { label: "Images", description: "Static branded release images." },
          {
            label: "Video",
            description: "Animated video (showcase / 3D tilt / simple fade).",
          },
          {
            label: "Both",
            description: "Generate both images and a video.",
          },
        ],
      },
      collected: state,
    };
  }

  if (!state.template) {
    return {
      step: "template",
      question:
        "Which template? Call bragfast_list_templates first, then ask the user to pick one.",
      hint:
        "Heuristics: mobile work (React Native / Swift / Flutter) → *-mobile; web/dashboard → *-browser; marketing/launches or unclear → hero. Pre-select based on context. After listing, present up to 4 candidates via AskUserQuestion (header: 'Template', single-select) with your recommendation labelled 'X (recommended)' first. Fall back to plain text if AskUserQuestion isn't available.",
      collected: state,
    };
  }

  if (!state.brand_id && !state.colors) {
    return {
      step: "brand_or_colors",
      question:
        "Which brand? Call bragfast_list_brands. If only one brand exists use it automatically. If none exist, ask the user for background, text, and primary hex colors.",
      hint:
        "If multiple brands exist, pick the one matching the project/repo name or present up to 4 brand candidates via AskUserQuestion (header: 'Brand', single-select). For free-form hex input (no brands), ask as plain text. Fall back to plain text if AskUserQuestion isn't available.",
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
      hint: ASK_USER_QUESTION_HINT,
      ask_user_question: {
        question: "Which output formats?",
        header: "Formats",
        multiSelect: true,
        options: [
          {
            label: "Landscape",
            description: "1200×675 — Twitter/X, blogs.",
          },
          {
            label: "Square",
            description: "1080×1080 — LinkedIn, Instagram.",
          },
          {
            label: "Portrait",
            description: "1080×1350 — Stories, TikTok.",
          },
        ],
      },
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
      hint: ASK_USER_QUESTION_HINT,
      ask_user_question: {
        question: "Which animation preset?",
        header: "Motion",
        multiSelect: false,
        options: [
          {
            label: "Showcase",
            description: "Cinematic rise + reveal.",
          },
          {
            label: "3D Tilt Angles",
            description: "Perspective tilt across planes.",
          },
          {
            label: "Simple Fade",
            description: "Clean fade-in.",
          },
        ],
      },
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
