# LLM Classification (v0.1)

The backend uses external LLM calls (text or multimodal) and a deterministic scoring layer.

## Scope

- Two configured model routes via inference provider (OpenRouter-compatible):
  - `LLM_MODEL` for text-only payloads
  - `VLM_MODEL` when image/PDF attachment payload is present
- Strict JSON output from model.
- No training, no student model, no heuristic classifier.
- Final API decision remains: `keep` | `hide`.

## Routing policy

- If `attachments[]` is empty, route to `LLM_MODEL`.
- If `attachments[]` contains at least one supported attachment, route to `VLM_MODEL`.
- Runtime config requires both `LLM_MODEL` and `VLM_MODEL`; no fallback inference is allowed between these env vars.

## Model Input

Per post:

- `post_id` (string)
- `author_id` (string)
- `author_name` (string)
- `nodes[]` (ordered text nodes)
- `attachments[]` (image/PDF metadata; PDF uses `excerpt_text` in v0.1)

## Model Output Contract

Model must return JSON with numeric scores:

```json
{
  "u": 0.0,
  "d": 0.0,
  "c": 0.0,
  "h": 0.0,
  "rb": 0.0,
  "eb": 0.0,
  "sp": 0.0,
  "ts": 0.0,
  "sf": 0.0,
  "x": 0.0
}
```

All fields are expected in `[0, 1]`.

## Decision Derivation

Backend scoring engine:

1. Clamps model scores into `[0,1]`.
2. Computes value/slop aggregates with RMS power mean.
3. Computes ladder score: `0.5 + (value - slop) / 2`.
4. Applies thresholds:
   - `ladder >= 0.6` => `keep`
   - `ladder < 0.6` => `hide`

## Failure Handling

If model call fails or response parsing/validation fails:

- classification falls open to decision `keep`
- response source is `error`
- `classification_events` still records the attempted provider call with `attempt_status="error"`
- error attempts always persist error metadata (`provider_error_message` is synthesized when provider fields are absent)
- request handler must not crash

## Cache + Event Policy

- cache key is deterministic global `content_fingerprint` from canonical request payload content
- cache TTL is fixed at 30 days (non-sliding)
- cache writes occur only on successful LLM outcomes
- `classification_events` rows are written only for actual LLM attempts (cache misses)
- `classification_events.attempt_status` is required: `success` or `error`

## Configuration

Runtime configuration is environment-driven:

- `LLM_API_KEY`
- `LLM_BASE_URL` (default `https://openrouter.ai/api/v1`)
- `LLM_MODEL`
- `VLM_MODEL`

No fallback inference between `LLM_MODEL` and `VLM_MODEL` in runtime config.
