# Infrastructure & Deployment Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Set up Docker containerization and Railway deployment for the backend API.

**Architecture:** Single Docker container running Bun + Hono server, deployed to Railway with Postgres addon.

**Tech Stack:** Docker, Railway, Neon Postgres, Drizzle migrations

---

## Task 1: Create Dockerfile

**Files:**
- Create: `backend/Dockerfile`
- Create: `backend/.dockerignore`

**Step 1: Write Dockerfile**

```dockerfile
# backend/Dockerfile
FROM oven/bun:1.3.8 AS base
WORKDIR /app

# Install dependencies
FROM base AS install
COPY package.json bun.lockb ./
RUN bun install --frozen-lockfile

# Production image
FROM base AS release
COPY --from=install /app/node_modules ./node_modules
COPY . .

# Set production environment
ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

# Run migrations on startup, then start server
CMD bun run src/db/migrate.ts && bun run src/index.ts
```

**Step 2: Create .dockerignore**

```
node_modules
.git
.gitignore
drizzle
.env
.env.local
*.md
tests
```

**Step 3: Update package.json scripts**

```json
// Add to backend/package.json scripts section
"migrate": "drizzle-kit migrate",
"start": "bun run src/index.ts"
```

**Step 4: Test Docker build locally**

Run: `cd backend && docker build -t unslop-backend .`
Expected: Image builds successfully

**Step 5: Commit**

```bash
git add backend/Dockerfile backend/.dockerignore backend/package.json
git commit -m "feat: add Dockerfile for backend"
```

---

## Task 2: Create Railway configuration

**Files:**
- Create: `backend/railway.json`
- Create: `backend/.env.example`

**Step 1: Create railway.json**

```json
{
  "$schema": "https://railway.app/railway.schema.json",
  "build": {
    "builder": "DOCKERFILE",
    "dockerfilePath": "Dockerfile"
  },
  "deploy": {
    "healthcheckPath": "/",
    "healthcheckTimeout": 100,
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 10
  }
}
```

**Step 2: Create .env.example**

```bash
# Database
DATABASE_URL=

# Auth
JWT_SECRET=
MAGIC_LINK_SECRET=
MAGIC_LINK_BASE_URL=https://api.getunslop.com/v1/auth/callback

# Email
RESEND_API_KEY=

# Billing (Polar)
POLAR_API_KEY=
POLAR_WEBHOOK_SECRET=
POLAR_PRO_MONTHLY_PRICE_ID=

# LLM (OpenRouter)
OPENROUTER_API_KEY=
OPENROUTER_BASE_URL=https://openrouter.ai/api/v1
OPENROUTER_MODEL=

# Quotas
FREE_MONTHLY_LLM_CALLS=300
PRO_MONTHLY_LLM_CALLS=10000
POST_CACHE_TTL_DAYS=7

# Server
NODE_ENV=production
PORT=3000
```

**Step 3: Commit**

```bash
git add backend/railway.json backend/.env.example
git commit -m "feat: add Railway configuration"
```

---

## Task 3: Create health check endpoint

**Files:**
- Modify: `backend/src/index.ts`

**Step 1: Add health check endpoint**

```typescript
// Add to backend/src/index.ts

// Health check endpoint
app.get('/health', (c) => {
  return c.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: '0.1.0',
  });
});
```

**Step 2: Test health check**

Run: `curl http://localhost:3000/health`
Expected: JSON response with status, timestamp, version

**Step 3: Commit**

```bash
git add backend/src/index.ts
git commit -m "feat: add health check endpoint"
```

---

## Task 4: Create deployment script

**Files:**
- Create: `scripts/deploy.sh`

**Step 1: Create deployment script**

```bash
#!/bin/bash
set -e

echo "Unslop Backend Deployment Script"

# Check if Railway CLI is installed
if ! command -v railway &> /dev/null; then
    echo "Railway CLI not found. Installing..."
    npm install -g @railway/cli
fi

# Link to Railway project (if not already linked)
if ! railway status &> /dev/null; then
    echo "Linking to Railway project..."
    railway link
fi

# Deploy
echo "Deploying to Railway..."
railway up

echo "Deployment complete!"
echo "Get your service URL with: railway domain"
```

**Step 2: Make script executable**

Run: `chmod +x scripts/deploy.sh`

**Step 3: Commit**

```bash
git add scripts/deploy.sh
git commit -m "feat: add Railway deployment script"
```

---

## Task 5: Create migration helper script

**Files:**
- Create: `scripts/migrate.sh`

**Step 1: Create migration script**

```bash
#!/bin/bash
set -e

echo "Running database migrations..."

# Load .env variables
if [ -f backend/.env ]; then
    export $(cat backend/.env | grep -v '^#' | xargs)
else
    echo "Error: backend/.env not found"
    exit 1
fi

# Run migrations
cd backend
bun run migrate:push

echo "Migrations completed!"
```

**Step 2: Make script executable**

Run: `chmod +x scripts/migrate.sh`

**Step 3: Commit**

```bash
git add scripts/migrate.sh
git commit -m "feat: add database migration script"
```

---

## Task 6: Create environment setup guide

**Files:**
- Create: `docs/DEPLOYMENT.md`

**Step 1: Write deployment guide**

```markdown
# Deployment Guide

## Prerequisites

- Railway account
- Neon account (or use Railway's Postgres)
- Resend account (for email)
- Polar account (for billing)
- OpenRouter account (for LLM)

## Initial Setup

### 1. Create Railway Project

```bash
# Install Railway CLI
npm install -g @railway/cli

# Login to Railway
railway login

# Create new project
railway new
```

### 2. Add Postgres Database

```bash
# Add Postgres addon
railway add postgres

# Get DATABASE_URL
railway variables get DATABASE_URL
```

### 3. Set Environment Variables

```bash
# Set each variable
railway variables set JWT_SECRET="your-secret-here"
railway variables set MAGIC_LINK_SECRET="another-secret"
railway variables set MAGIC_LINK_BASE_URL="https://your-domain.railway.app/v1/auth/callback"
# ... set all other variables
```

### 4. Deploy

```bash
# From project root
./scripts/deploy.sh
```

## Setting Up External Services

### Resend (Email)

1. Sign up at https://resend.com
2. Create API key
3. Verify your domain (e.g., getunslop.com)
4. Set `RESEND_API_KEY` environment variable

### Polar (Billing)

1. Sign up at https://polar.sh
2. Create a product with monthly price
3. Note the product price ID
4. Set up webhook pointing to `https://your-domain.railway.app/v1/billing/polar/webhook`
5. Set `POLAR_API_KEY`, `POLAR_WEBHOOK_SECRET`, `POLAR_PRO_MONTHLY_PRICE_ID`

### OpenRouter (LLM)

1. Sign up at https://openrouter.ai
2. Add funds to your account
3. Choose a model (e.g., `anthropic/claude-3-haiku`)
4. Set `OPENROUTER_API_KEY`, `OPENROUTER_MODEL`

## Migrations

After deployment, run migrations:

```bash
./scripts/migrate.sh
```

Or via Railway shell:

```bash
railway shell
bun run src/db/migrate.ts
```

## Verification

Check health endpoint:

```bash
curl https://your-domain.railway.app/health
```

Expected response:

```json
{
  "status": "ok",
  "timestamp": "2025-02-03T12:00:00.000Z",
  "version": "0.1.0"
}
```

## Custom Domain (Optional)

1. Buy domain on Railway
2. Add CNAME record pointing to Railway
3. Configure in Railway project settings
4. Update `MAGIC_LINK_BASE_URL` to new domain
```

**Step 2: Commit**

```bash
git add docs/DEPLOYMENT.md
git commit -m "docs: add deployment guide"
```

---

## Task 7: Create CI configuration (optional)

**Files:**
- Create: `.github/workflows/test.yml`

**Step 1: Create GitHub Actions workflow**

```yaml
name: Test

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4

      - name: Setup Bun
        uses: oven-sh/setup-bun@v1
        with:
          bun-version: 1.3.8

      - name: Install dependencies (backend)
        working-directory: ./backend
        run: bun install

      - name: Type check (backend)
        working-directory: ./backend
        run: bun run tsc --noEmit

      - name: Run tests (backend)
        working-directory: ./backend
        run: bun test
```

**Step 2: Commit**

```bash
git add .github/workflows/test.yml
git commit -m "ci: add test workflow"
```

---

## Dependencies

- **Requires:** All backend implementation plans complete (auth, classify, feedback, billing)

---

## What's NOT included

- No staging environment (just dev/prod)
- No separate migration service (migrations run in container startup)
- No monitoring/alerting beyond Railway defaults
- No log aggregation (Railway logs only)
