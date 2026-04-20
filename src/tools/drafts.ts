import { BragfastApiClient } from "../lib/api-client.js";

export type DraftColors = {
  background: string;
  text: string;
  primary: string;
};

export type DraftObjectContent = {
  text?: string;
  image_url?: string;
  video_url?: string;
};

export type DraftConfig = {
  output: "image" | "video";
  templateId?: string;
  brandId?: string;
  colors?: DraftColors;
  formats?: Array<"landscape" | "square" | "portrait">;
  objectContent?: Record<string, DraftObjectContent>;
  video?: { duration?: number; preset?: string };
  notes?: string;
};

export type DraftRecord = {
  id: string;
  name: string | null;
  source: "agent" | "user";
  created_at: string;
  config: DraftConfig;
};

export type CreateDraftInput = {
  output: "image" | "video";
  name?: string;
  templateId?: string;
  brandId?: string;
  colors?: DraftColors;
  formats?: Array<"landscape" | "square" | "portrait">;
  objectContent?: Record<string, DraftObjectContent>;
  video?: { duration?: number; preset?: string };
  notes?: string;
};

export async function createDraft(
  client: BragfastApiClient,
  input: CreateDraftInput,
): Promise<{ id: string }> {
  return client.post<{ id: string }>("/drafts", input);
}

export async function listDrafts(
  client: BragfastApiClient,
): Promise<DraftRecord[]> {
  return client.get<DraftRecord[]>("/drafts");
}

export async function getDraft(
  client: BragfastApiClient,
  id: string,
): Promise<DraftRecord> {
  return client.get<DraftRecord>(`/drafts/${encodeURIComponent(id)}`);
}

export async function deleteDraft(
  client: BragfastApiClient,
  id: string,
): Promise<void> {
  await client.delete(`/drafts/${encodeURIComponent(id)}`);
}
