---
owner: agent
status: completed
created: 2026-02-10
completed: 2026-02-10
---

# Plan: Remove `dim` Decision And Replace Stub With Label Mode

## Context
Links:
- Spec: docs/product-specs/spec.md
- Spec: docs/product-specs/api.md
- Spec: docs/product-specs/data_model.md
- Spec: docs/product-specs/extension.md
- Spec: docs/product-specs/ml.md
- Architecture: ARCHITECTURE.md

Goal:
- Remove `dim` from the backend and extension decision domain.
- Replace extension `stub` hide rendering with non-destructive `label` mode.

## Steps
1) Update shared decision domain constants and types to `keep|hide`.
2) Migrate decision storage and behavior from `dim` to `hide`.
3) Update scoring, stats, route contracts, rendering, and docs to match.
4) Re-run targeted tests and then full quality gates.

## Risks
- Schema migration risk for historical rows containing `dim`.
- Contract drift risk across backend route tests, extension rendering behavior, and docs.

## Verification
- See command and test blocks in the historical task breakdown below.

## Historical Task Breakdown

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Remove the `dim` decision category from backend, extension, and docs; replace extension hide `stub` mode with a non-destructive `label` mode that shows a decision pill instead of hiding the post.

**Architecture:** Move the decision domain from 3 states (`keep|dim|hide`) to 2 states (`keep|hide`) at the shared backend constant level and extension type level. Keep fail-open behavior (`keep`) unchanged. In extension rendering, keep production hide behavior as `collapse`; add a local/test-friendly `label` mode that keeps post content visible and prepends a compact decision pill.

**Tech Stack:** Bun, Hono, Drizzle ORM + Postgres enum migrations, TypeScript, Chrome MV3 content/background scripts, Vite.

## Preconditions And Product Decisions

1. `dim` removal policy for existing data and rules must be fixed before coding:
   - Recommended: map historical `dim` rows to `hide` during migration, and map previous `dim` scoring branches to `hide`.
   - Alternative: map `dim` to `keep` (less aggressive filtering).
2. This plan assumes recommendation is accepted (`dim -> hide`) so schema migrations and tests are deterministic.

### Task 1: Update Domain Decision Constants And Core Types

**Files:**
- Modify: `backend/src/lib/domain-constants.ts`
- Modify: `backend/src/types/classification.ts`
- Modify: `extension/src/types.ts`
- Modify: `extension/src/content/render-commit-pipeline.ts` (type interactions only if needed)

**Step 1: Write failing type-level/test expectations for 2-state decision domain**
- Update tests that currently assert `keep|dim|hide` unions to assert `keep|hide`.

**Step 2: Run tests to confirm failures**

```bash
cd backend && bun test src/routes/classify.test.ts src/routes/classify.e2e.test.ts src/routes/feedback.test.ts src/routes/stats.test.ts
cd extension && bun test src/content/decision-renderer.test.ts src/lib/hide-render-mode.test.ts
```

Expected: failures referencing `dim` literals/types.

**Step 3: Implement minimal type/domain changes**

```ts
// backend/src/lib/domain-constants.ts
export const DECISION_VALUES = ['keep', 'hide'] as const;
```

```ts
// extension/src/types.ts
export type Decision = 'keep' | 'hide';
```

**Step 4: Re-run focused tests**
- Run the same commands; expect fewer failures, now concentrated in scoring/stats/rendering/docs snapshots.

**Step 5: Commit**

```bash
git add backend/src/lib/domain-constants.ts backend/src/types/classification.ts extension/src/types.ts extension/src/content/render-commit-pipeline.ts
git commit -m "refactor: shrink decision domain to keep/hide"
```

### Task 2: Migrate Database Enum And Existing `dim` Rows

**Files:**
- Modify/Create: `backend/drizzle/*` migration files (new migration folder)
- Modify: `backend/src/db/schema.ts`
- Modify: `docs/product-specs/data_model.md`
- Modify: `backend/docs/DATABASE.md`

**Step 1: Write failing integration tests around enum values and stats counts**
- Update affected repository/service tests to stop expecting `dim`.

**Step 2: Run integration tests to verify failure**

```bash
cd backend && bun run test:integration
```

Expected: enum/value failures around `decision` and stats structures.

**Step 3: Add migration for enum transition and data rewrite**
- In SQL migration:
1. `UPDATE` decision-bearing tables (`classification_cache`, `user_activity`, `post_feedback`) mapping `dim` -> `hide`.
2. Rename existing enum type (for example `decision_old`), create new `decision` enum with `keep`,`hide`.
3. Alter each decision column to new enum using `USING` casts.
4. Drop old enum type.

**Step 4: Align Drizzle schema with new enum**
- Keep Drizzle enum source of truth tied to updated `DECISION_VALUES`.

**Step 5: Re-run integration tests**

```bash
cd backend && bun run test:integration
```

Expected: PASS for migration-aware tests.

**Step 6: Commit**

```bash
git add backend/drizzle backend/src/db/schema.ts docs/product-specs/data_model.md backend/docs/DATABASE.md
git commit -m "feat: migrate decision enum from keep-dim-hide to keep-hide"
```

### Task 3: Replace Scoring `dim` Outcomes With `hide`

**Files:**
- Modify: `backend/src/services/scoring.ts`
- Modify: `backend/src/routes/classify.test.ts`
- Modify: `backend/src/services/classification-service.test.ts`
- Modify: `backend/src/services/llm.integration.test.ts`
- Modify: `backend/src/repositories/classification-cache-repository.test.ts`
- Modify: `backend/src/repositories/classification-event-repository.test.ts`

**Step 1: Write failing unit tests for former dim branches**
- Assert ego-bait and formatting-noise branches now return `hide`.

**Step 2: Run failing tests**

```bash
cd backend && bun test src/routes/classify.test.ts src/services/classification-service.test.ts src/services/llm.integration.test.ts
```

**Step 3: Implement minimal scoring changes**
- Keep reason/rule IDs unless explicitly renamed.
- Change branches that returned `dim` to return `hide`.
- Ensure no code path emits `dim`.

**Step 4: Re-run tests**
- Same command; expect PASS.

**Step 5: Commit**

```bash
git add backend/src/services/scoring.ts backend/src/routes/classify.test.ts backend/src/services/classification-service.test.ts backend/src/services/llm.integration.test.ts backend/src/repositories/classification-cache-repository.test.ts backend/src/repositories/classification-event-repository.test.ts
git commit -m "feat: remove dim scoring outputs and emit keep/hide only"
```

### Task 4: Update Stats Contracts From 3 Buckets To 2 Buckets

**Files:**
- Modify: `backend/src/repositories/stats-repository.ts`
- Modify: `backend/src/services/stats-service.ts`
- Modify: `backend/src/routes/stats.test.ts`
- Modify: `backend/src/app/dependencies.test.ts`
- Modify: `extension/src/types.ts`
- Modify: `extension/src/stats/index.ts`
- Modify: `extension/src/styles/shared.css`

**Step 1: Write failing tests for stats payload shape**
- Replace `{ keep, dim, hide, total }` with `{ keep, hide, total }`.

**Step 2: Run tests**

```bash
cd backend && bun test src/routes/stats.test.ts src/app/dependencies.test.ts src/repositories/stats-repository.ts
cd extension && bun test src/stats/index.ts
```

**Step 3: Implement minimal stats changes**
- Update repository count record type to `Record<'keep' | 'hide', number>`.
- Remove all `dim` aggregates and chart/breakdown labels.
- Keep `daily_breakdown` schema as decision string rows (`keep`/`hide` only).

**Step 4: Re-run tests/build**

```bash
cd backend && bun test src/routes/stats.test.ts src/app/dependencies.test.ts
cd extension && bun run build
```

**Step 5: Commit**

```bash
git add backend/src/repositories/stats-repository.ts backend/src/services/stats-service.ts backend/src/routes/stats.test.ts backend/src/app/dependencies.test.ts extension/src/types.ts extension/src/stats/index.ts extension/src/styles/shared.css
git commit -m "refactor: simplify stats to keep-hide buckets"
```

### Task 5: Replace Extension Hide `stub` Mode With Decision `label` Mode

**Files:**
- Modify: `extension/src/lib/config.ts`
- Modify: `extension/src/lib/hide-render-mode.ts`
- Modify: `extension/src/lib/hide-render-mode.test.ts`
- Modify: `extension/src/popup/App.ts`
- Modify: `extension/src/content/decision-renderer.ts`
- Modify: `extension/src/content/decision-renderer.test.ts`
- Modify: `extension/src/content/marker-manager.ts`
- Modify: `extension/src/content/marker-manager.test.ts`
- Modify: `extension/src/styles/content.css`
- Modify: `extension/src/content/render-pipeline-stability.test.ts` (mode literals)

**Step 1: Write failing renderer/mode tests**
- Replace `stub` expectations with `label`.
- Add test asserting hide+label does not apply `unslop-hidden-post` and injects a pill element.

**Step 2: Run tests to verify failure**

```bash
cd extension && bun test src/content/decision-renderer.test.ts src/lib/hide-render-mode.test.ts src/content/marker-manager.test.ts src/content/render-pipeline-stability.test.ts
```

**Step 3: Implement mode and renderer changes**
- `HideRenderMode`: `collapse | label`.
- Popup selector option: replace Stub with Label.
- Decision renderer:
  - Remove dim branch entirely.
  - For `hide` + `collapse`: keep current hidden behavior.
  - For `hide` + `label`: keep post visible and prepend a compact pill, for example `Unslop: hide`.
- Remove all stub DOM/CSS classes and cleanup paths.

**Step 4: Re-run extension tests/build**

```bash
cd extension && bun test src/content/decision-renderer.test.ts src/lib/hide-render-mode.test.ts src/content/marker-manager.test.ts src/content/render-pipeline-stability.test.ts
cd extension && bun run build
```

Expected: PASS.

**Step 5: Commit**

```bash
git add extension/src/lib/config.ts extension/src/lib/hide-render-mode.ts extension/src/lib/hide-render-mode.test.ts extension/src/popup/App.ts extension/src/content/decision-renderer.ts extension/src/content/decision-renderer.test.ts extension/src/content/marker-manager.ts extension/src/content/marker-manager.test.ts extension/src/styles/content.css extension/src/content/render-pipeline-stability.test.ts
git commit -m "feat: replace hide stub mode with decision label mode"
```

### Task 6: Remove Extension `dim` UX And Dead CSS/Selectors

**Files:**
- Modify: `extension/src/content/decision-renderer.ts`
- Modify: `extension/src/styles/content.css`
- Modify: `extension/src/content/marker-manager.ts`
- Modify: `extension/src/lib/selectors.ts` (if comments/contracts mention dim/stub)
- Modify: `extension/src/content/linkedin.ts` (only where decision assumptions are typed/literal)
- Modify: `extension/src/content/*` tests containing `dim` literals

**Step 1: Write failing tests for dead references**
- Ensure no renderer tests reference `.unslop-dim-header` or `decision='dim'`.

**Step 2: Run tests**

```bash
cd extension && bun test
```

**Step 3: Remove dead dim/stub branches**
- Delete dim-header creation logic and associated CSS.
- Keep marker reset logic aligned to new class names only.

**Step 4: Re-run tests/build**

```bash
cd extension && bun test
cd extension && bun run build
```

**Step 5: Commit**

```bash
git add extension/src/content extension/src/styles/content.css extension/src/lib/selectors.ts
git commit -m "refactor: remove extension dim paths and dead rendering selectors"
```

### Task 7: Update Backend/Extension/Public Docs To Match New Behavior

**Files:**
- Modify: `docs/product-specs/spec.md`
- Modify: `docs/product-specs/api.md`
- Modify: `docs/product-specs/extension.md`
- Modify: `docs/product-specs/ml.md`
- Modify: `backend/AGENTS.md`
- Modify: `backend/README.md`
- Modify: `extension/AGENTS.md`
- Modify: `extension/docs/constitution.md`
- Modify: `extension/README.md`
- Modify: `frontend/privacy.html`
- Modify: `frontend/support.html`
- Modify: `frontend/index.html`
- Modify: `frontend/css/styles.css`

**Step 1: Update specs first (source of truth)**
- Replace all keep/dim/hide contracts with keep/hide.
- Replace dim behavior descriptions with hide or label-mode notes.

**Step 2: Update implementation docs**
- Extension README: rendering model now `keep|hide`; hide modes `collapse|label`.
- Backend docs: decision enum updated and migration note for historical dim.

**Step 3: Update public site copy**
- Replace “keep, dim, hide” messaging and visual chips with two-state language.

**Step 4: Verify no stale references**

```bash
rg -n "\bdim\b|stub" spec backend extension frontend README.md backend/docs extension/docs
```

Expected: only intentional historical references (for example audit docs) or none.

**Step 5: Commit**

```bash
git add spec backend/AGENTS.md backend/README.md backend/docs extension/AGENTS.md extension/docs/constitution.md extension/README.md frontend
git commit -m "docs: align product and api docs to keep-hide plus label mode"
```

### Task 8: Full Verification

**Files:**
- No code changes; verification only.

**Step 1: Backend verification**

```bash
cd backend && bun run type-check
cd backend && bun run test
cd backend && bun run test:integration
```

**Step 2: Extension verification**

```bash
cd extension && bun run build
```

**Step 3: Repo-wide regression scan**

```bash
rg -n "decision.*dim|keep[\"' ]*\\|[\"' ]*dim|dim[\"' ]*\\|[\"' ]*hide|hideRenderMode.*stub|unslop-hidden-stub|unslop-dim-header" backend extension spec frontend
```

Expected: no active code/spec references to removed states/modes.

**Step 4: Final commit (if any leftovers)**

```bash
git add -A
git commit -m "chore: finalize keep-hide migration and extension label mode"
```
