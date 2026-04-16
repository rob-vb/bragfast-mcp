import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod/v4";
import { BragfastApiClient } from "./lib/api-client.js";
import { generateImages } from "./tools/generate-images.js";
import { generateVideo } from "./tools/generate-video.js";
import { listBrands } from "./tools/list-brands.js";
import { listTemplates, getTemplate } from "./tools/list-templates.js";
import { checkAccount } from "./tools/check-account.js";
import { getRenderStatus } from "./tools/render-status.js";
import { uploadImage } from "./tools/upload-image.js";
import { getUploadUrl } from "./tools/get-upload-url.js";
import { fetchImageAsBase64 } from "./lib/fetch-image.js";

export function createBragfastServer({
  apiClient,
}: {
  apiClient: BragfastApiClient;
}): McpServer {
  const server = new McpServer({
    name: "bragfast",
    version: "0.1.0",
  });

  // 1. bragfast_generate_release_images
  server.registerTool(
    "bragfast_generate_release_images",
    {
      title: "Generate Release Images",
      description:
        "Generate branded release announcement images. Returns a cook_id immediately — use bragfast_get_render_status to poll for completion.",
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
        "Generate a branded release announcement video. Returns a cook_id immediately — use bragfast_get_render_status to poll for completion. Supports landscape/square/portrait.\n\n" +
        "3 animation presets — always ask the user to pick one before generating:\n" +
        "- **showcase**: cinematic rise + reveal\n" +
        "- **3d-tilt-angles**: perspective tilt\n" +
        "- **simple-fade**: clean fade-in\n\n" +
        "Each object may include video_url (must be a publicly accessible URL) to play a clip in place of image_url. For local MP4 files or files at a public URL, call bragfast_get_upload_url with file_path or source_url — the MCP server returns the hosted URL to use as video_url.",
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
        "Check the status of a render job. Returns status, and image/video URLs when complete. Completed image renders are displayed inline; completed videos are returned as resource links (mimeType `video/mp4`) for the client to render or download.",
      inputSchema: z.object({
        cook_id: z
          .string()
          .describe(
            "The cook_id returned from generate_release_images or generate_release_video"
          ),
      }),
    },
    async (input) => {
      try {
        const result = await getRenderStatus(apiClient, input);
        const content: Array<
          | { type: "text"; text: string }
          | { type: "image"; data: string; mimeType: string; annotations?: { audience: ("user" | "assistant")[] } }
          | { type: "resource_link"; uri: string; name: string; mimeType: string; description?: string; annotations?: { audience: ("user" | "assistant")[] } }
        > = [{ type: "text" as const, text: JSON.stringify(result, null, 2) }];

        if (result.status === "completed" && result.images) {
          const urls = Object.values(result.images).flatMap((f) => f.slides);
          const fetches = await Promise.allSettled(
            urls.map((url) => fetchImageAsBase64(url))
          );
          for (const settled of fetches) {
            if (settled.status === "fulfilled" && settled.value) {
              content.push({
                type: "image" as const,
                data: settled.value.data,
                mimeType: settled.value.mimeType,
                annotations: { audience: ["user"] },
              });
            }
          }
        }

        if (result.status === "completed" && result.videos) {
          for (const [format, video] of Object.entries(result.videos)) {
            content.push({
              type: "resource_link" as const,
              uri: video.url,
              name: `${format}.mp4`,
              mimeType: "video/mp4",
              description: `${video.dimensions} · ${video.duration}s`,
              annotations: { audience: ["user"] },
            });
          }
        }

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
        "⛔ For claude.ai sandbox files (path starts with `/mnt/user-data/`): do NOT use this tool and do NOT base64-encode the file. Use `bragfast_get_upload_url` with `filename` only — it returns a curl command to upload directly from the sandbox.\n\n" +
        "Use this tool when:\n" +
        "- `file_path`: absolute local path on the MCP server host (Claude Code CLI only, never `/mnt/user-data/`)\n" +
        "- `source_url`: public URL — MCP server fetches and uploads (works in claude.ai)\n" +
        "- `file_base64` / `image_base64` + `filename`: base64 content already in context — small images only (<1MB, never videos)\n\n" +
        "If you already have a public URL, use it directly as image_url / video_url — no upload needed.",
      inputSchema: z.object({
        file_path: z
          .string()
          .optional()
          .describe("Absolute path to a local image or video file (Claude Code CLI only). NEVER use /mnt/user-data/ paths — those are Claude's internal sandbox, inaccessible to the MCP server. If the user attached a file in the conversation, ask for the real filesystem path or a public URL instead."),
        source_url: z
          .string()
          .optional()
          .describe(
            "Publicly accessible URL to fetch the file from (Dropbox direct-download, Google Drive, GitHub raw, etc.). MCP server downloads and re-uploads — works in Claude.ai sandbox where direct uploads are proxy-blocked."
          ),
        file_base64: z
          .string()
          .optional()
          .describe("Base64-encoded file content for images or small videos"),
        image_base64: z
          .string()
          .optional()
          .describe("Alias for file_base64 (legacy)"),
        filename: z
          .string()
          .optional()
          .describe("Filename with extension — required with file_base64/image_base64, optional with source_url if URL path contains filename"),
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
        "Upload a file to Bragfast. Returns a hosted URL (`url`) to use as image_url or video_url.\n\n" +
        "Two modes:\n" +
        "- `source_url` → fetch from a public URL (works everywhere)\n" +
        "- `filename` only → get a one-time curl-able upload URL for files in the claude.ai sandbox (path starts with `/mnt/user-data/`). Requires shell access to run the returned curl command.\n\n" +
        "For the `filename`-only mode: the response includes an `instructions` field with a ready-to-run curl command. Execute it — curl POSTs the file directly to brag.fast and returns `{ url }`. Use that url as image_url / video_url.\n\n" +
        "If curl fails with `host_not_allowed` or 403: ask the user to add `brag.fast` to Settings → Capabilities → Network Egress → Additional allowed domains.",
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
            text: `Help me create release announcement content using the bragfast MCP tools. Follow this workflow step by step:

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
   - **File attached in claude.ai (path starts with /mnt/user-data/)?** Call \`bragfast_get_upload_url\` with just \`filename\`, then run the returned \`instructions\` curl in the sandbox. The curl POSTs to \`brag.fast\` and returns \`{ url }\` — use that as \`image_url\` / \`video_url\`. If curl fails with \`host_not_allowed\`, ask the user to add \`brag.fast\` to Settings → Capabilities → Network Egress.
   - **Local file in Claude Code CLI?** Ask the user for the absolute file path (e.g. /Users/name/Desktop/hero.jpg), then use \`bragfast_upload_image\` with \`file_path\` — tool uploads automatically.
   - **File at a public URL (Dropbox, Google Drive, GitHub raw, WeTransfer)?** Use \`bragfast_get_upload_url\` with \`source_url\` — works in claude.ai and Claude Code.
   - **File >4MB attached in claude.ai?** The curl path is capped at 4MB. Ask the user to host the file publicly (Dropbox, WeTransfer) and pass it as \`source_url\`.
   - **Small image/logo only (<4MB)?** \`bragfast_upload_image\` with \`file_base64\` works. Do NOT use base64 for videos or large files — it will crash the session.

## Step 2: Brand & Template Setup

Call \`bragfast_check_account\`, \`bragfast_list_brands\`, and \`bragfast_list_templates\` in parallel.

- Warn me if credits are low before proceeding.
- If only one brand exists, use it automatically. If multiple, pick the one matching the repo name. If unclear, ask me.
- If no brands exist, ask for colors (background, text, primary as hex).

Pick a template based on context:
- Mobile work (React Native, Swift, Flutter) → \`*-mobile\` template
- Web/dashboard/browser UI → \`*-browser\` template
- Marketing, launches, or unclear → \`hero\` template

Show your reasoning and let me confirm or change the choice.

## Step 3: Compose Slides

1. Call \`bragfast_get_template\` for the chosen template to get object IDs.
2. For each slide, write a short punchy title (~40 chars max) and 1-2 line description.
3. Map content to object IDs from the template config (\`title\`, \`description\`, \`image\`).
4. Show the final slide plan and get my approval before generating.

## Step 4: Generate

**Important:** The \`formats\` parameter must be a JSON array of objects, not a string.

**Polling rules — renders take time, do NOT poll too fast:**
- Images: wait 60 seconds before first check, then 30 seconds between retries (max 5 attempts).
- Video: wait 60 seconds before first check, then 30 seconds between retries (max 8 attempts).

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
