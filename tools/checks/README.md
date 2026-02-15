# Checker SDK (Internal)

This document is internal to `tools/checks/`.
Do not link it from `docs/index.md` or other top-level docs.

## Purpose

`tools/checks/` is the single place where repository quality-gate complexity lives.
The rest of the repo should not need checker internals.

Goals:
- Keep checkers small and concrete.
- Centralize shared process/runtime behavior once.
- Produce failure output optimized for agent action: what is wrong, how to proceed.

## Entry Points

- CLI: `tools/checks/cli.ts`
- Make targets route through CLI via `Makefile`.

Execution model:
1. `make <target>`
2. `bun run ./tools/checks/cli.ts check <target|all>`
3. Runner executes checker gates in canonical order.
4. Each checker runs only its domain logic.

## Minimal Checker Contract

Defined in `tools/checks/core/types.ts`.

Checker shape:
- `id`
- `retryCommand`
- `run(ctx)`

Context API:
- `ctx.exec(spec)`
- `ctx.tail(text, n)`
- `ctx.fail(lines)`

Design rule:
- If checker code needs orchestration internals, move that logic into `core/*` or shared checker utils.

## Message Policy (Critical)

Agent-facing failures must be high-signal and low-noise.

Required:
- State the concrete failure.
- Provide remediation and exact retry command.

Avoid:
- Internal framework noise.
- Leaking SDK concepts to callers (for example: checker/gate engine terminology in failure tails).
- Duplicate wrapper diagnostics when checker diagnostics already explain the issue.

## Where Logic Belongs

- `checkers/*`: checker-specific decision logic only.
- `checkers/shared.ts`: small declarative helpers reused across multiple checkers.
- `core/*`: runtime, registry, checker execution contract, common error handling.
- `validators/*`: policy validators used by doc/workflow/taskflow/arch checks.
- `commands/*`: `setup`, `pr-ready`, `pr-submit`, `pr-cleanup` command logic.

## Adding or Modifying a Checker

1. Implement checker logic in `tools/checks/checkers/<id>.ts` using `defineChecker`.
2. Keep flow linear and explicit; prefer one small local helper at most.
3. Register checker in `tools/checks/checkers/index.ts`.
4. Preserve canonical order in `CHECK_ORDER_ALL` when relevant.
5. Add/update parity and contract tests in `tools/checks/tests/*`.
6. Run:
   - `bun test tools/checks/tests`
   - `make check`

## Performance Guidelines

- Heavy time should come from the underlying tool (tsc, tests, playwright), not orchestration.
- Avoid adding subprocess layers unless they remove real duplication.
- Keep log handling simple and bounded (tailing, not unbounded buffering in memory).
- If a new abstraction adds measurable overhead and little reuse, remove it.

## Non-Goals

- Exposing SDK internals to product code.
- Building a generic framework with speculative extension points.
- Optimizing for abstraction depth over readability.

## Maintenance Rule

When in doubt, optimize for:
- Short checker files.
- Shared utilities with obvious behavior.
- Failure output that helps the agent fix the issue in the next command.
