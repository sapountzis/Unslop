# LLM Classification (v0.1)

The backend uses one external LLM call path and a deterministic scoring layer.

## Scope

- One configured model via inference provider (OpenRouter-compatible).
- Strict JSON output from model.
- No training, no student model, no heuristic classifier.
- Final API decision remains: `keep` | `dim` | `hide`.

## Model Input

Per post:

- `post_id` (string)
- `author_id` (string)
- `author_name` (string)
- `content_text` (normalized + truncated to <= 4000 chars)

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
   - `0.4 <= ladder < 0.6` => `dim`
   - `ladder < 0.4` => `hide`

## Failure Handling

If model call fails or response parsing/validation fails:

- classification falls open to decision `keep`
- response source is `error`
- request handler must not crash

## Configuration

Runtime configuration is environment-driven:

- `LLM_API_KEY`
- `LLM_BASE_URL` (default `https://openrouter.ai/api/v1`)
- `LLM_MODEL`

v0.1 uses one model configuration at a time.
