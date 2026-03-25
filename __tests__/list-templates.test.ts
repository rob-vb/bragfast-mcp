import { describe, it, expect, vi } from "vitest";
import { BragfastApiClient } from "../src/lib/api-client.js";
import { listTemplates, getTemplate } from "../src/tools/list-templates.js";
import type { TemplateRecord } from "../src/lib/types.js";

function makeClient() {
  const client = new BragfastApiClient("https://test.brag.fast/api/v1");
  client.get = vi.fn();
  return client;
}

const sampleTemplate: TemplateRecord = {
  id: "tmpl_hero",
  name: "Hero",
  is_default: true,
  config: { version: 2, formats: {} },
  preview_url: "https://example.com/preview.jpg",
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

describe("listTemplates", () => {
  it("returns summaries without config", async () => {
    const client = makeClient();
    vi.mocked(client.get).mockResolvedValue({ templates: [sampleTemplate] });

    const result = await listTemplates(client);

    expect(client.get).toHaveBeenCalledWith("/templates");
    expect(result).toEqual({
      templates: [{ id: "tmpl_hero", name: "Hero", is_default: true, preview_url: "https://example.com/preview.jpg" }],
    });
    expect((result.templates[0] as Record<string, unknown>).config).toBeUndefined();
  });

  it("returns empty templates array when none exist", async () => {
    const client = makeClient();
    vi.mocked(client.get).mockResolvedValue({ templates: [] });

    const result = await listTemplates(client);

    expect(result).toEqual({ templates: [] });
  });
});

describe("getTemplate", () => {
  it("returns full config for a specific template", async () => {
    const client = makeClient();
    vi.mocked(client.get).mockResolvedValue({ templates: [sampleTemplate] });

    const result = await getTemplate(client, { template_id: "tmpl_hero" });

    expect(result).toEqual(sampleTemplate);
    expect(result.config).toEqual({ version: 2, formats: {} });
  });

  it("throws when template not found", async () => {
    const client = makeClient();
    vi.mocked(client.get).mockResolvedValue({ templates: [sampleTemplate] });

    await expect(getTemplate(client, { template_id: "nope" })).rejects.toThrow(
      'Template "nope" not found'
    );
  });
});
