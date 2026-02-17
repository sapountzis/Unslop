---
owner: agent
status: active
created: 2026-02-17
---

# Plan: extension_diagnostics_suite

## Context
Links:
- Spec: docs/product-specs/extension.md
- Spec: docs/product-specs/spec.md
- Architecture: ARCHITECTURE.md
- Runbook: docs/runbooks/golden-paths.md

## Workflow
- Init Command: `make init-feature FEATURE=extension-diagnostics-suite`
- Worktree: `/tmp/unslop-worktrees/extension-diagnostics-suite`
- Branch: `feat/extension-diagnostics-suite`
- Active Plan: `docs/exec-plans/active/2026-02-17-extension-diagnostics-suite.md`
- Status: implementation
- Autonomy: Continue through `make pr-ready` then `make pr-submit` unless blocked or human input is required.

## Steps
1) Define diagnostics contract and execution boundary:
   - Add new message types for diagnostics request/response in `extension/src/lib/messages.ts`.
   - Keep extension layering intact: popup orchestrates checks, content script reports DOM/runtime state, background reports storage/auth readiness.
2) Implement content-script diagnostics responder:
   - Add a lightweight on-demand probe endpoint in `extension/src/content/runtime.ts`.
   - Return route eligibility, feed root presence, candidate post counts, identity readiness counts, marker counts (`checking/processed`), and preclassify gate state.
   - Include versioned diagnostic schema to avoid fragile popup parsing.
3) Implement background diagnostics responder:
   - Add background handler in `extension/src/background/index.ts` that reports:
     - `enabled` resolution
     - JWT presence
     - active-tab URL and supported-host eligibility
   - Keep classify/auth behavior unchanged.
4) Build popup diagnostics UX:
   - Add `Run Diagnostics` action in `extension/src/popup/App.ts`.
   - Render clear green/red/yellow line items with check IDs and actionable remediation text.
   - Include top-level overall status and timestamp.
   - Keep existing popup controls (auth/toggle/upgrade/stats/signout) intact.
5) Add onboarding-first interpretation mapping:
   - Add deterministic “if failed => do this next” guidance for each check.
   - Prioritize common first-run blockers: site access, wrong route, disabled toggle, missing JWT, selector mismatch.
6) Test coverage:
   - Unit tests for diagnostics aggregation and status mapping in popup module(s).
   - Message contract tests for new diagnostics types.
   - Runtime responder tests for content-side probe logic (mock DOM snapshots).
7) Documentation refresh:
   - Update `extension/README.md` with one-click diagnostics procedure and sample outputs.
   - Extend troubleshooting playbook with onboarding flow: “new machine cannot classify”.
8) Verification and workflow:
   - Run `make check`.
   - Run `make pr-ready`.
   - Run `make pr-submit`.

## Diagnostics Feedback Contract
- Every check returns:
  - `id` (stable machine-readable key)
  - `label` (human-readable check name)
  - `status` (`pass` | `warn` | `fail`)
  - `evidence` (short concrete value, e.g. `posts=6`, `enabled=false`)
  - `next_action` (single actionable instruction)
- Popup rendering rules:
  - Green row for `pass`, yellow for `warn`, red for `fail`.
  - Summary line: `X passed · Y warnings · Z failed`.
  - Sort failures first, then warnings, then passes.

Planned initial check set:
- `active_tab_linkedin`: active tab host is `www.linkedin.com`.
- `eligible_feed_route`: URL path is `/feed/` or `/feed/*`.
- `content_script_loaded`: preclassify attribute present (`data-unslop-preclassify`).
- `feed_root_found`: feed root selector resolves.
- `candidate_posts_found`: candidate post count > 0.
- `post_identity_ready`: at least one post surface has readable identity.
- `runtime_markers_progress`: processed/checking markers are present or explain idle state.
- `storage_enabled`: `enabled` resolves true.
- `storage_jwt_present`: JWT exists and non-empty.
- `content_ping`: popup can message content script and get a diagnostics response.

## Risks
- LinkedIn DOM experiments can produce account-specific selector mismatch; diagnostics must report clear actionable failures without assuming parser internals are stable.
- Overloading popup UI can harm minimal UX; diagnostics UI should be collapsible and concise.
- Cross-context messaging failures can be noisy; failures must be surfaced as explicit check failures rather than uncaught errors.

## Iteration Log
- Iteration 1: initialized worktree and active plan.
- Iteration 2: gathered message flow + runtime gating context for LinkedIn classify pipeline.
- Iteration 3: expanded implementation plan for onboarding diagnostics feature.
- Iteration 4: implemented diagnostics contracts/UI/docs, ran `make check`, performed review of failures, and iterated fixes.
- Iteration 5: applied formatter and re-ran `make check` to green.

## Verification
- `make check` (pass)

## PR
- PR: pending (replace with PR URL after `make pr-submit`, or record blocker context)

## Blockers (optional)
- Use docs/exec-plans/README.md blocker exception format when blocked.
