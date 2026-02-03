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
