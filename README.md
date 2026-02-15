# Unslop - Local Development Guide

This guide covers how to set up and run all Unslop components locally for development.

## Agent Orientation

If you are working as an autonomous coding agent, start here before editing code:

1. Read `AGENTS.md`.
2. Read `docs/index.md`.
3. Run `make init-feature FEATURE=<task-slug>` from the primary checkout (this first syncs the base from origin, then runs setup + env bootstrap in the new worktree).
4. Fill the generated active plan in `docs/exec-plans/active/`.
5. Map the task to governing specs in `docs/product-specs/index.md`.
6. Repeat `(edit -> make check -> review)` until clean.
7. Run `make pr-ready` before proposing PR submission (`make pr-submit` wrapper submits and schedules local worktree cleanup).

Note:
- `make setup` bootstraps a root `package.json` for shared agent-harness tooling when missing, then installs root + service dependencies.

Canonical workflows:
- `docs/runbooks/golden-paths.md`
- `docs/runbooks/docs-freshness.md`
- `docs/runbooks/quality-review.md`

## Prerequisites

- **Bun** v1.3.8+ - [Install Bun](https://bun.sh)
- **Docker** with Docker Compose - for local PostgreSQL
- **Chrome** browser - for extension testing

## Quick Start

```bash
# 1. Start the database
docker compose up -d

# 2. Start the backend
cd backend && bun run dev

# 3. Build the extension
cd extension && bun run build

# 4. Serve the frontend (optional)
cd frontend && bunx serve -l 8080
```

---

## Component Details

### 1. Database (PostgreSQL)

A Docker Compose configuration provides PostgreSQL 18.1 for local development.

```bash
# Start database
docker compose up -d

# View logs
docker compose logs -f postgres

# Stop database
docker compose down

# Reset database (removes all data)
docker compose down -v && docker compose up -d
```

After starting a fresh database volume, apply schema with Drizzle migrations:

```bash
cd backend
bun run migrate
```

**Connection details:**
- Host: `localhost`
- Port: `5432`
- User: `unslop`
- Password: `unslop_dev_password`
- Database: `unslop`

---

### 2. Backend API

The backend is a Bun + Hono server.

```bash
cd backend

# Install dependencies
bun install

# Start dev server (hot reload)
bun run dev

# Type check
bun run type-check

# Run deterministic unit tests
bun run test
```

**Server runs at:** `http://localhost:3000`

#### Environment Variables

Copy `.env.example` to `.env`. The default `.env` is configured for local development:

| Variable | Description | Dev Default |
|----------|-------------|-------------|
| `DATABASE_URL` | PostgreSQL connection string | Local Docker PostgreSQL |
| `JWT_SECRET` | Secret for session tokens | Dev secret (change in prod) |
| `MAGIC_LINK_SECRET` | Secret for magic links | Dev secret |
| `RESEND_API_KEY` | Resend API key for emails | Dummy (emails logged to console) |
| `LLM_API_KEY` | OpenRouter API key for LLM | Dummy (falls back to "keep") |
| `POLAR_API_KEY` | Polar API key for billing | Dummy (checkout returns error) |

**Dev Mode Features:**
- Magic links are logged to the console instead of emailed
- LLM classification fails gracefully to `decision: "keep"` with `source: "error"`
- Billing checkout returns `checkout_failed` error

#### Testing API Endpoints

```bash
# Health check
curl http://localhost:3000/health

# Start auth flow (logs magic link to console)
curl -X POST http://localhost:3000/v1/auth/start \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com"}'

# Visit the magic link from console output, then use the JWT for:

# Get user info
curl http://localhost:3000/v1/me \
  -H "Authorization: Bearer <JWT>"

# Classify a post
curl -X POST http://localhost:3000/v1/classify \
  -H "Authorization: Bearer <JWT>" \
  -H "Content-Type: application/json" \
  -d '{"post":{"post_id":"123","author_id":"456","author_name":"Test","content_text":"Test post"}}'
```

---

### 3. Chrome Extension

```bash
cd extension

# Install dependencies
bun install

# Build for production
bun run build

# Start dev server (for development with hot reload)
bun run dev
```

**Output:** The built extension is in `extension/dist/`

#### Loading in Chrome

1. Open Chrome and go to `chrome://extensions/`
2. Enable "Developer mode" (toggle in top right)
3. Click "Load unpacked"
4. Select the `extension/dist/` folder

#### Configuring API URL

For local development, update the API URL in `extension/src/lib/config.ts`:

```typescript
export const API_BASE_URL = 'http://localhost:3000';
```

---

### 4. Frontend (Static Site)

The frontend is a static HTML/CSS site with no build step.

```bash
cd frontend

# Serve locally
bunx serve -l 8080
```

**Site runs at:** `http://localhost:8080`

Pages:
- `/` - Landing page
- `/privacy.html` - Privacy Policy
- `/support.html` - Support & FAQ
- `/terms.html` - Terms of Service

---

## Full Stack Testing

1. **Start all services:**
   ```bash
   # Terminal 1: Database
   docker compose up -d
   
   # Terminal 2: Backend
   cd backend && bun run dev
   
   # Terminal 3: Frontend (optional)
   cd frontend && bunx serve -l 8080
   ```

2. **Build and load extension:**
   ```bash
   cd extension && bun run build
   # Then load dist/ folder in Chrome
   ```

3. **Test the flow:**
   - Sign in via the extension popup
   - Visit LinkedIn and browse your feed
   - Posts will be classified (falling back to "keep" without real OpenRouter key)

---

## Production Configuration

For production deployment, you need real API keys:

| Service | Get Key At | Required For |
|---------|-----------|--------------|
| Neon | https://neon.tech | Database |
| Resend | https://resend.com | Magic link emails |
| OpenRouter | https://openrouter.ai | LLM classification |
| Polar | https://polar.sh | Subscription billing |

The backend automatically detects Neon databases and uses the serverless driver.

---

## Troubleshooting

### Database connection errors
```bash
# Check if PostgreSQL is running
docker compose ps

# View database logs
docker compose logs postgres

# Reset database
docker compose down -v && docker compose up -d
```

### Port already in use
```bash
# Find and kill process on port 3000
lsof -i :3000 -t | xargs -r kill -9
```

### Extension not updating
1. Go to `chrome://extensions/`
2. Click the refresh icon on the Unslop extension
3. Reload the LinkedIn page

---

## Project Structure

```
Unslop/
├── backend/           # Bun + Hono API server
│   ├── src/
│   │   ├── routes/    # API endpoints
│   │   ├── services/  # Business logic
│   │   ├── db/        # Database schema & connection
│   │   └── lib/       # Utilities (JWT, email, hash)
│   └── drizzle/       # Database migrations
├── extension/         # Chrome Extension (MV3)
│   └── src/
│       ├── background/  # Service worker
│       ├── content/     # LinkedIn content script
│       └── popup/       # Extension popup UI
├── frontend/          # Static public website
└── docs/product-specs/ # Project specifications
```
