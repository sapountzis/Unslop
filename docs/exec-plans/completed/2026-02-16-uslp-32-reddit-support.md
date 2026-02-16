---
owner: agent
status: completed
created: 2026-02-16
completed: 2026-02-16
---

# Plan: uslp_32_reddit_support

## Context
Links:
- Spec: docs/product-specs/extension.md
- Spec: docs/product-specs/spec.md
- Architecture: ARCHITECTURE.md
- Runbook: docs/runbooks/golden-paths.md

## Workflow
- Init Command: `make init-feature FEATURE=uslp-32-reddit-support`
- Worktree: `/tmp/unslop-worktrees/uslp-32-reddit-support`
- Branch: `feat/uslp-32-reddit-support`
- Active Plan: `docs/exec-plans/completed/2026-02-16-uslp-32-reddit-support.md`
- Status: completed
- Autonomy: Continue through `make pr-ready` then `make pr-submit` unless blocked or human input is required.

## Steps
1) Implement Reddit platform parser/plugin parity updates: support `shreddit-ad-post`, richer identity fallbacks, subreddit/body/title extraction, and image attachment capture.
2) Expand Reddit platform tests (parser/selectors/route/surface as needed) to lock expected extraction behavior and regression coverage.
3) Update extension docs/spec references to reflect current multi-platform Reddit behavior and run verification gates.

## Risks
- Reddit DOM can vary across `www.reddit.com` and `old.reddit.com`; selectors must stay fail-open and avoid false positives from non-post UI wrappers.
- Attachment extraction must stay lightweight and deterministic so classification payloads remain stable and runtime performance is not degraded.

## Iteration Log
- Iteration 1: context gathered from Linear ticket `USLP-32`, extension Reddit plugin implementation, and governing docs/specs; next loop is edit -> make check -> review.
- Iteration 2: implemented Reddit parser/plugin/selectors updates and expanded parser/selectors tests; ran `bun test src/platforms/reddit/` (pass) and updated governing docs (`docs/product-specs/*`, `extension/README.md`).
- Iteration 3: ran `make check` (initial fail on fmtcheck), applied `make fmt`, reran verification (`make check`) with elevated permissions required for UI gate bind, now passing.

## Verification
- `bun test src/platforms/reddit/` (pass; 32 tests, 0 failures).
- `make check` (fail first: extension formatting required; remediation applied via `make fmt`).
- `make ui` (pass with elevated permissions; sandbox bind restriction on `127.0.0.1:4321`).
- `make check` (pass with elevated permissions for the UI sub-gate).

## PR
- PR: pending (replace with PR URL after `make pr-submit`, or record blocker context)

## Blockers (optional)
- Use docs/exec-plans/README.md blocker exception format when blocked.
