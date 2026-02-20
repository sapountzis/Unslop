# Documentation Freshness Runbook

Owner: cross-functional  
Update trigger: any change to docs structure, workflow, or quality maintenance policy.

## Preconditions
- You have the current change diff and understand impacted code/doc domains.
- Relevant governing specs and active execution plan are identified.
- Worktree workflow was initialized with `make init-feature FEATURE=<task-slug>`.
- Required check commands for the scope are known (`make check` or scoped gates).

## Steps
1. Identify impacted domains from the code diff.
2. Update governing product specs in `docs/product-specs/` and refresh `last_verified`.
   - When extension or backend structure changes, update `extension/AGENTS.md` or `backend/AGENTS.md` accordingly.
   - **Extension docs**: `extension/docs/` has been removed. All extension architecture, flows, entry points, and module roles live in `extension/AGENTS.md`. Do not create extension-specific docs under `extension/`.
3. Update linked runbooks if operational behavior changed.
4. Update plan context/verification in `docs/exec-plans/active/`.
5. Capture at least one `edit -> make check -> review` loop entry in the plan's Iteration Log.
6. Update ADR docs in `docs/decisions/` for major cross-domain decisions.
7. Update `docs/quality/QUALITY_SCORE.md` and `docs/quality/tech-debt.md` when quality posture changes.
8. Validate docs consistency with doc-focused checks.

## Expected Results
- All affected docs are updated in the same change.
- Updated docs are cross-linked from `docs/index.md` or the nearest index.
- Quality/debt docs reflect current reality, not intent.

## Recovery
- If doc checks fail, fix missing paths/frontmatter/references first, then re-run checks.
- If spec ownership or scope is unclear, pause and escalate per `AGENTS.md` guidance.
- If docs conflict with implementation, update docs in the same change or rollback code/doc drift.

## Triggers
- Any behavior change in backend/extension/frontend.
- Any architecture, dependency, or operational workflow change.
- Any medium/large PR before merge.
- Weekly during active development.
