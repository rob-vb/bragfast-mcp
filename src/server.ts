import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod/v4";
import { BragfastApiClient } from "./lib/api-client.js";
import { generateImages } from "./tools/generate-images.js";
import { generateVideo } from "./tools/generate-video.js";
import { listBrands } from "./tools/list-brands.js";
import { listTemplates, getTemplate } from "./tools/list-templates.js";
import { checkAccount } from "./tools/check-account.js";
import { getRenderStatus, buildRenderStatusContent } from "./tools/render-status.js";
import { uploadImage } from "./tools/upload-image.js";
import { getUploadUrl } from "./tools/get-upload-url.js";
import { startCook } from "./tools/start-cook.js";
import {
  listDrafts,
  getDraft,
  approveDraft,
  dismissDraft,
  updateDraftCopy,
  promoteDraftToVideo,
  type DraftStatus,
} from "./tools/drafts.js";

export function createBragfastServer({
  apiClient,
}: {
  apiClient: BragfastApiClient;
}): McpServer {
  const server = new McpServer(
    {
      name: "bragfast",
      version: "0.1.0",
    },
    {
      instructions: [
        "brag.fast — branded release image and video generator.",
        "",
        'WORKFLOW: When a user asks to generate, announce a release, or "use bragfast", you MUST call bragfast_start_cook first. It walks through a 7-step wizard (output type → template → brand/colors → visual → title + description → formats → [video preset]). Call it with {} to begin; after each user answer, call it again with collected updated. Do NOT call bragfast_generate_release_images or bragfast_generate_release_video until bragfast_start_cook returns step "ready".',
        "",
        'If the user provides partial info up-front (e.g. "landscape format only"), pre-fill those fields in collected — still walk the remaining questions.',
        "",
        "RENDERING CHOICES: When bragfast_start_cook returns an `ask_user_question` payload, present it to the user by calling the AskUserQuestion tool (available in Claude Code and similar clients) with that exact payload — do not paste the options as plain text. If AskUserQuestion isn't available in the current client, fall back to plain-text choices.",
      ].join("\n"),
    }
  );

  // 0. bragfast_start_cook — guided wizard entry point
  server.registerTool(
    "bragfast_start_cook",
    {
      title: "Start Cook Wizard",
      description:
        "START HERE when a user asks to generate release images or video with bragfast. Returns the next question in the step-by-step wizard (Recipe → Seasoning → Ingredients → Plating, mirroring the brag.fast Cook page). Call with {} to begin. After each user answer, call again with `collected` updated. When step is `ready`, all info is gathered — proceed to call bragfast_get_template then the appropriate generate tool.",
      inputSchema: z.object({
        collected: z
          .object({
            output_type: z.enum(["images", "video", "both"]).optional(),
            template: z.string().optional(),
            brand_id: z.string().optional(),
            colors: z
              .object({
                background: z.string(),
                text: z.string(),
                primary: z.string(),
              })
              .optional(),
            visual_url: z.string().optional(),
            title: z.string().optional(),
            description: z.string().optional(),
            formats: z
              .array(z.enum(["landscape", "square", "portrait"]))
              .optional(),
            video_preset: z
              .enum(["showcase", "3d-tilt-angles", "simple-fade"])
              .optional(),
          })
          .optional()
          .describe(
            "Answers collected so far. Omit or pass {} to start fresh; update between calls as the user answers questions."
          ),
      }),
    },
    async (input) => {
      const result = startCook(input.collected ?? {});
      return {
        content: [
          { type: "text" as const, text: JSON.stringify(result, null, 2) },
        ],
      };
    }
  );

  // 1. bragfast_generate_release_images
  server.registerTool(
    "bragfast_generate_release_images",
    {
      title: "Generate Release Images",
      description:
        "STOP — pre-flight checklist required before calling this tool.\n\n" +
        "You MUST have already collected ALL of the following via bragfast_start_cook (or by asking the user directly):\n" +
        "  1. Template — call bragfast_list_templates, show options, confirm choice\n" +
        "  2. Brand or colors — call bragfast_list_brands; if none, ask for bg/text/primary hex\n" +
        "  3. Visual — screenshot URL or 'none'\n" +
        "  4. Title + description — short punchy copy per slide\n" +
        "  5. Formats — one or more of: landscape, square, portrait\n\n" +
        "If any item is unknown, do NOT call this tool. Call bragfast_start_cook with what you have so far to get the next question.\n\n" +
        "When ready: builds branded static release images. Returns a cook_id — poll with bragfast_get_render_status.",
      inputSchema: z.object({
        brand_id: z.string().optional().describe("Brand ID to use for styling"),
        colors: z
          .object({
            background: z.string(),
            text: z.string(),
            primary: z.string(),
          })
          .optional()
          .describe("Custom colors (hex). Required if no brand_id."),
        name: z.string().optional().describe("Brand name override"),
        logo_url: z.string().optional().describe("Logo URL override"),
        font_family: z.string().optional().describe("Font family override"),
        template: z
          .string()
          .optional()
          .describe(
            "Template ID (e.g. standard-browser, split-mobile, hero, or tmpl_*)"
          ),
        formats: z
          .array(
            z.object({
              name: z
                .enum(["landscape", "square", "portrait"])
                .describe("Output format"),
              slides: z.array(
                z.object({
                  objects: z
                    .array(
                      z.object({
                        id: z.string().describe("Object ID from template config"),
                        text: z.string().optional(),
                        image_url: z.string().optional(),
                        font_family: z.string().optional(),
                        font_weight: z.number().optional(),
                        color: z.string().optional(),
                        visual_frame: z
                          .enum(["browser", "mobile", "none"])
                          .optional(),
                        visual_frame_color: z.string().optional(),
                        anchor_x: z.enum(["left", "center", "right"]).optional(),
                        anchor_y: z.enum(["top", "center", "bottom"]).optional(),
                      })
                    )
                    .optional(),
                })
              ),
            })
          )
          .describe("Formats and slide content"),
        metadata: z.string().optional().describe("Arbitrary metadata string"),
        webhook_url: z
          .string()
          .optional()
          .describe("Webhook URL for completion notification"),
      }),
    },
    async (input) => {
      try {
        const result = await generateImages(apiClient, input);
        return {
          content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
        };
      } catch (err) {
        return {
          content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }],
          isError: true,
        };
      }
    }
  );

  // 2. bragfast_generate_release_video
  server.registerTool(
    "bragfast_generate_release_video",
    {
      title: "Generate Release Video",
      description:
        "STOP — pre-flight checklist required before calling this tool.\n\n" +
        "You MUST have already collected ALL of the following via bragfast_start_cook (or by asking the user directly):\n" +
        "  1. Template — call bragfast_list_templates, show options, confirm choice\n" +
        "  2. Brand or colors — call bragfast_list_brands; if none, ask for bg/text/primary hex\n" +
        "  3. Visual — screenshot or video clip URL, or 'none'\n" +
        "  4. Title + description — short punchy copy per slide\n" +
        "  5. Formats — one or more of: landscape, square, portrait\n" +
        "  6. Animation preset — showcase (cinematic rise + reveal), 3d-tilt-angles (perspective tilt), or simple-fade (clean fade-in). ALWAYS ask, never default silently.\n\n" +
        "If any item is unknown, do NOT call this tool. Call bragfast_start_cook with what you have so far to get the next question.\n\n" +
        "When ready: builds an animated branded release video. Each object may include video_url (public MP4/WebM/MOV) to play a clip in place of image_url. For local MP4 files or files at a public URL, call bragfast_get_upload_url with file_path or source_url — the MCP server returns the hosted URL to use as video_url. Returns a cook_id — poll with bragfast_get_render_status.",
      inputSchema: z.object({
        brand_id: z.string().optional(),
        colors: z
          .object({ background: z.string(), text: z.string(), primary: z.string() })
          .optional(),
        name: z.string().optional(),
        logo_url: z.string().optional(),
        font_family: z.string().optional(),
        template: z.string().optional(),
        formats: z.array(
          z.object({
            name: z.enum(["landscape", "square", "portrait"]),
            slides: z.array(
              z.object({
                objects: z
                  .array(
                    z.object({
                      id: z.string(),
                      text: z.string().optional(),
                      image_url: z
                        .string()
                        .optional()
                        .describe("Fallback image when video_url is not set"),
                      video_url: z
                        .string()
                        .optional()
                        .describe("MP4/WebM/MOV clip to play in place of image_url"),
                      font_family: z.string().optional(),
                      font_weight: z.number().optional(),
                      color: z.string().optional(),
                      visual_frame: z
                        .enum(["browser", "mobile", "none"])
                        .optional(),
                      visual_frame_color: z.string().optional(),
                      anchor_x: z.enum(["left", "center", "right"]).optional(),
                      anchor_y: z.enum(["top", "center", "bottom"]).optional(),
                    })
                  )
                  .optional(),
              })
            ),
          })
        ),
        video: z
          .union([
            z.literal(true),
            z.object({
              duration: z
                .number()
                .optional()
                .describe("Per-slide duration in seconds (3-30, default 8, max 60 total)"),
              preset: z
                .enum(["showcase", "3d-tilt-angles", "simple-fade"])
                .optional()
                .describe(
                  "Animation preset. showcase = cinematic rise + reveal; 3d-tilt-angles = perspective tilt; simple-fade = clean fade-in. ALWAYS ask the user which preset to use before generating — do not default silently."
                ),
            }),
          ])
          .optional()
          .describe("Video options. Defaults to true."),
        metadata: z.string().optional(),
        webhook_url: z.string().optional(),
      }),
    },
    async (input) => {
      try {
        const result = await generateVideo(apiClient, input);
        return {
          content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
        };
      } catch (err) {
        return {
          content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }],
          isError: true,
        };
      }
    }
  );

  // 3. bragfast_list_brands
  server.registerTool(
    "bragfast_list_brands",
    {
      title: "List Brands",
      description: "List all brands associated with your Bragfast account.",
      inputSchema: z.object({}),
    },
    async () => {
      try {
        const brands = await listBrands(apiClient);
        return {
          content: [{ type: "text" as const, text: JSON.stringify(brands, null, 2) }],
        };
      } catch (err) {
        return {
          content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }],
          isError: true,
        };
      }
    }
  );

  // 4. bragfast_list_templates
  server.registerTool(
    "bragfast_list_templates",
    {
      title: "List Templates",
      description:
        "List available templates (name, ID, default status). Use bragfast_get_template to get the full config with object IDs for a specific template.",
      inputSchema: z.object({}),
    },
    async () => {
      try {
        const result = await listTemplates(apiClient);
        return {
          content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
        };
      } catch (err) {
        return {
          content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }],
          isError: true,
        };
      }
    }
  );

  // 4b. bragfast_get_template
  server.registerTool(
    "bragfast_get_template",
    {
      title: "Get Template",
      description:
        "Get the full config for a specific template, including object IDs needed to compose slides for generate_release_images/video.",
      inputSchema: z.object({
        template_id: z
          .string()
          .describe(
            "Template ID from bragfast_list_templates (e.g. standard-browser, hero, or tmpl_*)"
          ),
      }),
    },
    async (input) => {
      try {
        const template = await getTemplate(apiClient, input);
        return {
          content: [{ type: "text" as const, text: JSON.stringify(template, null, 2) }],
        };
      } catch (err) {
        return {
          content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }],
          isError: true,
        };
      }
    }
  );

  // 5. bragfast_check_account
  server.registerTool(
    "bragfast_check_account",
    {
      title: "Check Account",
      description: "Check your Bragfast account credits and plan.",
      inputSchema: z.object({}),
    },
    async () => {
      try {
        const info = await checkAccount(apiClient);
        return {
          content: [{ type: "text" as const, text: JSON.stringify(info, null, 2) }],
        };
      } catch (err) {
        return {
          content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }],
          isError: true,
        };
      }
    }
  );

  // 6. bragfast_get_render_status
  server.registerTool(
    "bragfast_get_render_status",
    {
      title: "Get Render Status",
      description:
        "Check the status of a render job. Returns status, and image/video URLs when complete. When images are ready, the tool response includes a markdown snippet — you MUST copy that exact `![name](url)` markdown into your reply so the image renders inline in the chat (not hidden behind the tool-result card). Videos are returned as resource links (mimeType `video/mp4`) for the client to render or download.\n\n" +
        "Polling strategy — use the `wait_seconds` parameter to long-poll server-side. NEVER use a shell `sleep` or `Bash` timer to wait between polls; the `wait_seconds` value IS the wait.\n" +
        "- Images: first call with wait_seconds=10 (usually done). If still rendering, call again with wait_seconds=55.\n" +
        "- Video: first call with wait_seconds=55. If still rendering, call again with wait_seconds=55. Most videos finish within the second call.\n" +
        "- If still not done, call again with wait_seconds=55 (max 2 extra retries).",
      inputSchema: z.object({
        cook_id: z
          .string()
          .describe(
            "The cook_id returned from generate_release_images or generate_release_video"
          ),
        wait_seconds: z
          .number()
          .int()
          .min(0)
          .max(55)
          .optional()
          .describe(
            "Server-side long-poll: block up to this many seconds (max 55) waiting for the render to reach a terminal status. Default 0 = return immediately. Use 55 on second+ polls to collapse many polls into one tool call."
          ),
      }),
    },
    async (input) => {
      try {
        const result = await getRenderStatus(apiClient, input);
        const content = await buildRenderStatusContent(result);
        return { content };
      } catch (err) {
        return {
          content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }],
          isError: true,
        };
      }
    }
  );

  // 7. bragfast_upload_image
  server.registerTool(
    "bragfast_upload_image",
    {
      title: "Upload Image or Video",
      description:
        "Upload an image or video to Bragfast and get a hosted URL. Supports PNG/JPG/WebP/SVG and MP4/WebM/MOV.\n\n" +
        "Input modes:\n" +
        "- `file_path`: pass the file path — including `/mnt/user-data/` sandbox paths from claude.ai attachments. Tool auto-detects sandbox paths and returns a curl-able upload URL (R2 presigned PUT) + ready-to-run curl command. Requires shell access to run the curl command, e.g. Claude Code or claude.ai sandbox. Do NOT base64-encode the file.\n" +
        "- `source_url`: public URL — MCP server fetches and uploads server-side.\n\n" +
        "If you already have a public URL, use it directly as image_url / video_url — no upload needed.",
      inputSchema: z.object({
        file_path: z
          .string()
          .optional()
          .describe("Path to the file. Pass /mnt/user-data/ sandbox paths directly — tool returns a curl-able upload URL (R2 presigned PUT) + command. Requires shell access to run the curl command."),
        source_url: z
          .string()
          .optional()
          .describe(
            "Publicly accessible URL to fetch the file from (Dropbox direct-download, Google Drive, GitHub raw, etc.). MCP server downloads and re-uploads server-side."
          ),
        file_base64: z
          .string()
          .optional()
          .describe("Deprecated — prefer file_path (sandbox) or source_url (public URL). Present for backward compat."),
        image_base64: z
          .string()
          .optional()
          .describe("Alias for file_base64 (legacy). Deprecated."),
        filename: z
          .string()
          .optional()
          .describe("Filename with extension — optional with source_url if URL path contains filename."),
      }),
    },
    async (input) => {
      try {
        const result = await uploadImage(apiClient, input);
        return {
          content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
        };
      } catch (err) {
        return {
          content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }],
          isError: true,
        };
      }
    }
  );

  // 8. bragfast_get_upload_url
  server.registerTool(
    "bragfast_get_upload_url",
    {
      title: "Upload Video or Large Image",
      description:
        "Returns a ready-to-run curl command for uploading local files (up to 50MB). Execute the returned `instructions` field using the Bash tool directly — do NOT base64-encode the file.\n\n" +
        "Use the returned `url` field as image_url or video_url in generate calls.\n\n" +
        "Two modes:\n" +
        "- `filename` only → returns R2-signed PUT URL for sandbox attachments (path starts with `/mnt/user-data/`). Sandbox runs the curl.\n" +
        "- `source_url` → MCP server fetches from a public URL and uploads server-side; returns `{ url }` directly.",
      inputSchema: z.object({
        filename: z
          .string()
          .describe("Filename with extension (e.g. screenshot.png, demo.mp4)"),
        file_path: z
          .string()
          .optional()
          .describe("Absolute path to a local file (Claude Code CLI only). NEVER use /mnt/user-data/ paths — those are Claude's internal sandbox, not accessible to the MCP server."),
        source_url: z
          .string()
          .optional()
          .describe("Public URL to fetch the file from. MCP server downloads and uploads — works in Claude.ai sandbox."),
      }),
    },
    async (input) => {
      try {
        const result = await getUploadUrl(apiClient, input);
        return {
          content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
        };
      } catch (err) {
        return {
          content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }],
          isError: true,
        };
      }
    }
  );

  // ─────────────────────────────────────────────────────────────
  // DRAFTS (agent-drafted brag posts)
  //
  // brag.fast runs a daily cron that reads the user's watched GitHub repos,
  // picks one brag-worthy commit with Haiku, and drops a pending draft into
  // their account. These tools let an agent review, edit, and approve those
  // drafts on the user's behalf. The final "post to social" step remains
  // human — these tools never publish.
  // ─────────────────────────────────────────────────────────────

  server.registerTool(
    "bragfast_list_drafts",
    {
      title: "List Drafts",
      description:
        "List agent-drafted brag posts waiting for approval. Optional status filter (pending_review is the most useful). Returns copy, source repo/commit, suggested template+format, and status for each.",
      inputSchema: z.object({
        status: z
          .enum(["pending_review", "approved", "dismissed", "expired", "error"])
          .optional()
          .describe("Filter by status (default: pending_review)"),
        limit: z.number().int().min(1).max(200).optional(),
      }),
    },
    async (input) => {
      try {
        const status: DraftStatus = input.status ?? "pending_review";
        const drafts = await listDrafts(apiClient, { status, limit: input.limit });
        return {
          content: [{ type: "text" as const, text: JSON.stringify(drafts, null, 2) }],
        };
      } catch (err) {
        return {
          content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }],
          isError: true,
        };
      }
    },
  );

  server.registerTool(
    "bragfast_get_draft",
    {
      title: "Get Draft",
      description:
        "Fetch a single draft by ID. Returns full content including the originally generated copy (useful for showing the user what Haiku wrote vs what they edited).",
      inputSchema: z.object({
        draft_id: z.string().describe("Draft ID returned by bragfast_list_drafts"),
      }),
    },
    async (input) => {
      try {
        const draft = await getDraft(apiClient, input.draft_id);
        return {
          content: [{ type: "text" as const, text: JSON.stringify(draft, null, 2) }],
        };
      } catch (err) {
        return {
          content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }],
          isError: true,
        };
      }
    },
  );

  server.registerTool(
    "bragfast_update_draft_copy",
    {
      title: "Update Draft Copy",
      description:
        "Rewrite the draft tweet copy before approval. 1-280 chars. Fails if the draft is already approved or dismissed.",
      inputSchema: z.object({
        draft_id: z.string(),
        copy: z.string().min(1).max(280),
      }),
    },
    async (input) => {
      try {
        await updateDraftCopy(apiClient, input.draft_id, input.copy);
        return { content: [{ type: "text" as const, text: "Draft copy updated." }] };
      } catch (err) {
        return {
          content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }],
          isError: true,
        };
      }
    },
  );

  server.registerTool(
    "bragfast_approve_draft",
    {
      title: "Approve Draft",
      description:
        "Approve a draft and kick off the image render. Use bragfast_get_render_status with the returned cook_id to poll. Optional edited_copy lets you tweak the tweet in the same call.",
      inputSchema: z.object({
        draft_id: z.string(),
        edited_copy: z
          .string()
          .min(1)
          .max(280)
          .optional()
          .describe("If present, replaces the draft copy before approval."),
        upload_id: z
          .string()
          .optional()
          .describe(
            "Optional upload ID (from bragfast_upload_image) to attach a user-provided screenshot to the draft before rendering.",
          ),
      }),
    },
    async (input) => {
      try {
        const result = await approveDraft(apiClient, input.draft_id, {
          editedCopy: input.edited_copy,
          uploadId: input.upload_id,
        });
        return {
          content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
        };
      } catch (err) {
        return {
          content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }],
          isError: true,
        };
      }
    },
  );

  server.registerTool(
    "bragfast_dismiss_draft",
    {
      title: "Dismiss Draft",
      description:
        "Dismiss a draft without rendering. Use when Haiku's pick isn't worth posting. The underlying commit won't be re-drafted today (dedup), but tomorrow's cron is unaffected.",
      inputSchema: z.object({ draft_id: z.string() }),
    },
    async (input) => {
      try {
        await dismissDraft(apiClient, input.draft_id);
        return { content: [{ type: "text" as const, text: "Draft dismissed." }] };
      } catch (err) {
        return {
          content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }],
          isError: true,
        };
      }
    },
  );

  server.registerTool(
    "bragfast_promote_draft_to_video",
    {
      title: "Promote Draft to Video",
      description:
        "After a draft is approved, upgrade it to a showcase video using the same copy and template. Idempotent — calling twice returns the existing video cook_id without charging again. Separate credit charge from the image.",
      inputSchema: z.object({ draft_id: z.string() }),
    },
    async (input) => {
      try {
        const result = await promoteDraftToVideo(apiClient, input.draft_id);
        return {
          content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
        };
      } catch (err) {
        return {
          content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }],
          isError: true,
        };
      }
    },
  );

  // Guided workflow prompt — for Claude Desktop, Claude.ai, and other MCP clients
  // that don't have the bragfast skill available.
  server.registerPrompt(
    "bragfast",
    {
      title: "Generate Release Announcement",
      description:
        "Guided workflow to create branded release images or video from your recent work.",
    },
    () => ({
      messages: [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text: `Help me create release announcement content using the bragfast MCP tools. Follow this workflow step by step.

If you have not yet called \`bragfast_start_cook\`, call it now with \`{}\` before anything else — it returns the next wizard question and keeps you aligned with the steps below.

## Step 1: Gather Content

Try these sources in order:
- **Git history (preferred):** If in a git repo, look at recent changes. On a feature branch, diff against the default branch. On main/master, check the last ~5 commits. Extract 3-5 announcement-worthy changes, prioritising user-facing features over internal refactors.
- **Conversation context:** Look for features, bug fixes, version numbers, or changelogs already mentioned.
- **Ask me:** If neither yields content, ask: "What should the release images cover? You can describe the features, paste a changelog, or share a GitHub release URL."

Present the proposed slides for my approval before continuing:
\`\`\`
Here's what I'd put on the slides:

1. **[Title]** — "[Description]"
2. **[Title]** — "[Description]"
3. **[Title]** — "[Description]"

You can edit, remove, or add slides — or say "looks good" to continue.
\`\`\`

After I approve, ask me:
1. **Output type:** Images (static), Video (animated), or Both? If video, ask which animation preset: Showcase (cinematic rise + reveal), 3D Tilt Angles (perspective tilt), or Simple Fade (clean fade-in).
2. **Formats:** Landscape (Twitter/X, blogs), Portrait (Stories, TikTok), Square (LinkedIn, Instagram) — I can pick multiple.
3. **Screenshots/videos:** Do I have screenshots or video clips to include? Options:
   - **Already have a public URL?** Use it directly as \`image_url\` or \`video_url\` — no upload needed.
   - **File attached in claude.ai (path starts with /mnt/user-data/)?** Call \`bragfast_get_upload_url\` with just \`filename\`. Response includes a ready-to-run curl command and the final public \`url\`. Execute the \`instructions\` field using the Bash tool directly, then use \`url\` as \`image_url\` / \`video_url\`. Do NOT base64-encode the file.
   - **Local file in Claude Code CLI?** Ask the user for the absolute file path (e.g. /Users/name/Desktop/hero.jpg), then use \`bragfast_upload_image\` with \`file_path\` — tool uploads automatically.
   - **File at a public URL (Dropbox, Google Drive, GitHub raw, WeTransfer)?** Use \`bragfast_get_upload_url\` with \`source_url\` — works in claude.ai and Claude Code.

## Step 2: Brand & Template Setup

Call \`bragfast_check_account\`, \`bragfast_list_brands\`, and \`bragfast_list_templates\` in parallel.

- Warn me if credits are low before proceeding.
- If only one brand exists, use it automatically. If multiple, pick the one matching the repo name. If unclear, ask me.
- If no brands exist, ask for colors (background, text, primary as hex).

Pick a template based on context:
- Mobile work (React Native, Swift, Flutter) → \`*-mobile\` template
- Explicit marketing/launch/product announcement with a hero asset → \`hero\` template
- Everything else (web/dashboard/browser UI, unclear) → \`split-browser\` (default fallback)

Show your reasoning and let me confirm or change the choice.

## Step 3: Compose Slides

1. Call \`bragfast_get_template\` for the chosen template to get object IDs.
2. For each slide, write a short punchy title (~40 chars max) and 1-2 line description.
3. Map content to object IDs from the template config (\`title\`, \`description\`, \`image\`).
4. Show the final slide plan and get my approval before generating.

## Step 4: Generate

**Important:** The \`formats\` parameter must be a JSON array of objects, not a string.

**Polling rules — use the \`wait_seconds\` parameter to long-poll server-side. NEVER use a shell \`sleep\` / \`Bash\` timer to wait between polls; \`wait_seconds\` IS the wait.**
- Images: call \`bragfast_get_render_status\` with \`wait_seconds: 10\` (images usually finish fast). If still rendering, call again with \`wait_seconds: 55\`. Max 2 extra retries after that.
- Video: call with \`wait_seconds: 55\`. If still rendering, call again with \`wait_seconds: 55\` — most videos finish in this window. Max 2 extra retries after that.

After results: show the image/video URLs, report credits used and remaining, and offer to generate in other formats or as video/images if I only did one.

## Error Handling

- **Not authenticated:** Tell me to connect the bragfast MCP server and authenticate.
- **Insufficient credits:** Show credits needed and link to brag.fast for billing.
- **Render fails:** Show the error — credits are auto-refunded.

---

Start now: check the git history (or ask me what to cover), then present the slide plan.`,
          },
        },
      ],
    })
  );

  return server;
}
