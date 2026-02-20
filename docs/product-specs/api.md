---
owner: unslop
status: verified
last_verified: 2026-02-16
---

# API Spec (v0.3)

## problem
The extension and supporting flows need stable backend API contracts for authentication, classification, feedback, usage, and billing.

## non_goals
- Introducing non-spec endpoints or expanding beyond current product scope.
- Breaking response contract changes without synchronized spec updates.

## acceptance_criteria
- AC1: Auth, classify, feedback, stats/usage, and billing endpoints are explicitly documented.
- AC2: Error semantics and auth requirements are defined per endpoint.
- AC3: Request and response payload contracts remain stable for extension/backend integration.

## constraints
- Performance: Batch classification and cache use must reduce repeated provider calls.
- Security/Privacy: JWT auth required where specified; webhook signatures verified.
- Compatibility: Contracts match extension runtime and billing provider expectations.

## telemetry
- Logs: Endpoint success/failure, auth failures, provider error metadata.
- Metrics: Route latency, classification source mix, quota and webhook outcomes.
- Traces: Request lifecycle across auth, classify, feedback, and billing handlers.

## test_plan
- Unit: Input validation, contract adapters, route error mapping.
- Integration: Route + service + repository behavior including webhook idempotency.
- E2E: Extension-to-API auth/classification and checkout flow validation.

## rollout
- Flags: No endpoint-level feature flags required.
- Migration: Contract-aligned schema changes handled via backend migrations.
- Backout: Revert route changes while preserving backward-compatible responses.

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
- best-effort Polar subscription reconciliation by email for both new and existing users (fail-open)
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
    "text": "whole post content including author, title, body, quoted content",
    "attachments": [
      {
        "kind": "image",
        "ordinal": 0,
        "sha256": "hex",
        "mime_type": "image/jpeg",
        "base64": "..."
      },
      {
        "kind": "pdf",
        "ordinal": 1,
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
- cache rows store minimal data: `content_fingerprint`, `decision`, timestamps
- cache writes occur only for successful LLM outcomes
- `classification_events` rows are compact error telemetry only (best-effort), not full request/response payload storage

Behavior:

1. validate request
2. canonicalize request payload and compute `content_fingerprint`
3. check fresh global cache by `content_fingerprint` with fixed 30-day TTL
4. on cache hit: return cached decision, record `user_activity` source `cache`
5. on cache miss: read one quota snapshot (`getQuotaStatus`)
6. if no remaining quota: return `429 { "error": "quota_exceeded" }`
7. call LLM + scoring
8. flush persistence best-effort after outcome:
   - cache upsert (success-only)
   - `user_activity` insert (non-error outcomes)
   - usage increment by attempted miss count
   - compact error telemetry rows when source is `error`

Failure handling:

- model/parsing/provider failures return `decision="keep"` with `source="error"`
- failure path still streams response; compact telemetry flush is best-effort

### POST /v1/classify/batch

Auth required.

Request:

```json
{
  "posts": [
    {
      "post_id": "linkedin-post-id-or-derived-hash",
      "text": "whole post content",
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
3. performs one cache lookup for all fingerprints
4. emits cache hits immediately as NDJSON lines (`source=cache`)
5. reads one quota snapshot at batch start and computes `allowed_misses = remaining + soft_burst`
6. immediately emits per-item `{ error: "quota_exceeded" }` for misses beyond allowed budget (no LLM call)
7. processes allowed misses with bounded concurrency (`BATCH_LLM_CONCURRENCY`)
8. emits each classified miss outcome immediately when that post finishes (order not guaranteed; no full-batch buffering)
9. flushes persistence once at end (best-effort): bulk cache upsert, bulk activity insert, one usage increment
10. appends compact error telemetry only for error outcomes

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
  "reset_date": "2026-03-15T10:00:00.000Z"
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
  - `subscription.past_due`
- parses SDK-normalized camelCase payload fields (and accepts snake_case aliases for compatibility)
- processing failures return non-2xx so provider retries

Typical success response:

```json
{ "received": true }
```

Common error responses:

- missing `webhook-id` => `400 { "error": "missing_webhook_id" }`
- signature verification failure => `403 { "received": false }`
- processing failure => `500 { "received": false }`
