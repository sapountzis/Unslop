---
owner: agent
status: active
created: 2026-02-17
---

# Plan: adaptive_detector_simplification

## Context
Links:
- Spec: docs/product-specs/extension.md
- Spec: docs/product-specs/spec.md
- Spec: docs/product-specs/agent-workflow.md
- Architecture: ARCHITECTURE.md
- Runbook: docs/runbooks/golden-paths.md
- Runbook: docs/exec-plans/README.md

## Workflow
- Init Command: `make init-feature FEATURE=adaptive-detector-simplification`
- Worktree: `/tmp/unslop-worktrees/adaptive-detector-simplification`
- Branch: `feat/adaptive-detector-simplification`
- Active Plan: `docs/exec-plans/active/2026-02-17-adaptive-detector-simplification.md`
- Status: implementation in progress (contract + detector + runtime simplification)
- Autonomy: Continue through `make pr-ready` then `make pr-submit` unless blocked or human input is required.

## Steps
1) Replace selector/surface-heavy plugin contract with a thin profile contract and delete old surface modules in the same phase.
2) Add a shared deterministic detector engine using semantic anchors + ancestor ascent scoring + confidence threshold, then wire runtime to detector outputs.
3) Split runtime responsibilities into clear modules while deleting old brittle candidate selector code paths immediately.
4) Replace platform-specific diagnostics duplication with one shared diagnostics builder using detector-level signals and route eligibility.
5) Simplify preclassify behavior to a generic pending-state style path, removing LinkedIn-specific CSS gating rules.
6) Update tests and docs to the new architecture, then run full gates (`make check`, `make pr-ready`) and pause for manual extension validation checkpoint before submission.

## Risks
- Detector under-matches on one platform route after removing exact selectors; mitigation: fixture-based detection tests + fail-open behavior.
- Runtime contract changes can break diagnostics/tests broadly; mitigation: incremental compile/test loops with immediate dead-code deletion.
- Preclassify simplification can regress anti-flicker behavior; mitigation: preserve global preclassify gate and validate with existing visibility tests (updated to new generic rule).

## Iteration Log
- Iteration 1: initialized feature worktree; read required docs/specs/constitution; mapped brittle selector/surface coupling and diagnostics duplication.
- Iteration 2: plan finalized; pending first edit -> targeted tests -> make check -> review loop.
- Iteration 3: replaced selector/surface runtime path with shared detection engine + profile contract; removed platform surface files and duplicated diagnostics services; updated preclassify to generic pending marker; completed edit -> targeted test -> build review loop.
- Iteration 4: added runtime observability counters/events to content diagnostics and popup copy-json export; fixed classify cache behavior to avoid caching fail-open `source=error` results; completed edit -> targeted test -> build review loop.
- Iteration 5: Phase 0 formatting (make fmt); Phase 1 runtime split (orchestrator, observers, pipeline); Phase 2 semantic-first detection profiles; Phase 3 docs; edit -> make check -> review loop.

## Verification
- `cd extension && bun test src/content src/platforms src/popup` ✅ pass
- `cd extension && bunx tsc --noEmit --noUnusedLocals --noUnusedParameters -p tsconfig.json` ✅ pass
- `cd extension && bun run build` ✅ pass

## PR
- PR: pending (replace with PR URL after `make pr-submit`, or record blocker context)

## Blockers (optional)
- Use docs/exec-plans/README.md blocker exception format when blocked.
