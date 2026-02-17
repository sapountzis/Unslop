# Product Specs Index

Use this file to choose the governing spec(s) for every task.

| Spec | Scope |
| --- | --- |
| `spec.md` | Product-level behavior, end-to-end flow, and global constraints. |
| `api.md` | Backend API contracts, request/response behavior, and auth semantics. |
| `billing.md` | Plans, entitlements, quota policy, and billing lifecycle. |
| `data_model.md` | Persistent schema, invariants, and storage relationships. |
| `extension.md` | Extension runtime behavior, UI controls, and platform integration. |
| `frontend.md` | Site pages, user-facing copy surfaces, and static frontend behavior. |
| `infra.md` | Deployment/runtime infrastructure and environment boundaries. |
| `ml.md` | Classification model usage policy and non-goals. |
| `agent-workflow.md` | Agent harness lifecycle from feature request through PR submission. |

## Selection Rules
- Choose at least one spec before implementation.
- If a task crosses boundaries, link all relevant specs in the execution plan.
- If no spec fits, create or update the spec first.

## Freshness Rules
- Every spec file must include frontmatter with `owner`, `status`, and `last_verified`.
- Update `last_verified` when the spec changes or when behavior is re-confirmed.
- Link the governing spec(s) from `docs/exec-plans/active/<task>.md`.
