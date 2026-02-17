# UI Debugging Runbook

Owner: frontend  
Update trigger: UI smoke coverage or frontend runtime behavior changes.

## Preconditions
- Dependencies installed (`make setup`).
- Frontend dev server running (default Astro port `4321`).

## Steps
1. Start frontend: `cd frontend && bun run dev`.
2. In another shell, run UI checks: `make ui`.
3. If smoke fails, run a focused test: `cd frontend && bunx playwright test ui-tests/smoke.spec.ts --headed`.
4. Fix issue, rerun `make ui`.

## Expected Results
- Smoke test passes without console/runtime errors.
- Reproduced UI bug has a deterministic test before fix.

## Recovery
- If frontend fails to start, rerun `make setup` and verify `frontend/package.json` dependencies.
- If Playwright fails to launch, run headed mode to inspect runtime/browser errors.
- If smoke remains flaky, isolate one test case and capture deterministic repro in the active plan before patching.
