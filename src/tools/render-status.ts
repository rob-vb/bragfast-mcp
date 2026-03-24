import { BragfastApiClient } from "../lib/api-client.js";
import type { ReleaseResult } from "../lib/types.js";

export interface RenderStatusInput {
  cook_id: string;
}

export async function getRenderStatus(
  client: BragfastApiClient,
  input: RenderStatusInput
): Promise<ReleaseResult> {
  return client.get<ReleaseResult>(`/cook/${input.cook_id}`);
}
