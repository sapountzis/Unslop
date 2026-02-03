# LLM Classification (v0.1)

This project uses an external LLM to produce a **single decision** for a LinkedIn post:

- `keep` – do nothing
- `dim` – visually de-emphasize
- `hide` – remove/collapse from the feed

## In scope

- One model call path, via an inference provider (e.g. OpenRouter).
- Strict JSON output for parsing.
- No training, no student models, no heuristics.

## Prompt contract

### Input to the model

We send a single post:

- author_id (string)
- post_id (string)
- content_text (string; normalized + truncated)

### Output from the model (must parse)

**JSON only**:

```json
{
  "decision": "keep" | "dim" | "hide"
}
```

No additional keys are required in v0.1.

## Parsing

- Backend must treat any parse failure as:
  - `decision = "keep"` and `source = "error"`
  - and it must not crash the request handler.

## Model selection

Configured via env vars (see `infra.md`), e.g.:
- API key
- base URL
- model name

v0.1 uses exactly one configured model.
