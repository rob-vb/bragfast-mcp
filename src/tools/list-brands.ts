import { BragfastApiClient } from "../lib/api-client.js";
import type { BrandRecord } from "../lib/types.js";

export async function listBrands(client: BragfastApiClient): Promise<BrandRecord[]> {
  return client.get<BrandRecord[]>("/brands");
}
