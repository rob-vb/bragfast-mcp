import { BragfastApiClient } from "../lib/api-client.js";

// AI primitive helpers exposed by brag.fast. Use these when your agent owns
// the orchestration (Shape B) — fetching commits via your own GitHub MCP,
// deciding worthiness, picking templates, filling slots, then calling
// createDraft to materialize the draft.

export type CommitInput = { sha: string; message: string };

export type AnalyzeCommitsInput = {
  repoFullName: string;
  commits: CommitInput[];
};

export type AnalyzeCommitsResult = {
  worthPosting: boolean;
  chosenCommitSha?: string;
  draftCopy?: string;
  reasoning?: string;
};

export async function analyzeCommits(
  client: BragfastApiClient,
  input: AnalyzeCommitsInput,
): Promise<AnalyzeCommitsResult> {
  return client.post<AnalyzeCommitsResult>("/ai/analyze-commits", input);
}

export type SuggestTemplateInput = {
  copy: string;
  formats?: Array<"landscape" | "square" | "portrait">;
  // Optional: supply your own candidates. Omit to use the user's full template set.
  candidates?: Array<{
    id: string;
    name: string;
    tags?: string[];
    description?: string;
  }>;
};

export type SuggestTemplateResult = {
  templateId: string;
  format: "landscape" | "square" | "portrait";
  reasoning?: string;
};

export async function suggestTemplate(
  client: BragfastApiClient,
  input: SuggestTemplateInput,
): Promise<SuggestTemplateResult> {
  return client.post<SuggestTemplateResult>("/ai/suggest-template", input);
}

export type FillTemplateObjectsInput = {
  templateId: string;
  format: "landscape" | "square" | "portrait";
  context: {
    draftCopy: string;
    commitMessage?: string;
  };
};

export type FillTemplateObjectsResult = {
  objects: Array<{ id: string; text?: string; image_url?: string }>;
};

export async function fillTemplateObjects(
  client: BragfastApiClient,
  input: FillTemplateObjectsInput,
): Promise<FillTemplateObjectsResult> {
  return client.post<FillTemplateObjectsResult>("/ai/fill-template-objects", input);
}
