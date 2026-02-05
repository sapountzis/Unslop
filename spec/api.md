# API Spec (v0.1)

Base URL: `https://api.getunslop.com/v1`

Auth:
- JWT in `Authorization: Bearer <token>` for authenticated endpoints.
- JWT issued after email magic-link login.

All responses are JSON unless otherwise noted.

---

## Auth

### POST /v1/auth/start

Start magic-link login.

**Request body:**

```json
{ "email": "user@example.com" }
```

**Behavior:**
- Normalize email (lowercase + trim).
- Upsert user row if needed.
- Generate short-lived token (15 min) encoding `user_id`.
- Send email with link: `${MAGIC_LINK_BASE_URL}?token=<token>`.
- Return `202 Accepted`.

---

### GET /v1/auth/callback?token=...

Magic-link verification.

**Behavior:**
- Verify token signature + expiry.
- If valid:
  - Create a JWT session token (default expiry 60 days).
  - Render a small HTML page that includes the JWT in the DOM:
    - e.g. `<meta name="unslop-jwt" content="<jwt>">`
  - The extension has a content script on `https://api.getunslop.com/*` that reads the meta tag and sends the token to background.
- If invalid:
  - Render an error HTML page.

JWT payload:

```json
{
  "sub": "user_id",
  "email": "user@example.com",
  "iat": 1234567890,
  "exp": 1234567890
}
```

No refresh tokens in v0.1.

---

### GET /v1/me

Return minimal user info.

**Auth:** required.

**Response:**

```json
{
  "user_id": "uuid",
  "email": "user@example.com",
  "plan": "free",
  "plan_status": "inactive"
}
```

---

## Classification

### POST /v1/classify

Return a decision for a single post.

**Auth:** required.

**Request body:**

```json
{
  "post": {
    "post_id": "linkedin-post-id-or-derived-hash",
    "author_id": "author-id-or-url",
    "author_name": "Some Person",
    "content_text": "normalized text from the post (<= 4000 chars)"
  }
}
```

**Response:**

```json
{
  "post_id": "linkedin-post-id-or-derived-hash",
  "decision": "keep",
  "source": "llm"
}
```

Where:
- `decision ∈ {'keep','dim','hide'}`
- `source ∈ {'llm','cache','error'}`

**Backend behavior (required):**
1. Validate request.
2. Enforce quota:
   - If user exceeds monthly limit → HTTP 429 `{ "error": "quota_exceeded" }`
3. Cache lookup:
   - If `posts.post_id` exists and `updated_at` is within `POST_CACHE_TTL_DAYS` (default 7):
     - return cached decision with `source="cache"`
4. Otherwise call LLM using prompt contract in `ml.md`.
5. Persist to `posts` (insert or update).
6. Increment `user_usage` only on LLM calls.
7. Return response.

**Failure handling (required):**
- If LLM call fails or JSON parsing fails:
  - return decision `keep` with `source="error"`
  - do not crash

### POST /v1/classify/batch

Return decisions for multiple posts in a single request, streaming results as NDJSON.

**Auth:** required.

**Request body:**

```json
{
  "posts": [
    {
      "post_id": "linkedin-post-id-or-derived-hash",
      "author_id": "author-id-or-url",
      "author_name": "Some Person",
      "content_text": "normalized text from the post (<= 4000 chars)"
    }
  ]
}
```

Constraints:
- `posts.length <= 20` (reject with HTTP 400 if exceeded).

**Response (NDJSON stream):**
One JSON object per line, in any order, until all items are emitted.

Success line:
```json
{ "post_id": "id", "decision": "keep", "source": "llm" }
```

Error line:
```json
{ "post_id": "id", "error": "quota_exceeded" }
```

Where:
- `decision ∈ {'keep','dim','hide'}`
- `source ∈ {'llm','cache','error'}`

**Backend behavior (required):**
1. Validate request and enforce max batch size.
2. Cache lookup for all posts in a single query.
3. Stream cached decisions immediately.
4. Enforce quota once at start and again once after completion:
   - If remaining quota is exhausted, stream `quota_exceeded` for remaining items.
5. Call LLM for misses with bounded concurrency.
6. Persist results to `posts` (insert or update) and `user_activity`.
7. Increment usage once with total LLM calls.

**Failure handling (required):**
- Per item only. Do not fail the entire batch if a single item fails.

---

## Feedback

### POST /v1/feedback

Submit user feedback.

**Auth:** required.

**Request body:**

```json
{
  "post_id": "linkedin-post-id-or-hash",
  "rendered_decision": "dim",
  "user_label": "should_keep"
}
```

Constraints:
- `rendered_decision ∈ {'keep','dim','hide'}`
- `user_label ∈ {'should_keep','should_hide'}`

**Behavior:**
- Insert row into `post_feedback`.

**Response:**

```json
{ "status": "ok" }
```

---

## Billing

### POST /v1/billing/create-checkout

Create a checkout session for Pro via Polar.

**Auth:** required.

**Request body:**

```json
{ "plan": "pro-monthly" }
```

**Behavior:**
- If already active Pro: HTTP 409 `{ "error": "already_pro" }`
- Otherwise create Polar checkout and return URL.

**Response:**

```json
{ "checkout_url": "https://polar.sh/checkout/..." }
```

---

### POST /v1/billing/polar/webhook

Receive Polar webhooks.

**Auth:** signature verification using `POLAR_WEBHOOK_SECRET`.

**Behavior:**
- Verify signature.
- Process subscription events idempotently:
  - Idempotency key: `webhook-id` request header.
  - If the same `webhook-id` is seen again, treat as duplicate and no-op.
- On activation/renewal:
  - set `users.plan='pro'` and `users.plan_status='active'`
- On cancel/expire:
  - set `users.plan_status` to a non-active terminal state (`canceled` or `past_due`)
- On revoke:
  - set `users.plan='free'` and `users.plan_status='inactive'`
- Handler failures are not swallowed; backend returns non-2xx so provider retries.

**Response:**

```json
{ "received": true }
```
