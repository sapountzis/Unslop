# Quality Review and Tech Debt Runbook

Owner: cross-functional  
Update trigger: changes to scoring model, debt policy, or validation gates.

This runbook defines the manual process for keeping `docs/quality/QUALITY_SCORE.md` and `docs/quality/tech-debt.md` accurate and high signal.

## Preconditions
- Latest branch diff and merged PR context are available.
- Active execution plan for the current task exists.
- Worktree workflow was initialized with `make init-feature FEATURE=<task-slug>`.
- Required check commands for scope can be executed.

## Steps
1. Gather baseline evidence.
   - Run required checks for the scope.
   - Record failures and key observations in the active execution plan.
   - Record Iteration Log entries showing `edit -> make check -> review` loops.
2. Re-score quality by domain/layer.
   - Update numeric scores in `docs/quality/QUALITY_SCORE.md`.
   - Add or refresh evidence notes for each changed score.
   - Only raise a score when evidence exists in code/tests/lints.
3. Update debt list in `docs/quality/tech-debt.md`.
   - Add only concrete, actionable items.
   - Include domain, owner, priority, and a verification method.
   - Search existing entries first and update in place instead of duplicating.
4. Cross-link low scores to debt.
   - Ensure the lowest-scored areas have at least one matching debt item.
5. Run documentation freshness steps.
   - Follow `docs/runbooks/docs-freshness.md` for affected docs.
6. Re-validate documentation and checks as needed for the scope.
7. Run `make pr-ready` and then `make pr-submit` unless a blocker requires human input.

## Expected Results
- `QUALITY_SCORE.md` reflects current reality (not optimistic targets).
- `tech-debt.md` contains no duplicate items for the same issue.
- Every high-impact weak area has a clear owner/priority debt item.
- Review evidence is captured in the active execution plan.

## Recovery
- If evidence is insufficient to re-score confidently, keep prior score and add explicit debt item.
- If duplicate debt items are found, merge/update existing entries before adding new ones.
- If checks cannot run, record blocker in active plan and do not mark review complete.

## When To Run
- Before merging any medium/large change.
- After significant bug fixes or incident follow-ups.
- At least once per week during active development.

## Inputs
- Latest branch diff and merged PRs since last review.
- Current `docs/quality/QUALITY_SCORE.md`.
- Current `docs/quality/tech-debt.md`.
- Current harness output (`make check` or scoped equivalents).
- Active execution plan for the current task.
