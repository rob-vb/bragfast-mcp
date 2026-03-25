import { describe, it, expect, vi } from "vitest";
import { BragfastApiClient } from "../src/lib/api-client.js";
import { listBrands } from "../src/tools/list-brands.js";
import type { BrandRecord } from "../src/lib/types.js";

function makeClient() {
  const client = new BragfastApiClient("https://test.brag.fast/api/v1");
  client.get = vi.fn();
  return client;
}

const sampleBrand: BrandRecord = {
  id: "brand_123",
  name: "Acme Corp",
  logo_url: "https://example.com/logo.png",
  website: "https://example.com",
  colors: { background: "#ffffff", text: "#000000", primary: "#ff0000" },
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

describe("listBrands", () => {
  it("calls GET /brands and returns brand array", async () => {
    const client = makeClient();
    vi.mocked(client.get).mockResolvedValue([sampleBrand]);

    const result = await listBrands(client);

    expect(client.get).toHaveBeenCalledOnce();
    expect(client.get).toHaveBeenCalledWith("/brands");
    expect(result).toEqual([sampleBrand]);
  });

  it("returns empty array when no brands", async () => {
    const client = makeClient();
    vi.mocked(client.get).mockResolvedValue([]);

    const result = await listBrands(client);

    expect(result).toEqual([]);
  });
});
