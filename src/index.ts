#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod/v4";
import { BragfastApiClient } from "./lib/api-client.js";
import { generateImages } from "./tools/generate-images.js";
import { generateVideo } from "./tools/generate-video.js";
import { listBrands } from "./tools/list-brands.js";
import { listTemplates } from "./tools/list-templates.js";
import { checkAccount } from "./tools/check-account.js";
import { getRenderStatus } from "./tools/render-status.js";

const server = new McpServer({
  name: "bragfast",
  version: "0.1.0",
});

const client = new BragfastApiClient();

// 1. bragfast_generate_release_images
server.registerTool("bragfast_generate_release_images", {
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
            .enum(["landscape", "square", "portrait", "og"])
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
                    color: z.string().optional(),
                    image_frame: z
                      .enum(["browser", "mobile", "none"])
                      .optional(),
                    image_frame_color: z.string().optional(),
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
}, async (input) => {
  try {
    const result = await generateImages(client, input);
    return {
      content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
    };
  } catch (err) {
    return {
      content: [
        { type: "text" as const, text: `Error: ${(err as Error).message}` },
      ],
      isError: true,
    };
  }
});

// 2. bragfast_generate_release_video
server.registerTool("bragfast_generate_release_video", {
  title: "Generate Release Video",
  description:
    "Generate a branded release announcement video. Returns a cook_id immediately — use bragfast_get_render_status to poll for completion. Does not support 'og' format.",
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
                  image_url: z.string().optional(),
                  font_family: z.string().optional(),
                  color: z.string().optional(),
                  image_frame: z
                    .enum(["browser", "mobile", "none"])
                    .optional(),
                  image_frame_color: z.string().optional(),
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
        z.object({ duration: z.number().optional() }),
      ])
      .optional()
      .describe("Video options. Defaults to true."),
    metadata: z.string().optional(),
    webhook_url: z.string().optional(),
  }),
}, async (input) => {
  try {
    const result = await generateVideo(client, input);
    return {
      content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
    };
  } catch (err) {
    return {
      content: [
        { type: "text" as const, text: `Error: ${(err as Error).message}` },
      ],
      isError: true,
    };
  }
});

// 3. bragfast_list_brands
server.registerTool("bragfast_list_brands", {
  title: "List Brands",
  description: "List all brands associated with your Bragfast account.",
  inputSchema: z.object({}),
}, async () => {
  try {
    const brands = await listBrands(client);
    return {
      content: [{ type: "text" as const, text: JSON.stringify(brands, null, 2) }],
    };
  } catch (err) {
    return {
      content: [
        { type: "text" as const, text: `Error: ${(err as Error).message}` },
      ],
      isError: true,
    };
  }
});

// 4. bragfast_list_templates
server.registerTool("bragfast_list_templates", {
  title: "List Templates",
  description:
    "List all available templates with their full config including object IDs. Use object IDs when composing slides for generate_release_images/video.",
  inputSchema: z.object({}),
}, async () => {
  try {
    const result = await listTemplates(client);
    return {
      content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
    };
  } catch (err) {
    return {
      content: [
        { type: "text" as const, text: `Error: ${(err as Error).message}` },
      ],
      isError: true,
    };
  }
});

// 5. bragfast_check_account
server.registerTool("bragfast_check_account", {
  title: "Check Account",
  description: "Check your Bragfast account credits and plan.",
  inputSchema: z.object({}),
}, async () => {
  try {
    const info = await checkAccount(client);
    return {
      content: [{ type: "text" as const, text: JSON.stringify(info, null, 2) }],
    };
  } catch (err) {
    return {
      content: [
        { type: "text" as const, text: `Error: ${(err as Error).message}` },
      ],
      isError: true,
    };
  }
});

// 6. bragfast_get_render_status
server.registerTool("bragfast_get_render_status", {
  title: "Get Render Status",
  description:
    "Check the status of a render job. Returns status, and image/video URLs when complete.",
  inputSchema: z.object({
    cook_id: z
      .string()
      .describe(
        "The cook_id returned from generate_release_images or generate_release_video"
      ),
  }),
}, async (input) => {
  try {
    const result = await getRenderStatus(client, input);
    return {
      content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
    };
  } catch (err) {
    return {
      content: [
        { type: "text" as const, text: `Error: ${(err as Error).message}` },
      ],
      isError: true,
    };
  }
});

// Start server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Bragfast MCP Server running on stdio");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
