# Product Specs

Each spec file defines a product behavior and acceptance criteria.

Use this template:

```md
---
owner: <team_or_person>
status: draft | verified | deprecated
last_verified: <YYYY-MM-DD>
---

# Feature: <name>

## problem
Describe the user/system problem.

## non_goals
List explicit out-of-scope items.

## acceptance_criteria
- AC1: ...
- AC2: ...

## constraints
- Performance: ...
- Security/Privacy: ...
- Compatibility: ...

## telemetry
- Logs:
- Metrics:
- Traces:

## test_plan
- Unit:
- Integration:
- E2E:

## rollout
- Flags:
- Migration:
- Backout:
```
