# PRD: Token Upload Endpoint (claude.ai sandbox path)

**Target repo:** `brag.fast` API (not the MCP repo)
**Author context:** Requested by `bragfast-mcp` to unblock claude.ai / Claude Desktop / Claude Cowork users who attach images or short videos directly in chat.
**Status:** Ready to build
**Date:** 2026-04-16

---

## Problem

The existing `POST /api/v1/upload/presigned` flow returns a direct-to-R2 PUT URL (`*.r2.cloudflarestorage.com`). That URL cannot be used from Claude's execution sandbox because:

1. Claude's sandbox enforces an egress allowlist. Each R2 bucket hostname is per-bucket and is not on the default allowlist. Asking users to whitelist R2 is hostile UX and brittle (bucket hostname can change).
2. R2 expects raw `PUT` with the body as the object. Sandbox `curl` works most reliably with `multipart/form-data POST`.
3. The presigned URL carries the account's key material implicitly. We do not want that URL flowing through LLM context and sandbox shell logs.

**Result today:** when a user attaches a file in claude.ai, the MCP server has no way to fetch it (the sandbox filesystem is not reachable from `mcp.brag.fast`), and the sandbox has no way to push it (the R2 URL is not whitelistable). The user is asked to re-upload to Dropbox/WeTransfer and paste a link back. Friction.

**Precedent:** Pixa MCP solved the same class of problem with a two-step token flow on a single hostname (`api.pixa.com`). The user whitelists one domain once; attachments flow thereafter.

## Solution

Two new endpoints on `brag.fast/api/v1` that mirror Pixa's `upload_url` method:

1. **Mint** — authenticated call returns a single-use, short-lived `upload_token` embedded in a `brag.fast` URL.
2. **Consume** — unauthenticated (token-authenticated) multipart POST that streams the file body to R2 and returns the hosted URL.

Everything else — `POST /upload`, `POST /upload/presigned`, `POST /upload/chunked/*` — stays untouched. The token flow is a new branch that sits alongside them.

---

## API Specification

### 1. `POST /api/v1/upload/token` — mint

Mint a single-use upload token.

**Authentication:** `Authorization: Bearer <api_key>` (same scheme as every other `/api/v1/*` endpoint).

**Request body (`application/json`):**

```json
{
  "filename": "hero.png",
  "content_type": "image/png",
  "size_bytes": 245000
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `filename` | string | yes | Original filename with extension. Used for display + storage key; not trusted — sanitize path components server-side. |
| `content_type` | string | yes | MIME type. Must be in the allowlist below. |
| `size_bytes` | integer | no | Declared size. If provided and exceeds `max_size_bytes`, reject at mint time — avoids issuing a doomed token. |

**Allowed `content_type` values:**
- Images: `image/png`, `image/jpeg`, `image/webp`, `image/svg+xml`
- Videos: `video/mp4`, `video/webm`, `video/quicktime`

(Must match the MCP's `MIME_TYPES` map at `src/tools/get-upload-url.ts:6-15` and `src/tools/upload-image.ts:6-15`. Keep in sync if the list grows.)

**Response `201 Created`:**

```json
{
  "upload_token": "utk_5Ld2m8wQvN3jHgKpX7sRzY",
  "upload_url": "https://brag.fast/api/v1/upload/by-token?upload_token=utk_5Ld2m8wQvN3jHgKpX7sRzY",
  "expires_in_seconds": 900,
  "expires_at": "2026-04-16T12:15:00Z",
  "max_size_bytes": 4194304,
  "content_type": "image/png",
  "filename": "hero.png"
}
```

| Field | Type | Description |
|-------|------|-------------|
| `upload_token` | string | Single-use token, prefixed `utk_`, 22-char nanoid. |
| `upload_url` | string | Fully-formed `brag.fast` URL the client POSTs to. Always begins with `https://brag.fast/api/v1/upload/by-token?upload_token=`. |
| `expires_in_seconds` | integer | Relative TTL. Always `900` (15 minutes) in v1. |
| `expires_at` | string (ISO 8601) | Absolute expiry. Provided so the MCP can surface accurate user-facing times. |
| `max_size_bytes` | integer | Hard cap on the consume POST body. `4194304` (4 MB) in v1 — see Infra Constraints below. |
| `content_type` | string | Echoes the requested type for client convenience. |
| `filename` | string | Echoes the sanitized filename. |

**Error responses:**

| Status | Body | When |
|--------|------|------|
| 400 | `{ "error": "Unsupported content type: image/gif" }` | `content_type` not in allowlist. |
| 400 | `{ "error": "File too large: 10485760 bytes exceeds 4194304 limit" }` | `size_bytes` > `max_size_bytes`. |
| 400 | `{ "error": "Missing or invalid filename" }` | Empty / path-only / no extension. |
| 401 | `{ "error": "..." }` | Bad/missing/revoked API key. Reuse existing 401 response body. |
| 429 | `{ "error": "Rate limited" }` + `Retry-After` header | Rate cap exceeded (see Rate Limiting). |

### 2. `POST /api/v1/upload/by-token?upload_token=<token>` — consume

Stream the file body to R2 and return the hosted URL.

**Authentication:** Token in query string is the only auth. **No `Authorization` header required or honored.** This is what makes the URL safe to run from a Claude sandbox shell.

**Query parameters:**

| Param | Type | Description |
|-------|------|-------------|
| `upload_token` | string | The `utk_…` value from the mint response. |

**Request:**
- `Content-Type: multipart/form-data` (with boundary).
- Single form part named `file` carrying the raw bytes.
- No other form parts required; reject unknown parts to keep the surface small.

Example (what the Claude sandbox will execute):

```bash
curl -X POST \
  -F 'file=@/mnt/user-data/uploads/hero.png' \
  'https://brag.fast/api/v1/upload/by-token?upload_token=utk_5Ld2m8wQvN3jHgKpX7sRzY'
```

**Response `200 OK`:**

```json
{
  "upload_id": "upl_a1b2c3d4e5f6",
  "url": "https://cdn.brag.fast/uploads/a1b2c3d4e5f6.png",
  "size_bytes": 245000,
  "content_type": "image/png",
  "filename": "hero.png"
}
```

| Field | Type | Description |
|-------|------|-------------|
| `upload_id` | string | Stable identifier for the stored asset, prefixed `upl_`. Same shape as the existing `/upload/:upload_id` return values. |
| `url` | string | Public CDN URL. Drop-in replacement for `image_url` / `video_url` in slide objects. |
| `size_bytes` | integer | Actual uploaded size after streaming. |
| `content_type` | string | Echoed from mint. |
| `filename` | string | Echoed from mint. |

**Error responses:**

| Status | Body | When |
|--------|------|------|
| 400 | `{ "error": "Missing upload_token" }` | No query param. |
| 400 | `{ "error": "Content-Type mismatch: expected image/png, got image/gif" }` | The sniffed multipart part content type differs from the type bound at mint. Sniff, don't trust the part header. |
| 400 | `{ "error": "Missing 'file' part" }` | Form data lacked the `file` part. |
| 400 | `{ "error": "Too many parts" }` | Form data had additional unexpected parts. |
| 403 | `{ "error": "Token not found" }` | `upload_token` unknown (expired-and-GC'd, never existed, or typo). Single status for all three to avoid oracle. |
| 403 | `{ "error": "Token already consumed" }` | Token was successfully used for a prior upload. Do not allow retry. |
| 410 | `{ "error": "Token expired" }` | Past `expires_at`. |
| 413 | `{ "error": "File too large" }` | Body exceeded `max_size_bytes` mid-stream. |
| 500 | `{ "error": "Upload storage failed" }` | R2 write failed. Leave token unconsumed so the client can retry within TTL; emit a server log with correlation id. |

**Note:** Return JSON bodies for every error. Keep shape consistent with other endpoints (`handleResponse` in `bragfast-mcp/src/lib/api-client.ts:6-29` reads `body.error`).

### 3. `GET /api/v1/upload/:upload_id` (existing) — status lookup

No change. The token-consume response already carries the hosted `url`, so the MCP does not need to follow up. Keep this endpoint available as a recovery path if the sandbox loses the POST response.

---

## Token Format and Storage

### Format

```
utk_<nanoid(21)>
```

- Prefix `utk_` distinguishes from `upl_` (upload asset id) and any other future token kinds.
- Body is a 21-char URL-safe nanoid. ~126 bits of entropy — safe against brute force given the rate limits below.
- Opaque to the client; the MCP and the sandbox treat it as a string.

### Storage

One row per token. Recommend Postgres using the existing accounts schema; Redis is fine if you already have it hot.

```sql
CREATE TABLE upload_tokens (
  token         TEXT PRIMARY KEY,                    -- "utk_" + nanoid(21)
  account_id    TEXT NOT NULL REFERENCES accounts(id),
  filename      TEXT NOT NULL,
  content_type  TEXT NOT NULL,
  size_bytes    INTEGER,                             -- nullable: declared at mint, may be unset
  max_size_bytes INTEGER NOT NULL,
  status        TEXT NOT NULL DEFAULT 'pending',     -- pending | consumed | expired
  upload_id     TEXT REFERENCES uploads(id),         -- set when status=consumed
  expires_at    TIMESTAMP NOT NULL,
  created_at    TIMESTAMP NOT NULL DEFAULT NOW(),
  consumed_at   TIMESTAMP
);

CREATE INDEX idx_upload_tokens_account ON upload_tokens(account_id);
CREATE INDEX idx_upload_tokens_expires ON upload_tokens(expires_at) WHERE status = 'pending';
```

**Consume-time transaction** (critical for single-use guarantee):

```sql
UPDATE upload_tokens
SET status = 'consumed', consumed_at = NOW(), upload_id = $1
WHERE token = $2 AND status = 'pending' AND expires_at > NOW()
RETURNING *;
```

If zero rows returned, read the token (if any) and branch on:
- `expires_at <= NOW()` → 410
- `status = 'consumed'` → 403 "Token already consumed"
- Not found → 403 "Token not found"

The `UPDATE … WHERE status = 'pending'` construction is the lock: two concurrent consumers cannot both succeed because only one row-update wins. Do this **before** streaming bytes to R2 so a race loser does not start writing.

Actually — streaming to R2 before the DB update is safer for the happy path (you already have the bytes and the R2 key, so the DB update is the last act). A safe sequence:

1. Read + verify token (SELECT, check `status='pending'`, check `expires_at`).
2. Stream `file` part to a temporary R2 key with a size counter; abort past `max_size_bytes`.
3. Atomic UPDATE as shown above. If zero rows (lost the race), delete the temp R2 key and return 403.
4. If won the race, move/rename the R2 key to the canonical path or insert the `uploads` row pointing at the temp key.

That means a race loser does pay the upload cost but can never return success. Acceptable.

---

## Security Requirements

| Requirement | Implementation |
|-------------|----------------|
| **TTL** | 15 minutes (`900s`). Enforced at consume via `expires_at > NOW()`. |
| **Single use** | Enforced via atomic `UPDATE … WHERE status = 'pending'`. Retries return 403, not 200. |
| **Content-type binding** | Sniff incoming multipart part (magic bytes), reject if it disagrees with the mint `content_type`. Do not trust `Content-Type` headers from the client. |
| **Size cap** | `max_size_bytes = 4_194_304`. Stream with a running counter; abort + delete temp object past cap. Also check `Content-Length` header as a fast-fail when present. |
| **Filename sanitization** | Strip path components (`../`, `/`, `\\`, NUL). Length cap (255 chars). Reject filenames with no extension. Do not echo user-supplied filename into HTML without escaping. |
| **Per-token account scoping** | Token's `account_id` is the owner. If the consume call's IP geolocation or other signal is flagged, surface to audit log but do not block — the token alone is auth. |
| **Rate limiting** | See section below. |
| **Signature / HMAC** | **Not needed** in v1 because the token is opaque, high-entropy, and stored server-side. The existing `/upload/presigned` HMAC pattern protects R2 URLs that leave the backend. Here, the URL stays inside our infra. |
| **Audit log** | Log every mint and every consume with `token`, `account_id`, `ip`, `user_agent`, `bytes`, `status`. This is load-bearing for diagnosing abuse and unblocking support tickets. |
| **Cleanup** | Cron job every 10 minutes marks `pending` rows past `expires_at` as `expired`. Separate sweep deletes `expired` rows older than 7 days to keep the table small. |

---

## Rate Limiting

Apply the existing per-account rate limiter, with new buckets:

| Endpoint | Limit | Rationale |
|----------|-------|-----------|
| `POST /upload/token` | 30 / minute | One user could reasonably mint 3-5 tokens in a single release flow (hero + 3 slide images + video). 30/min is generous headroom for scripted usage without enabling abuse. |
| `POST /upload/by-token` | 60 / minute per account (derived from token's `account_id`), 10 / minute per IP | The token is the first line of defense; per-IP limit is secondary to blunt drive-by scanners hitting random tokens. |

Return `429` + `Retry-After` on breach, same shape as every other endpoint.

---

## Infra Constraints and the 4 MB Cap

The existing `brag.fast` API runs on Vercel serverless functions. Vercel imposes a **4.5 MB request body cap** on function invocations (the same cap referenced in `bragfast-mcp/src/tools/chunked-upload.ts:4` and `bragfast-mcp/src/tools/get-upload-url.ts:95-97`). We declare `max_size_bytes: 4_194_304` (4 MiB, safely below the 4.5 MB ceiling) in the mint response so the MCP can direct larger-file callers to `source_url` as a fallback.

**Recommended follow-up (post-v1):** deploy `POST /upload/by-token` as a Cloudflare Worker that streams directly to R2 (`R2Bucket.put` accepts a `ReadableStream` and has no practical body cap). The mint endpoint can stay on Vercel. This removes the cap without changing the MCP contract — `max_size_bytes` in the mint response just grows. Track as a separate task.

**Alternative if Cloudflare Worker isn't desirable:** move the whole `brag.fast` API behind Cloudflare / a dedicated Node server and drop the Vercel constraint globally. Out of scope for this PRD.

Until the cap lifts, the MCP's tool descriptions will tell Claude: "For files over 4 MB, use `source_url` instead."

---

## Observability

Emit one structured log event per request:

```
event=upload.token.mint account_id=acc_… token=utk_… content_type=image/png size_declared=245000 ip=… ua=…
event=upload.token.consume.begin token=utk_… account_id=acc_… ip=… ua=… content_length=245000
event=upload.token.consume.ok token=utk_… upload_id=upl_… size_actual=245100 duration_ms=87
event=upload.token.consume.fail token=utk_… reason=expired|consumed|too_large|size_mismatch|storage duration_ms=12
```

Graph: tokens minted per minute, consume success rate, consume latency p50/p95, expired-unused-rate (pending tokens that TTL out without a consume — high value = users hitting allowlist wall).

Alert: consume failure rate > 10% over 5 minutes, p95 > 5s.

---

## Rollout

1. **Migration:** create `upload_tokens` table.
2. **Ship endpoints behind a feature flag** or on a canary deploy. MCP does not call them until the `bragfast-mcp` PR lands (Unit 2 of the MCP plan).
3. **Smoke tests:** see `bragfast-mcp/docs/plans/2026-04-16-001-feat-token-upload-for-sandbox-attachments-plan.md` — Unit 5 lists the nine end-to-end scenarios. Backend must pass all nine against a staging MCP before the MCP PR merges.
4. **Monitor:** first 48 hours watch for abnormal 4xx rates on consume (likely allowlist-failure signal from users who haven't whitelisted `brag.fast` yet).
5. **Documentation:** update the public API reference (if any) with the two new endpoints. Not user-facing — this is an internal contract consumed by the MCP.

---

## Out of Scope

- **Asset IDs as MCP surface.** Bragfast stays URL-based end-to-end; `upload_id` is internal.
- **Chunked-by-token.** If 4 MB proves too restrictive before the Worker migration, revisit. Not in v1.
- **Resumable uploads.** v1 is all-or-nothing. Matches the existing `/upload` behavior.
- **Webhook on upload complete.** Client is synchronous (reads the 200 response). Webhooks can be added later if a headless integration needs them.
- **User-selectable TTL.** Fixed 15 min. Simpler contract, matches Pixa.

---

## Open Questions

1. **Storage destination** — same R2 bucket and prefix as `/upload`? Recommend yes; one bucket, one lifecycle rule.
2. **Credit accounting** — should a token-upload debit credits? The existing `/upload` does not (credits are for renders via `/cook`). Match that — no debit on upload.
3. **Per-account concurrency** — any reason to cap how many `pending` tokens an account can hold? Default: unlimited, rely on TTL + rate limits. Add a `COUNT(*) WHERE status='pending'` cap later only if seen abuse.
4. **MIME allowlist drift** — the list is duplicated between the MCP and the backend. Consider exposing it via a `/upload/capabilities` endpoint so the MCP reads it at startup. Defer; keep duplicated for v1.

---

## Summary for the implementer

- Two endpoints. Mint with Bearer, consume with token-in-query. No HMAC, no signing, token is opaque.
- One table (`upload_tokens`). One atomic UPDATE for single-use guarantee.
- Stream the body, count bytes, abort past 4 MB.
- Echo the filename + content_type in responses so the MCP can surface accurate state.
- Ship behind a flag, pass nine E2E scenarios, then coordinate with the MCP PR to go GA.

Reference implementation for the flow: Pixa MCP's `upload` tool. Same shape, different hostname.
