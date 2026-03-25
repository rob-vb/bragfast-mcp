import { describe, it, expect, vi } from "vitest";
import { BragfastApiClient } from "../src/lib/api-client.js";
import { listTemplates } from "../src/tools/list-templates.js";
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
  it("calls GET /templates and returns templates with config", async () => {
    const client = makeClient();
    vi.mocked(client.get).mockResolvedValue({ templates: [sampleTemplate] });

    const result = await listTemplates(client);

    expect(client.get).toHaveBeenCalledOnce();
    expect(client.get).toHaveBeenCalledWith("/templates");
    expect(result).toEqual({ templates: [sampleTemplate] });
    expect(result.templates[0].config).toEqual({ version: 2, formats: {} });
  });

  it("returns empty templates array when none exist", async () => {
    const client = makeClient();
    vi.mocked(client.get).mockResolvedValue({ templates: [] });

    const result = await listTemplates(client);

    expect(result).toEqual({ templates: [] });
  });
});
