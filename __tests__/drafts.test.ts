import { describe, it, expect, vi } from "vitest";
import { BragfastApiClient } from "../src/lib/api-client.js";
import {
  createDraft,
  listDrafts,
  getDraft,
  deleteDraft,
} from "../src/tools/drafts.js";

function makeClient() {
  const client = new BragfastApiClient("https://test.brag.fast/api/v1");
  client.post = vi.fn();
  client.get = vi.fn();
  client.delete = vi.fn();
  return client;
}

describe("createDraft", () => {
  it("POSTs /drafts with input and returns the created draft", async () => {
    const client = makeClient();
    vi.mocked(client.post).mockResolvedValue({ id: "d_1" });

    const input = {
      output: "image" as const,
      name: "My Draft",
      templateId: "split-browser",
      formats: ["landscape" as const],
      objectContent: { title: { text: "Foo" } },
    };
    const result = await createDraft(client, input);

    expect(client.post).toHaveBeenCalledWith("/drafts", input);
    expect(result).toEqual({ id: "d_1" });
  });

  it("forwards video-output drafts unchanged", async () => {
    const client = makeClient();
    vi.mocked(client.post).mockResolvedValue({ id: "d_2" });

    const input = {
      output: "video" as const,
      video: { duration: 8, preset: "showcase" },
    };
    const result = await createDraft(client, input);

    expect(client.post).toHaveBeenCalledWith("/drafts", input);
    expect(result).toEqual({ id: "d_2" });
  });
});

describe("listDrafts", () => {
  it("GETs /drafts and returns the array", async () => {
    const client = makeClient();
    const drafts = [
      {
        id: "d_1",
        name: null,
        source: "agent",
        created_at: "2026-04-20T00:00:00Z",
        config: { output: "image" },
      },
    ];
    vi.mocked(client.get).mockResolvedValue(drafts);

    const result = await listDrafts(client);

    expect(client.get).toHaveBeenCalledWith("/drafts");
    expect(result).toEqual(drafts);
  });
});

describe("getDraft", () => {
  it("GETs /drafts/:id with the id URL-encoded", async () => {
    const client = makeClient();
    const draft = {
      id: "d 1",
      name: null,
      source: "user",
      created_at: "2026-04-20T00:00:00Z",
      config: { output: "image" },
    };
    vi.mocked(client.get).mockResolvedValue(draft);

    const result = await getDraft(client, "d 1");

    expect(client.get).toHaveBeenCalledWith("/drafts/d%201");
    expect(result).toEqual(draft);
  });
});

describe("deleteDraft", () => {
  it("DELETEs /drafts/:id with the id URL-encoded", async () => {
    const client = makeClient();
    vi.mocked(client.delete).mockResolvedValue(undefined);

    await deleteDraft(client, "d/1");

    expect(client.delete).toHaveBeenCalledWith("/drafts/d%2F1");
  });
});
