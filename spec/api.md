# API Spec (v0.1)

Base URL: `https://api.getunslop.com/v1`

Auth:

- JWT via `Authorization: Bearer <token>` on authenticated endpoints.
- JWT is issued by magic-link callback.

All responses are JSON unless noted.

## Auth

### POST /v1/auth/start

Start magic-link login.

Request:

```json
{ "email": "user@example.com" }
```

Behavior:

- normalizes email (`lowercase + trim`)
- get-or-create user row (race-safe)
- sends magic link email
- returns `202 { "status": "accepted" }`

Validation errors return `400`.
Unexpected server failures return `500 { "error": "internal_error" }`.

### GET /v1/auth/callback?token=...

Verifies magic-link token and returns HTML.

Behavior:

- on success:
  - creates session JWT
  - renders HTML containing `<meta name="unslop-jwt" content="<jwt>">`
  - sets no-cache headers
- on invalid/missing token:
  - returns error HTML with `400`

### GET /v1/me

Auth required.

Response:

```json
{
  "user_id": "uuid",
  "email": "user@example.com",
  "plan": "free",
  "plan_status": "inactive"
}
```

## Classification

### POST /v1/classify

Auth required.

Request:

```json
{
  "post": {
    "post_id": "linkedin-post-id-or-derived-hash",
    "author_id": "author-id-or-url",
    "author_name": "Some Person",
    "nodes": [
      { "id": "root", "parent_id": null, "kind": "root", "text": "root post text" },
      { "id": "repost-0", "parent_id": "root", "kind": "repost", "text": "nested repost text" }
    ],
    "attachments": [
      {
        "node_id": "root",
        "kind": "image",
        "sha256": "hex",
        "mime_type": "image/jpeg",
        "base64": "..."
      },
      {
        "node_id": "root",
        "kind": "pdf",
        "source_url": "https://media.licdn.com/...",
        "excerpt_text": "optional extracted text"
      }
    ]
  }
}
```

Success response:

```json
{
  "post_id": "linkedin-post-id-or-derived-hash",
  "decision": "keep",
  "source": "llm"
}
```

Where:

- `decision ∈ {'keep','hide'}`
- `source ∈ {'llm','cache','error'}`

Classification cache + event policy (applies to `/v1/classify` and `/v1/classify/batch`):

- cache key is deterministic `content_fingerprint` from canonical request payload content
- cache is global (no `user_id` in cache key)
- cache TTL is fixed at 30 days (non-sliding; cache hits do not extend expiry)
- cache rows are written only for successful LLM outcomes
- `classification_events` rows are written only for actual LLM attempts (cache misses), including LLM error attempts
- every `classification_events` row must include `attempt_status ∈ {'success','error'}`
- error event rows must include provider error metadata when available (`provider_http_status`, `provider_error_code`, `provider_error_message`)

Behavior:

1. validate request
2. canonicalize request payload and compute `content_fingerprint`
3. check fresh global cache by `content_fingerprint` with fixed 30-day TTL
4. on cache hit: return cached decision, record `user_activity` source `cache`
5. on cache miss: atomically consume quota (`tryConsumeQuota`)
6. if quota unavailable: return `429 { "error": "quota_exceeded" }`
7. call LLM + scoring (actual attempt => write `classification_events` row)
8. on success, write/update cache row for `content_fingerprint`
9. for non-error sources, insert `user_activity` row

Failure handling:

- model/parsing/provider failures return `decision="keep"` with `source="error"`
- failure path still writes a `classification_events` row with `attempt_status="error"` and provider metadata

### POST /v1/classify/batch

Auth required.

Request:

```json
{
  "posts": [
    {
      "post_id": "linkedin-post-id-or-derived-hash",
      "author_id": "author-id-or-url",
      "author_name": "Some Person",
      "nodes": [
        { "id": "root", "parent_id": null, "kind": "root", "text": "root post text" }
      ],
      "attachments": []
    }
  ]
}
```

Constraints:

- `1 <= posts.length <= 20`

Response:

- NDJSON (`application/x-ndjson`)
- one JSON object per line, order not guaranteed

Success line:

```json
{ "post_id": "id", "decision": "keep", "source": "llm" }
```

Quota line:

```json
{ "post_id": "id", "error": "quota_exceeded" }
```

Behavior:

1. validates payload
2. canonicalizes each payload item and computes `content_fingerprint` per item
3. performs per-item cache lookup by `content_fingerprint`
4. returns cache hits as `source=cache`
5. processes cache misses with bounded concurrency (`BATCH_LLM_CONCURRENCY`)
6. consumes quota atomically per miss; quota failures become per-item errors
7. writes cache rows only for successful LLM outcomes
8. writes `classification_events` rows only for actual LLM attempts (both success and error)
9. inserts `user_activity` for non-error outcomes

## Feedback

### POST /v1/feedback

Auth required.

Request:

```json
{
  "post_id": "linkedin-post-id-or-hash",
  "rendered_decision": "hide",
  "user_label": "should_keep"
}
```

Constraints:

- `rendered_decision ∈ {'keep','hide'}`
- `user_label ∈ {'should_keep','should_hide'}`

Behavior:

- inserts into `post_feedback` by authenticated `user_id` and provided `post_id`
- endpoint is fail-open for persistence failures and still returns `{ "status": "ok" }`

Response:

```json
{ "status": "ok" }
```

## Stats & Usage

### GET /v1/stats

Auth required.

Response:

```json
{
  "all_time": { "keep": 0, "hide": 0, "total": 0 },
  "last_30_days": { "keep": 0, "hide": 0, "total": 0 },
  "today": { "keep": 0, "hide": 0, "total": 0 },
  "daily_breakdown": [
    { "date": "2026-02-05", "decision": "keep", "count": 2 }
  ]
}
```

### GET /v1/usage

Auth required.

Response:

```json
{
  "current_usage": 42,
  "limit": 300,
  "remaining": 258,
  "plan": "free",
  "plan_status": "inactive",
  "reset_date": "2026-03-01T00:00:00.000Z"
}
```

If user context cannot be resolved: `404 { "error": "User not found" }`.

## Billing

### POST /v1/billing/create-checkout

Auth required.

Request:

```json
{ "plan": "pro-monthly" }
```

Behavior:

- active Pro user: `409 { "error": "already_pro" }`
- otherwise returns checkout URL

Response:

```json
{ "checkout_url": "https://polar.sh/checkout/..." }
```

### POST /v1/billing/polar/webhook

Signature verification with `POLAR_WEBHOOK_SECRET`.

Behavior:

- requires `webhook-id` header
- validates payload signature via Polar SDK
- idempotency key is `webhook-id` (duplicates are acknowledged and skipped)
- processes subscription events:
  - `subscription.created` (active only)
  - `subscription.active`
  - `subscription.updated`
  - `subscription.uncanceled`
  - `subscription.canceled`
  - `subscription.revoked`
- processing failures return non-2xx so provider retries

Typical success response:

```json
{ "received": true }
```

Common error responses:

- missing `webhook-id` => `400 { "error": "missing_webhook_id" }`
- signature verification failure => `403 { "received": false }`
- processing failure => `500 { "received": false }`
