---
owner: agent
status: completed
created: 2026-02-17
completed: 2026-02-17
---

# Plan: extension_flow_abstractions

## Context
Links:
- Spec: docs/product-specs/extension.md
- Spec: docs/product-specs/spec.md
- Architecture: ARCHITECTURE.md
- Runbook: docs/runbooks/golden-paths.md

## Workflow
- Init Command: `make init-feature FEATURE=extension-flow-abstractions`
- Worktree: `/tmp/unslop-worktrees/extension-flow-abstractions`
- Branch: `feat/extension-flow-abstractions`
- Active Plan: `docs/exec-plans/active/2026-02-17-extension-flow-abstractions.md`
- Status: completed; diagnostics architecture refactor shipped with platform-owned services and core-engine isolation
- Autonomy: Continue through `make pr-ready` then `make pr-submit` unless blocked or human input is required.

## Steps
1) Preserve completed baseline refactor commit as foundation (`061e508`), then rebuild diagnostics architecture from that baseline without reintroducing coupling.
2) Define diagnostics contracts and ownership boundaries:
   - Add dev mode contract (default off) controlling diagnostics availability.
   - Replace LinkedIn-specific diagnostics types/check IDs with platform-agnostic core contracts.
   - Add platform-owned diagnostics interface under the platform plugin boundary for DOM/route checks.
3) Implement gated diagnostics control plane:
   - Popup exposes diagnostics UI only when dev mode is enabled.
   - Background/content diagnostics endpoints return explicit "disabled" state when dev mode is off.
   - Diagnostics execution remains read-only and isolated from classify queue/control flow.
4) Implement generic diagnostics engine:
   - Core checks: service worker reachability, storage/auth state, active tab host support, backend reachability.
   - Supported-platform check based on platform registry/contracts (not LinkedIn assumptions).
   - Platform-specific checks delegated to plugin-owned diagnostics implementations (LinkedIn/X/Reddit).
5) Rebuild diagnostics UI/report assembly for clarity:
   - Present deterministic pass/warn/fail checks with concrete evidence and next actions.
   - Remove LinkedIn-only copy from UI and report generation.
6) Add regression-focused tests and docs updates:
   - Unit tests for dev-mode gating, generic diagnostics orchestration, and platform diagnostics adapters.
   - Integration tests proving diagnostics requests do not mutate runtime classify behavior.
   - Update README/onboarding/debug docs to describe flow start points and diagnostics architecture.
7) Validate and ship through golden path:
   - Repeat `edit -> make check -> review` loops with evidence.
   - Run `make pr-ready` then `make pr-submit`.

## Risks
- Diagnostics refactor could accidentally affect production classify flow if message handlers share mutable state.
- Expanding plugin interface may create uneven platform coverage if one plugin misses diagnostics implementation.
- Dev-mode gating could lock out diagnostics unintentionally if popup/background/storage defaults drift.

## Iteration Log
- Iteration 1: initialized feature worktree, selected governing specs, and captured refactor + docs scope.
- Iteration 2: implemented content/background/popup abstractions and added regression tests; ran `bun test extension/src/background extension/src/content extension/src/popup`; review: fixed workflow-level issues before gate run.
- Iteration 3: ran `make check`; review: workflow validator required explicit edit/check/review loop wording in this plan and was remediated.
- Iteration 4: user requested diagnostics redesign from scratch (dev-mode gated, platform-agnostic core checks, platform-owned DOM checks, no main-flow interference); committed baseline changes first (`061e508`) and replanned architecture before new edits.
- Iteration 5: edit -> `make fmt` -> review; reformatted refactor changes and confirmed no formatter drift remained.
- Iteration 6: edit -> `make check` -> review; fixed architecture lint by removing `src/lib` dependency on `src/platforms` in diagnostics types.
- Iteration 7: edit -> test/typecheck -> review; validated platform-owned diagnostics services via `bun test extension/src/background extension/src/content extension/src/popup extension/src/platforms extension/src/lib` and `cd extension && ./node_modules/.bin/tsc --noEmit --noUnusedLocals --noUnusedParameters -p tsconfig.json`.
- Iteration 8: review -> `make check`; full repository quality gate passed after diagnostics/service ownership and docs updates.

## Verification
- `bun test extension/src/background extension/src/content extension/src/popup extension/src/platforms extension/src/lib` (pass)
- `cd extension && ./node_modules/.bin/tsc --noEmit --noUnusedLocals --noUnusedParameters -p tsconfig.json` (pass)
- `make fmt` (pass)
- `make check` (pass)
- `make pr-ready` then `make pr-submit` (pending at plan finalization time)

## PR
- PR: pending (replace with PR URL after `make pr-submit`, or record blocker context)

## Blockers (optional)
- Use docs/exec-plans/README.md blocker exception format when blocked.
