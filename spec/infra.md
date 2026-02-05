# Infra & Deployment (v0.1)

## Domains

- Backend API: `https://api.getunslop.com`
- Public site: `https://getunslop.com` (optional `https://www.getunslop.com` → redirect to apex)

The extension only calls the API domain.

## Stack (pinned)

Backend:
- Runtime: **Bun v1.3.8**
- Language: **TypeScript 5.9.x**
- HTTP Framework: **Hono 4.11.x**
- ORM: **Drizzle ORM 0.45.x** (Neon HTTP driver)
- Hosting: **Railway** (container)
- Database: **Neon Postgres**

Extension:
- Chrome Extension **Manifest V3**
- Build: Vite + TypeScript
- Output: zip for Chrome Web Store

Frontend site:
- Static HTML/CSS (no build step required)

## Environments

Two environments:
- `dev`
- `prod`

Each environment has its own:
- `DATABASE_URL`
- secrets (JWT/Magic link/Polar/OpenRouter)

## Backend environment variables (required)

Database:
- `DATABASE_URL`

Auth:
- `JWT_SECRET`
- `MAGIC_LINK_SECRET`
- `MAGIC_LINK_BASE_URL` (e.g. `https://api.getunslop.com/v1/auth/callback`)

Billing (Polar):
- `POLAR_API_KEY`
- `POLAR_WEBHOOK_SECRET`

LLM provider (OpenRouter):
- `LLM_API_KEY`
- `LLM_BASE_URL` (default `https://openrouter.ai/api/v1`)
- `LLM_MODEL` (single model name for v0.1)

Quotas / cache:
- `FREE_MONTHLY_LLM_CALLS` (default 300)
- `PRO_MONTHLY_LLM_CALLS` (default 10000)
- `POST_CACHE_TTL_DAYS` (default 7)

Server:
- `NODE_ENV=production`
- `PORT=3000`

## Backend deploy (Railway)

- Dockerfile deploy.
- Ensure env vars set per environment.

Minimal Dockerfile:

```Dockerfile
FROM oven/bun:1.3.8

WORKDIR /app
COPY package.json bun.lockb ./
RUN bun install --production
COPY . .
ENV PORT=3000
EXPOSE 3000
CMD ["bun", "run", "start"]
```

## Database (Neon)

- Separate branches/DBs for dev and prod.
- Run migrations via Drizzle (script name depends on repo tooling).

## Frontend deploy (static site)

Recommended simplest path:

- Use any static hosting that can serve a folder with HTML files and attach a custom domain.
- Requirements:
  - Serve `frontend/` directory as the site root.
  - Provide HTTPS.
  - Optionally redirect `www.` to apex.

No environment variables required for the frontend site in v0.1.

## Logging (minimal)

- Log request method/path/status/duration.
- Log LLM call at high level:
  - decision, model, latency
- Do not log full `content_text` in production logs.
