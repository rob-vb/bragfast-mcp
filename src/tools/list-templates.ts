import { BragfastApiClient } from "../lib/api-client.js";
import type { TemplateRecord } from "../lib/types.js";

export async function listTemplates(
  client: BragfastApiClient
): Promise<{ templates: TemplateRecord[] }> {
  return client.get<{ templates: TemplateRecord[] }>("/templates");
}
