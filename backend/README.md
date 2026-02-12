# Backend

Backend API for Unslop — deployed to **Cloudflare Workers** with **Hyperdrive** connection pooling to **Neon Postgres**.

## Architecture

```
User (Chrome extension)
  │
  ▼
Cloudflare Worker (nearest edge PoP)
  │
  ├─► Postgres (via Hyperdrive → Neon)   ← classification cache, users, billing
  └─► OpenRouter (LLM inference)          ← classification scoring
```

Two entry points:

| File | Used by | Runtime |
|------|---------|---------|
| `src/index.ts` | `bun run dev` (local development) | Bun |
| `src/worker.ts` | `wrangler dev` / production Workers | Cloudflare Workers |

Both use the same app code, DI system, and config loader. The only difference is how env vars are provided and how the DB connection is established.

## Local Development

### Prerequisites

- [Bun](https://bun.sh) v1.3.8+
- Local Postgres

### Setup

```bash
cd backend
bun install
cp .env.example .env
# Edit .env with your values (see Environment Variables below)
```

### Run

```bash
# Standard local dev (Bun runtime — fastest iteration):
bun run dev

# Test Workers compatibility locally (Miniflare):
bun run dev:workers
```

`bun run dev` reads `.env` automatically via `--env-file`.
`bun run dev:workers` uses `wrangler dev` and reads `.dev.vars` + `wrangler.toml` for env vars and Hyperdrive config.

### Database Migrations

```bash
# Generate a new migration from schema changes:
bunx drizzle-kit generate

# Apply pending migrations:
bun run migrate:push
```

### Tests

```bash
bun run type-check      # TypeScript compilation (tsc --noEmit)
bun run test            # All unit tests
bun run test:integration
```

## Environment Variables

All env vars are listed in `.env.example`. Here's what each group does:

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | ✅ | Postgres connection string |
| `APP_URL` | ✅ | Public base URL of the API |
| `JWT_SECRET` | ✅ | Secret for signing JWTs |
| `MAGIC_LINK_BASE_URL` | ✅ | Callback URL for magic link auth |
| `LLM_API_KEY` | ✅ | OpenRouter API key |
| `LLM_MODEL` | ✅ | Text classification model ID |
| `VLM_MODEL` | ✅ | Vision/multimodal model ID |
| `LLM_BASE_URL` | ❌ | Defaults to `https://openrouter.ai/api/v1` |
| `POLAR_ENV` | ❌ | `sandbox` or `production` (default: production) |
| `POLAR_API_KEY` | ✅ | Polar billing API key |
| `POLAR_WEBHOOK_SECRET` | ✅ | Polar webhook verification secret |
| `POLAR_PRODUCT_ID` | ✅ | Polar product ID for Pro plan |
| `RESEND_API_KEY` | ❌ | Resend email API key (`re_dummy` for dev mode) |
| `LOG_MAGIC_LINK_URLS` | ❌ | Set `true` to log magic links locally |
| `FREE_MONTHLY_LLM_CALLS` | ❌ | Default: 300 |
| `PRO_MONTHLY_LLM_CALLS` | ❌ | Default: 10000 |
| `BATCH_LLM_CONCURRENCY` | ❌ | Default: 4 |

### Where env vars live

| Context | Source |
|---------|--------|
| `bun run dev` (local) | `.env` file |
| `bun run dev:workers` (local Workers sim) | `.dev.vars` file |
| Tests | `bunfig.toml` preloads dotenv + `TEST_MODE=true` |
| Production (Cloudflare Workers) | Encrypted secrets via `wrangler secret put` |
| `wrangler.toml` | Only non-secret config (worker name, Hyperdrive binding) |

## Production Deployment (Cloudflare Workers)

### How it works

- `src/worker.ts` is the Workers entry point — set in `wrangler.toml` as `main`
- Workers receive env vars from Cloudflare secrets (set via `wrangler secret put`)
- DB connections go through **Hyperdrive** (Cloudflare's connection pooler) to Neon Postgres
- `wrangler.toml` is the config file **submitted to Cloudflare** — it defines the worker name, Hyperdrive binding, and compatibility flags
- The `localConnectionString` in `wrangler.toml` is **only used by `wrangler dev`** for local testing — it's ignored in production

### `wrangler.toml` explained

```toml
name = "unslop-api"                          # Worker name on Cloudflare
main = "src/worker.ts"                       # Entry point
compatibility_date = "2025-01-01"            # Workers API version
compatibility_flags = ["nodejs_compat"]      # Enables postgres.js TCP support

[dev]
port = 3000                                  # Port for 'wrangler dev' locally

[[hyperdrive]]
binding = "HYPERDRIVE"                       # Name of the binding in worker code
id = "PLACEHOLDER"                           # ← Replace with your Hyperdrive config ID
localConnectionString = "..."                # ← Only for 'wrangler dev', ignored in prod
```

### First-time setup (one-time, do this before first deploy)

#### 1. Create the Hyperdrive config

```bash
bunx wrangler hyperdrive create unslop-db \
  --connection-string="postgresql://USER:PASS@ep-xxx.us-east-2.aws.neon.tech/neondb?sslmode=require"
```

This prints a config ID. Copy it and replace `PLACEHOLDER` in `wrangler.toml`:

```toml
[[hyperdrive]]
binding = "HYPERDRIVE"
id = "abc123def456"   # ← paste here
```

#### 2. Set all Worker secrets

Every env var that contains a secret must be set via `wrangler secret put`. Run each of these from `backend/`:

```bash
echo "your-jwt-secret" | bunx wrangler secret put JWT_SECRET
echo "sk-or-v1-xxx" | bunx wrangler secret put LLM_API_KEY
echo "your-model-id" | bunx wrangler secret put LLM_MODEL
echo "your-vlm-id" | bunx wrangler secret put VLM_MODEL
echo "https://openrouter.ai/api/v1" | bunx wrangler secret put LLM_BASE_URL
echo "your-polar-key" | bunx wrangler secret put POLAR_API_KEY
echo "your-polar-secret" | bunx wrangler secret put POLAR_WEBHOOK_SECRET
echo "your-polar-product" | bunx wrangler secret put POLAR_PRODUCT_ID
echo "production" | bunx wrangler secret put POLAR_ENV
echo "re_xxx" | bunx wrangler secret put RESEND_API_KEY
echo "https://api.getunslop.com" | bunx wrangler secret put APP_URL
echo "https://api.getunslop.com/v1/auth/callback" | bunx wrangler secret put MAGIC_LINK_BASE_URL
```

**Note**: You do **NOT** set `DATABASE_URL` as a Worker secret. The worker gets the database connection string automatically from `env.HYPERDRIVE.connectionString` (see `src/worker.ts`).

#### 3. Add GitHub repo secrets (for CI/CD)

In your GitHub repo → Settings → Secrets and variables → Actions:

| Secret name | Value |
|-------------|-------|
| `CLOUDFLARE_API_TOKEN` | Create at Cloudflare dashboard → My Profile → API Tokens → "Edit Cloudflare Workers" template |
| `NEON_DATABASE_URL` | Your **direct Neon connection string** (same one used for Hyperdrive) — used by GitHub Actions to run migrations |

**Why two connection strings?** Workers connect to Neon **through Hyperdrive** (via the binding), but GitHub Actions runs migrations **directly against Neon** (Hyperdrive is only accessible from Workers).

#### 4. Custom domain

Cloudflare dashboard → Workers & Pages → `unslop-api` → Settings → Domains & Routes → Add Custom Domain → `api.getunslop.com`

Since the domain is already on Cloudflare DNS, this auto-configures SSL and routing.

### Deploy

```bash
# Manual deploy:
cd backend
bun run deploy

# Automatic: pushes to main touching backend/ trigger the GitHub Action
```

### CI/CD (GitHub Actions)

| Workflow | Trigger | What it does |
|----------|---------|-------------|
| `backend-ci.yml` | PRs touching `backend/` | Type-check + unit tests |
| `deploy-backend.yml` | Push to `main` touching `backend/` | Drizzle migrations → `wrangler deploy` |

## Quality Guardrails

- No `any` in production backend code
- Runtime env reads come from one config module (`config/runtime.ts`)
- Routes are transport-only — no direct DB queries
- Domain literals come from shared constants/enums
- External collaborators injected through DI wiring (`app/dependencies.ts`)
