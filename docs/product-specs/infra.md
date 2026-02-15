---
owner: unslop
status: verified
last_verified: 2026-02-15
---

# Infra & Deployment (v0.2)

## problem
The system needs clear runtime, deployment, and environment boundaries so backend/extension/frontend ship consistently across dev and production.

## non_goals
- Multi-cloud abstraction layers or speculative platform migrations.
- Nonessential infra expansion outside current backend + static site + extension scope.

## acceptance_criteria
- AC1: Domains, stack versions, and environment boundaries are documented.
- AC2: Deployment workflows, secrets, and operational dependencies are explicit.
- AC3: CI/CD expectations map to repo workflows and runtime constraints.

## constraints
- Performance: Runtime and DB connectivity choices must support low-latency classify flows.
- Security/Privacy: Secrets must be managed via platform secret stores, not source control.
- Compatibility: Infrastructure choices must support Cloudflare Workers + Neon + extension/site requirements.

## telemetry
- Logs: Worker logs and deployment workflow logs are available for diagnosis.
- Metrics: Service availability, route health, and deploy success/failure signals.
- Traces: Runtime tracing where supported by platform tooling.

## test_plan
- Unit: Config parsing and environment validation helpers.
- Integration: Deployment config and migration execution checks.
- E2E: Post-deploy smoke for API reachability and site availability.

## rollout
- Flags: No global infra flags; use staged deploy workflows.
- Migration: Infrastructure and schema migrations coordinated through CI/CD.
- Backout: Roll back deployment and revert infra config changes when needed.

## Domains

- Backend API: `https://api.getunslop.com`
- Public site: `https://getunslop.com` (optional `https://www.getunslop.com` → redirect to apex)

The extension only calls the API domain.

## Stack (pinned)

Backend:
- Runtime: **Cloudflare Workers** (production), **Bun v1.3.8** (local dev + tests)
- Language: **TypeScript 5.9.x**
- HTTP Framework: **Hono 4.11.x**
- ORM: **Drizzle ORM 1.0.0-beta.13** (postgres-js driver via Hyperdrive)
- Hosting: **Cloudflare Workers** (edge deployment)
- DB Connection: **Cloudflare Hyperdrive** (connection pooler)
- Database: **Neon Postgres**

Extension:
- Chrome Extension **Manifest V3**
- Build: Vite + TypeScript
- Output: zip for Chrome Web Store

Frontend site:
- Static HTML/CSS (no build step required)

## Environments

Two environments:
- `dev` — local, `.env` file or `.dev.vars`
- `prod` — Cloudflare Workers secrets + Hyperdrive

Each environment has its own:
- `DATABASE_URL`
- Secrets (JWT/Polar/OpenRouter/Resend)

## Backend environment variables

See `backend/README.md` for the full reference table.

## Backend deploy (Cloudflare Workers)

Config: `backend/wrangler.toml`
Entry point: `backend/src/worker.ts`

Deploy command:
```bash
cd backend && bun run deploy
```

Automatic deploy: push to `main` triggers `.github/workflows/deploy-backend.yml` which runs Drizzle migrations then `wrangler deploy`.

### One-time setup

1. Create Hyperdrive config and paste ID into `wrangler.toml`
2. Set all secrets via `wrangler secret put`
3. Add `CLOUDFLARE_API_TOKEN` and `NEON_DATABASE_URL` as GitHub repo secrets
4. Bind `api.getunslop.com` as custom domain in Cloudflare Workers dashboard

Full step-by-step instructions in `backend/README.md`.

## Database (Neon)

- Separate branches/DBs for dev and prod.
- Migrations run via Drizzle:
  - Locally: `bun run migrate:push`
  - CI/CD: `bunx drizzle-kit migrate` with `NEON_DATABASE_URL` secret

## CI/CD (GitHub Actions)

| Workflow | Trigger | Steps |
|----------|---------|-------|
| `backend-ci.yml` | PR → `backend/**` | `bun install` → `tsc --noEmit` → `bun run test` |
| `deploy-backend.yml` | Push to `main` → `backend/**` | `bun install` → `drizzle-kit migrate` → `wrangler deploy` |

## Frontend deploy (static site)

- Use any static hosting that can serve a folder with HTML files and attach a custom domain.
- Serve `frontend/` directory as the site root.
- Provide HTTPS.
- Optionally redirect `www.` to apex.

No environment variables required for the frontend site.

## Logging

- Workers pipe `console.log`/`console.error` to Cloudflare's log stream.
- View live: `npx wrangler tail`
- Structured JSON logs with sensitive key redaction.
- Log LLM calls at high level: decision, model, latency.
- Do not log full post payload text/attachments.
