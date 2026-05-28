import { describe, it, expect, vi } from "vitest";
import { BragfastApiClient } from "../src/lib/api-client.js";
import { createDraft } from "../src/tools/drafts.js";

function makeClient() {
  const client = new BragfastApiClient("https://test.brag.fast/api/v1");
  client.post = vi.fn();
  return client;
}

describe("createDraft", () => {
  it("POSTs /drafts with full body and returns draft id", async () => {
    const client = makeClient();
    vi.mocked(client.post).mockResolvedValue({ id: "d_2" });

    const input = {
      output: "image" as const,
      name: "Shipped foo",
      templateId: "split-browser",
      formats: ["landscape" as const],
      objectContent: { title: { text: "Foo" } },
    };

    const result = await createDraft(client, input);

    expect(client.post).toHaveBeenCalledWith("/drafts", input);
    expect(result).toEqual({ id: "d_2" });
  });

  it("passes through skipped responses without throwing", async () => {
    const client = makeClient();
    vi.mocked(client.post).mockResolvedValue({ skipped: "dedup" });

    const result = await createDraft(client, {
      output: "image",
      templateId: "standard-browser",
    });

    expect(result).toEqual({ skipped: "dedup" });
  });
});
