# Golden Paths

Owner: cross-functional  
Update trigger: changes to default delivery workflow, planning workflow, or quality gates.

## Preconditions
- Task has been mapped to governing specs (or a new spec is created first).
- Relevant architecture/constitution files have been reviewed.
- A linked feature worktree has been initialized via `make init-feature FEATURE=<task-slug>`.
- The generated active execution plan template is filled before implementation.
- Golden-path steps are mandatory with no bypasses; if any required step cannot run, stop and log a blocker in the active plan.

## Steps
### Golden Path: Feature or Refactor
1. Run `make init-feature FEATURE=<task-slug>` from the primary checkout (sync base from origin, then worktree + setup + env bootstrap).
2. Fill the generated active plan (`docs/exec-plans/active/<yyyy-mm-dd>-<task-slug>.md`) before coding.
3. Map the request to governing specs in `docs/product-specs/index.md`.
4. Read constraints in `ARCHITECTURE.md`, `backend/AGENTS.md`, and/or `extension/AGENTS.md` as needed.
5. Implement minimal scoped changes.
6. Repeat `(edit -> make check -> review update in plan)` until all required gates pass.
7. Update specs/runbooks/quality docs touched by the change, including root `CHANGELOG.md` for non-doc changes (Keep a Changelog format).
8. Capture verification in the plan, finalize plan status/move per `docs/exec-plans/README.md`, then run `make pr-ready` and immediately run `make pr-submit`.

### Golden Path: Bug Fix
1. Reproduce the issue and record minimal repro steps in the active plan.
2. Locate governing specs and mismatch between expected vs actual behavior.
3. Add/fix tests that lock expected behavior.
4. Implement smallest safe fix.
5. Re-run relevant checks and update docs if behavior/ops changed.

### Golden Path: Docs-Only Change
1. Identify source-of-truth file(s) in `docs/`.
2. Update cross-links (`docs/index.md`, runbook index, spec index) to keep navigation intact.
3. Ensure ownership/freshness metadata remains accurate.
4. Run at least doc-focused validation before completion.

### Golden Path: Quality and Debt Refresh
1. Follow `docs/runbooks/quality-review.md`.
2. Update `docs/quality/QUALITY_SCORE.md` with evidence-backed values.
3. Update `docs/quality/tech-debt.md` with non-duplicative, actionable items.
4. Cross-link weakest quality areas to debt items.

## Expected Results
- Every task follows one of the canonical paths without skipping required docs/check steps.
- Active plans contain current verification evidence and linked governing specs.
- Autonomous execution reaches PR creation by default (`make pr-ready` -> `make pr-submit`) unless blockers require human input.
- Quality/debt updates remain evidence-based and non-duplicative.

## Completion Protocol
1. Confirm `docs/exec-plans/README.md` Definition of Done is satisfied.
2. If no blockers remain:
   - set plan frontmatter to `status: completed` and add `completed: <YYYY-MM-DD>`;
   - move plan from `docs/exec-plans/active/` to `docs/exec-plans/completed/`;
   - run `make pr-ready` and then `make pr-submit`.
3. If environment blockers or required human decisions remain, keep plan in `active/` and record the standard blocker exception note with owner action.

## Recovery
- If no path cleanly fits, start from Feature/Refactor path and document deviations.
- If checks fail, stop progression and resolve failures before doc completion.
- If spec ambiguity blocks progress, escalate to humans per `AGENTS.md`.
