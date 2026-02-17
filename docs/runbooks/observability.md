# Observability Runbook

Owner: platform  
Update trigger: changes to local observability tooling or telemetry wiring.

## Preconditions
- Docker is installed and running.
- Local app stack is running (`backend`, optionally `frontend`).

## Steps
1. Start stack: `dev/obs.sh up`
2. Check status: `dev/obs.sh status`
3. Tail logs when debugging: `dev/obs.sh logs`
4. Stop stack after use: `dev/obs.sh down`

## Expected Results
- Loki reachable on `http://localhost:3100`.
- Prometheus reachable on `http://localhost:9090`.
- Tempo reachable on `http://localhost:3200`.

## Recovery
- If services do not come up, run `dev/obs.sh logs` and resolve container errors first.
- If ports are in use, stop conflicting services and restart with `dev/obs.sh up`.
- If local app logs are missing, confirm app stack is running and telemetry wiring is enabled for local/dev only.

## Integration Notes
- Keep this stack opt-in; do not make app boot depend on it.
- Route logs/metrics/traces to this stack only in local/dev flows.
