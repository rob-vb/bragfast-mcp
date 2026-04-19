import { describe, it, expect, vi } from "vitest";
import { BragfastApiClient } from "../src/lib/api-client.js";
import { createDraftFromCommits, createDraft } from "../src/tools/drafts.js";

function makeClient() {
  const client = new BragfastApiClient("https://test.brag.fast/api/v1");
  client.post = vi.fn();
  return client;
}

describe("createDraftFromCommits (Shape A)", () => {
  it("POSTs /drafts/from-commits with input and returns draft", async () => {
    const client = makeClient();
    vi.mocked(client.post).mockResolvedValue({ id: "d_1", status: "pending_review" });

    const result = await createDraftFromCommits(client, {
      repoFullName: "rob-vb/bragfast",
    });

    expect(client.post).toHaveBeenCalledWith("/drafts/from-commits", {
      repoFullName: "rob-vb/bragfast",
    });
    expect(result).toEqual({ id: "d_1", status: "pending_review" });
  });

  it("passes through skipped responses without throwing", async () => {
    const client = makeClient();
    vi.mocked(client.post).mockResolvedValue({ skipped: "dedup" });

    const result = await createDraftFromCommits(client, { repoFullName: "rob-vb/bragfast" });

    expect(result).toEqual({ skipped: "dedup" });
  });
});

describe("createDraft (Shape B)", () => {
  it("POSTs /drafts with full body and returns draft", async () => {
    const client = makeClient();
    vi.mocked(client.post).mockResolvedValue({ id: "d_2", status: "pending_review" });

    const result = await createDraft(client, {
      copy: "shipped foo",
      templateId: "split-browser",
      format: "landscape",
      aiContent: [{ id: "title", text: "Foo" }],
    });

    expect(client.post).toHaveBeenCalledWith("/drafts", {
      copy: "shipped foo",
      templateId: "split-browser",
      format: "landscape",
      aiContent: [{ id: "title", text: "Foo" }],
    });
    expect(result).toEqual({ id: "d_2", status: "pending_review" });
  });

  it("passes through skipped responses without throwing", async () => {
    const client = makeClient();
    vi.mocked(client.post).mockResolvedValue({ skipped: "dedup" });

    const result = await createDraft(client, {
      copy: "x",
      templateId: "t",
      format: "landscape",
      aiContent: [],
    });

    expect(result).toEqual({ skipped: "dedup" });
  });
});
