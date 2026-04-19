import { describe, it, expect, vi } from "vitest";
import { BragfastApiClient } from "../src/lib/api-client.js";
import { analyzeCommits, suggestTemplate, fillTemplateObjects } from "../src/tools/ai.js";

function makeClient() {
  const client = new BragfastApiClient("https://test.brag.fast/api/v1");
  client.post = vi.fn();
  return client;
}

describe("analyzeCommits", () => {
  it("POSTs /ai/analyze-commits and returns analysis", async () => {
    const client = makeClient();
    vi.mocked(client.post).mockResolvedValue({
      worthPosting: true,
      chosenCommitSha: "abc123",
      draftCopy: "shipped foo",
    });

    const result = await analyzeCommits(client, {
      repoFullName: "rob-vb/bragfast",
      commits: [{ sha: "abc123", message: "feat: foo" }],
    });

    expect(client.post).toHaveBeenCalledWith("/ai/analyze-commits", {
      repoFullName: "rob-vb/bragfast",
      commits: [{ sha: "abc123", message: "feat: foo" }],
    });
    expect(result.worthPosting).toBe(true);
    expect(result.draftCopy).toBe("shipped foo");
  });
});

describe("suggestTemplate", () => {
  it("POSTs /ai/suggest-template and returns pick", async () => {
    const client = makeClient();
    vi.mocked(client.post).mockResolvedValue({
      templateId: "split-browser",
      format: "landscape",
    });

    const result = await suggestTemplate(client, { copy: "shipped foo" });

    expect(client.post).toHaveBeenCalledWith("/ai/suggest-template", { copy: "shipped foo" });
    expect(result).toEqual({ templateId: "split-browser", format: "landscape" });
  });
});

describe("fillTemplateObjects", () => {
  it("POSTs /ai/fill-template-objects and returns objects", async () => {
    const client = makeClient();
    vi.mocked(client.post).mockResolvedValue({
      objects: [{ id: "title", text: "Foo" }],
    });

    const result = await fillTemplateObjects(client, {
      templateId: "split-browser",
      format: "landscape",
      context: { draftCopy: "shipped foo" },
    });

    expect(client.post).toHaveBeenCalledWith("/ai/fill-template-objects", {
      templateId: "split-browser",
      format: "landscape",
      context: { draftCopy: "shipped foo" },
    });
    expect(result.objects).toHaveLength(1);
  });
});
