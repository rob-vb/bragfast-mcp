import { BragfastApiClient } from "../lib/api-client.js";

// Shape returned by brag.fast /api/v1/drafts*. Narrower than the full Convex
// row; only fields that matter for an agent.
export type DraftRecord = {
  id: string;
  source: "cron-commit" | "cron-release" | "mcp-manual";
  repoFullName?: string;
  platform: "twitter";
  copy: string;
  originalCopy: string;
  copyEditDistance?: number;
  suggestedTemplateId: string;
  suggestedFormat: "landscape" | "square" | "portrait";
  imageReleaseId?: string;
  videoReleaseId?: string;
  status: "pending_review" | "approved" | "dismissed" | "expired" | "error";
  errorMessage?: string;
  sourceCommitShas?: string[];
  postedAt?: number;
  created_at: string;
  approved_at?: string;
};

export type DraftStatus = DraftRecord["status"];

export async function listDrafts(
  client: BragfastApiClient,
  params: { status?: DraftStatus; limit?: number } = {},
): Promise<DraftRecord[]> {
  const qs = new URLSearchParams();
  if (params.status) qs.set("status", params.status);
  if (params.limit) qs.set("limit", String(params.limit));
  const path = `/drafts${qs.toString() ? `?${qs}` : ""}`;
  return client.get<DraftRecord[]>(path);
}

export async function getDraft(
  client: BragfastApiClient,
  id: string,
): Promise<DraftRecord> {
  return client.get<DraftRecord>(`/drafts/${encodeURIComponent(id)}`);
}

export async function approveDraft(
  client: BragfastApiClient,
  id: string,
  opts: { editedCopy?: string; uploadId?: string } = {},
): Promise<{ ok: true; cook_id: string }> {
  return client.post<{ ok: true; cook_id: string }>(
    `/drafts/${encodeURIComponent(id)}/approve`,
    opts,
  );
}

export async function dismissDraft(
  client: BragfastApiClient,
  id: string,
): Promise<{ ok: true }> {
  return client.post<{ ok: true }>(
    `/drafts/${encodeURIComponent(id)}/dismiss`,
    {},
  );
}

export async function updateDraftCopy(
  client: BragfastApiClient,
  id: string,
  copy: string,
): Promise<{ ok: true }> {
  return client.patch<{ ok: true }>(`/drafts/${encodeURIComponent(id)}`, { copy });
}

export async function promoteDraftToVideo(
  client: BragfastApiClient,
  id: string,
): Promise<{ ok: true; cook_id: string }> {
  return client.post<{ ok: true; cook_id: string }>(
    `/drafts/${encodeURIComponent(id)}/video`,
    {},
  );
}

export type DraftSkipReason = "dedup" | "no-commits" | "not-worth-posting";

export type CreateDraftFromCommitsInput = {
  repoFullName: string;
  windowStartMs?: number;
  windowEndMs?: number;
};

export type CreateDraftFromCommitsResult =
  | { id: string; status: "pending_review" }
  | { skipped: DraftSkipReason; reasoning?: string };

/**
 * Shape A — one-call convenience. brag.fast fetches commits via its GitHub App,
 * runs the Haiku pipeline, and inserts a draft. Use when you don't have your
 * own GitHub MCP. For full agent control, use createDraft + the ai_* tools.
 */
export async function createDraftFromCommits(
  client: BragfastApiClient,
  input: CreateDraftFromCommitsInput,
): Promise<CreateDraftFromCommitsResult> {
  return client.post<CreateDraftFromCommitsResult>("/drafts/from-commits", input);
}

export type CreateDraftInput = {
  copy: string;
  templateId: string;
  format: "landscape" | "square" | "portrait";
  aiContent: unknown[];
  repoFullName?: string;
  sourceCommitShas?: string[];
  windowStartMs?: number;
  windowEndMs?: number;
};

export type CreateDraftResult =
  | { id: string; status: "pending_review" }
  | { skipped: DraftSkipReason };

/**
 * Shape B — raw create. Agent supplies pre-filled copy + template + objects.
 * Pair with bragfast_ai_suggest_template + bragfast_ai_fill_template_objects
 * to build the inputs, or supply them yourself.
 */
export async function createDraft(
  client: BragfastApiClient,
  input: CreateDraftInput,
): Promise<CreateDraftResult> {
  return client.post<CreateDraftResult>("/drafts", input);
}
