# Golden Paths

Owner: cross-functional  
Update trigger: changes to default delivery workflow, planning workflow, or quality gates.

## Preconditions
- Task has been mapped to governing specs (or a new spec is created first).
- Relevant architecture/constitution files have been reviewed.
- An active execution plan exists for implementation tasks.

## Steps
### Golden Path: Feature or Refactor
1. Map the request to governing specs in `docs/product-specs/index.md`.
2. Read constraints in `ARCHITECTURE.md`, `backend/AGENTS.md`, and/or `extension/AGENTS.md` as needed.
3. Create or update one plan in `docs/exec-plans/active/` using `docs/exec-plans/README.md`.
4. Implement minimal scoped changes.
5. Validate with required checks for the scope (`make check` is mandatory).
6. Update specs/runbooks/quality docs touched by the change.
7. Capture verification in the plan, apply blocker exception format if needed, then finalize plan status/move per `docs/exec-plans/README.md`.

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
- Quality/debt updates remain evidence-based and non-duplicative.

## Completion Protocol
1. Confirm `docs/exec-plans/README.md` Definition of Done is satisfied.
2. If no blockers remain:
   - set plan frontmatter to `status: completed` and add `completed: <YYYY-MM-DD>`;
   - move plan from `docs/exec-plans/active/` to `docs/exec-plans/completed/`.
3. If environment blockers remain, keep plan in `active/` and record the standard blocker exception note with owner action.

## Recovery
- If no path cleanly fits, start from Feature/Refactor path and document deviations.
- If checks fail, stop progression and resolve failures before doc completion.
- If spec ambiguity blocks progress, escalate to humans per `AGENTS.md`.
