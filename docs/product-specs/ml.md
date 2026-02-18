---
owner: unslop
status: verified
last_verified: 2026-02-16
---

# LLM Classification (v0.1)

## problem
Classification requires deterministic routing and decision derivation on top of external LLM/VLM responses, while remaining fail-open and policy-constrained.

## non_goals
- Model training, fine-tuning, student models, or heuristic-only classifiers.
- Runtime fallback swapping between `LLM_MODEL` and `VLM_MODEL` when config is incomplete.

## acceptance_criteria
- AC1: Model routing policy (text vs attachment-aware) is explicit and deterministic.
- AC2: Output contract, score derivation, and final `keep|hide` thresholds are documented.
- AC3: Failure handling, cache/event policy, and required runtime config are explicit.

## constraints
- Performance: Cache and routing must minimize redundant provider calls.
- Security/Privacy: Provider calls should avoid unnecessary data and sensitive logging.
- Compatibility: Contracts must align with backend classification services and API responses.

## telemetry
- Logs: Model selection, decision source, provider error metadata.
- Metrics: Provider latency/error rate, cache miss/hit, decision distribution.
- Traces: Classification pipeline spans including provider call boundaries.

## test_plan
- Unit: Score clamping, ladder math, threshold decisions, and routing logic.
- Integration: Provider response parsing/validation and event persistence behavior.
- E2E: API classification behavior for cache hit/miss and provider failure scenarios.

## rollout
- Flags: Model selection is config-driven (`LLM_MODEL`, `VLM_MODEL`), no feature flags.
- Migration: Contract changes require synchronized API/spec updates.
- Backout: Revert model config/code to last known-good deterministic behavior.

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
- `text` (string, whole post content)
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
- compact error telemetry is appended best-effort (`classification_events`)
- error telemetry includes provider metadata when available (`provider_error_message` synthesized when missing)
- request handler must not crash

## Cache + Event Policy

- cache key is deterministic global `content_fingerprint` from canonical request payload content
- cache TTL is fixed at 30 days (non-sliding)
- cache stores only `content_fingerprint`, `decision`, timestamps
- cache writes occur only on successful LLM outcomes
- `classification_events` persistence is error-only and best-effort

## Configuration

Runtime configuration is environment-driven:

- `LLM_API_KEY`
- `LLM_BASE_URL` (default `https://openrouter.ai/api/v1`)
- `LLM_MODEL`
- `VLM_MODEL`

No fallback inference between `LLM_MODEL` and `VLM_MODEL` in runtime config.
