# PRD: Presigned Upload Endpoint

## Problem

MCP tools communicate through the LLM's context window. When users upload images via `image_base64`, the entire base64-encoded file passes through the context window — consuming tokens, risking truncation on large files, and degrading LLM performance.

Claude.ai and Claude Desktop run tool calls in a sandboxed environment that can execute `curl`. We need a side-channel upload path so files go directly from the client to the server, with only a lightweight reference (upload ID / hosted URL) passing through the context window.

## Solution

A three-endpoint presigned upload flow:

1. **Request** a presigned upload URL (MCP tool → API)
2. **Upload** the file directly (client `curl` → API)
3. **Confirm** the upload and get the hosted URL (MCP tool → API)

---

## API Specification

### 1. `POST /api/v1/upload/presigned`

Request a presigned upload URL.

**Authentication:** Bearer token (same as existing endpoints)

**Request body:**

```json
{
  "filename": "screenshot.png",
  "content_type": "image/png",
  "size_bytes": 245000
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `filename` | string | yes | Original filename with extension |
| `content_type` | string | yes | MIME type. Must be one of: `image/png`, `image/jpeg`, `image/webp`, `image/svg+xml` |
| `size_bytes` | number | no | File size in bytes. If provided, reject if over `max_size_bytes`. Allows early validation before upload. |

**Response `201 Created`:**

```json
{
  "upload_id": "upl_a1b2c3d4e5f6",
  "upload_url": "https://brag.fast/api/v1/upload/upl_a1b2c3d4e5f6?expires=1712600000&sig=abc123...",
  "expires_in": 300,
  "max_size_bytes": 5242880
}
```

| Field | Type | Description |
|-------|------|-------------|
| `upload_id` | string | Unique upload identifier, prefixed `upl_` |
| `upload_url` | string | Presigned PUT URL with HMAC signature and expiry |
| `expires_in` | number | Seconds until the presigned URL expires (300 = 5 minutes) |
| `max_size_bytes` | number | Maximum allowed file size (5MB) |

**Error responses:**

| Status | Body | When |
|--------|------|------|
| 400 | `{ "error": "Unsupported content type: image/gif" }` | Invalid MIME type |
| 400 | `{ "error": "File too large: 6000000 bytes exceeds 5242880 limit" }` | `size_bytes` exceeds limit |
| 401 | `{ "error": "..." }` | Invalid/missing auth |
| 429 | `{ "error": "Rate limited" }` | Too many requests |

---

### 2. `PUT /api/v1/upload/:upload_id`

Upload the file using the presigned URL.

**Authentication:** HMAC signature in query params (no Bearer token needed — the URL is self-authenticating).

**Query parameters:**

| Param | Type | Description |
|-------|------|-------------|
| `expires` | number | Unix timestamp when the URL expires |
| `sig` | string | HMAC-SHA256 signature |

**Request:**
- `Content-Type` header must match the `content_type` from step 1
- Body is the raw file bytes

**Response `200 OK`:**

```json
{
  "upload_id": "upl_a1b2c3d4e5f6",
  "url": "https://cdn.brag.fast/uploads/a1b2c3d4e5f6.png",
  "size_bytes": 245000
}
```

| Field | Type | Description |
|-------|------|-------------|
| `upload_id` | string | Same upload ID |
| `url` | string | Public CDN URL of the uploaded file. Ready to use as `image_url` in slides. |
| `size_bytes` | number | Actual uploaded file size |

**Error responses:**

| Status | Body | When |
|--------|------|------|
| 400 | `{ "error": "Content-Type mismatch" }` | Header doesn't match declared type |
| 400 | `{ "error": "File too large" }` | Body exceeds `max_size_bytes` |
| 403 | `{ "error": "Signature invalid" }` | HMAC verification failed |
| 404 | `{ "error": "Upload not found" }` | Invalid or already-consumed upload_id |
| 410 | `{ "error": "Upload URL expired" }` | Past expiry timestamp |

---

### 3. `GET /api/v1/upload/:upload_id` (optional)

Check upload status. Useful if the PUT response is lost or for async processing.

**Authentication:** Bearer token

**Response `200 OK`:**

```json
{
  "upload_id": "upl_a1b2c3d4e5f6",
  "status": "completed",
  "url": "https://cdn.brag.fast/uploads/a1b2c3d4e5f6.png",
  "filename": "screenshot.png",
  "content_type": "image/png",
  "size_bytes": 245000,
  "created_at": "2026-04-08T12:00:00Z",
  "completed_at": "2026-04-08T12:00:05Z"
}
```

Status values: `pending` (URL issued, not yet uploaded), `completed` (file received), `expired` (TTL passed without upload).

---

## Presigned URL Signing

### Signature generation

```
message = "PUT\n/api/v1/upload/{upload_id}\n{expires}\n{content_type}"
sig = HMAC-SHA256(secret_key, message) → hex
```

### Signature verification

On PUT request:
1. Parse `expires` and `sig` from query params
2. Check `expires > now` — reject with 410 if expired
3. Reconstruct the message from the request path, expires, and Content-Type header
4. Compute HMAC-SHA256 and compare with `sig` using constant-time comparison
5. Check upload_id exists and has status `pending`

### Secret key

Use a dedicated signing key (not the user's API key). Can be a per-account key or a global server key — per-account is more secure (compromise of one key doesn't affect others).

---

## Security Requirements

| Requirement | Implementation |
|-------------|----------------|
| URL expiry | 5-minute TTL via `expires` timestamp |
| Single use | Mark upload as `completed` after successful PUT; reject subsequent PUTs |
| Size limit | 5MB max. Check `Content-Length` header before reading body. Stream body with size counter, abort if exceeded. |
| Content type validation | Must match the declared type from step 1 |
| HMAC signing | SHA-256 with constant-time comparison |
| Rate limiting | Max 10 presigned URL requests per minute per account |
| Cleanup | Cron job to delete `pending` uploads older than 10 minutes |

---

## MCP Integration

The MCP server will expose a `bragfast_get_upload_url` tool that:

1. Calls `POST /api/v1/upload/presigned` with the filename and content type
2. Returns the presigned URL + a ready-to-use curl command

```json
{
  "upload_id": "upl_a1b2c3d4e5f6",
  "upload_url": "https://brag.fast/api/v1/upload/upl_a1b2c3d4e5f6?expires=...&sig=...",
  "expires_in": 300,
  "max_size_bytes": 5242880,
  "curl_command": "curl -X PUT -H 'Content-Type: image/png' -T screenshot.png 'https://brag.fast/api/v1/upload/upl_a1b2c3d4e5f6?expires=...&sig=...'"
}
```

Claude then executes the curl command in its sandbox (Claude.ai/Desktop) or locally (Claude Code).

### Client compatibility

| Client | How it uploads |
|--------|---------------|
| Claude Code (stdio) | Runs curl locally — has filesystem access |
| Claude.ai | Runs curl in code execution sandbox — user must whitelist `brag.fast` in Settings → Capabilities → Additional allowed domains |
| Claude Desktop | Same as Claude.ai |

### Fallback

The existing `bragfast_upload_image` tool (with `file_path` and `image_base64`) remains available as a fallback for:
- Small files (logos, icons) where base64 is fine
- Environments where curl is unavailable

---

## Data model

```sql
CREATE TABLE uploads (
  id          TEXT PRIMARY KEY,          -- "upl_" + nanoid
  account_id  TEXT NOT NULL REFERENCES accounts(id),
  filename    TEXT NOT NULL,
  content_type TEXT NOT NULL,
  size_bytes  INTEGER,
  status      TEXT NOT NULL DEFAULT 'pending',  -- pending, completed, expired
  url         TEXT,                       -- CDN URL after upload
  expires_at  TIMESTAMP NOT NULL,
  created_at  TIMESTAMP NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMP
);

CREATE INDEX idx_uploads_account ON uploads(account_id);
CREATE INDEX idx_uploads_expires ON uploads(expires_at) WHERE status = 'pending';
```

---

## Open questions

1. **Storage destination**: Upload to same CDN/bucket as existing `/upload` endpoint? Or separate bucket?
2. **Debit credits**: Does uploading an image cost credits, or only rendering?
3. **File retention**: How long are uploaded files kept before cleanup?
