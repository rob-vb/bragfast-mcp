import { BragfastApiClient } from "../lib/api-client.js";
import type { TemplateRecord, TemplateSummary } from "../lib/types.js";

export async function listTemplates(
  client: BragfastApiClient
): Promise<{ templates: TemplateSummary[] }> {
  const result = await client.get<{ templates: TemplateRecord[] }>("/templates");
  return {
    templates: result.templates.map(({ id, name, is_default, preview_url }) => ({
      id,
      name,
      is_default,
      preview_url,
    })),
  };
}

export async function getTemplate(
  client: BragfastApiClient,
  input: { template_id: string }
): Promise<TemplateRecord> {
  const result = await client.get<{ templates: TemplateRecord[] }>("/templates");
  const template = result.templates.find((t) => t.id === input.template_id);
  if (!template) {
    throw new Error(`Template "${input.template_id}" not found`);
  }
  return template;
}
