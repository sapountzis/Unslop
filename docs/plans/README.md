# Unslop Implementation Plans

This directory contains independent, non-overlapping implementation plans for Unslop v0.1.

## Implementation Status

| Plan | Status |
|------|--------|
| 1. Database Schema & Migrations | ✅ Complete |
| 2. Auth System | ✅ Complete |
| 3. Classification System | ✅ Complete |
| 4. Feedback System | ✅ Complete |
| 5. Billing System | ✅ Complete |
| 6. Chrome Extension | ✅ Complete |
| 7. Infrastructure & Deployment | ✅ Complete |
| 8. **Frontend Website** | ⚠️ **TODO** |

## Plans

### 1. [Database Schema & Migrations](2025-02-03-database-schema-migrations.md) ✅
**Foundation** - Must be implemented first.

Sets up Postgres database with complete schema using Drizzle ORM.

**Dependencies:** None

---

### 2. [Auth System](2025-02-03-auth-system.md) ✅
Implements email magic-link authentication with JWT session tokens.

**Dependencies:**
- `database-schema-migrations` (users table must exist)

**Can be implemented in parallel with:**
- `classification-system`
- `billing-system`

---

### 3. [Classification System](2025-02-03-classification-system.md) ✅
Implements LLM-based post classification with caching, quota enforcement, and usage tracking.

**Dependencies:**
- `database-schema-migrations` (posts, user_usage tables)
- `auth-system` (JWT verification for auth middleware)

**Can be implemented in parallel with:**
- `billing-system`
- `feedback-system`

---

### 4. [Feedback System](2025-02-03-feedback-system.md) ✅
Implements user feedback collection for classification decisions.

**Dependencies:**
- `database-schema-migrations` (posts, post_feedback tables)
- `auth-system` (JWT verification)
- `classification-system` (posts must exist to give feedback on)

**Can be implemented in parallel with:**
- `billing-system`
- `chrome-extension`

---

### 5. [Billing System](2025-02-03-billing-system.md) ✅
Implements Polar checkout integration and webhook handling for Pro subscriptions.

**Dependencies:**
- `database-schema-migrations` (users table with plan fields)
- `auth-system` (JWT verification)

**Can be implemented in parallel with:**
- `classification-system`
- `feedback-system`
- `chrome-extension`

---

### 6. [Chrome Extension](2025-02-03-chrome-extension.md) ✅
Builds Chrome Extension that filters LinkedIn feed based on backend decisions.

**Dependencies:**
- Backend API running (auth, classify endpoints)

**Can be implemented in parallel with:**
- `infrastructure-deployment`

---

### 7. [Infrastructure & Deployment](2025-02-03-infrastructure-deployment.md) ✅
Sets up Docker containerization and Railway deployment for the backend API.

**Dependencies:**
- All backend implementation plans complete

---

### 8. [Frontend Website](2025-02-03-frontend-website.md)
Builds static public website (unslop.xyz) with landing, privacy, and support pages.

**Dependencies:**
- None (completely independent static site)

**Status:** **NOT YET IMPLEMENTED** - This is the only remaining plan

---

## Dependency Graph

```
database-schema-migrations (do this first!)
├── auth-system ────────────────────────┐
├── classification-system ──┐           │
│   └── feedback-system     │           │
├── billing-system ─────────┤           ├── infrastructure-deployment
└── chrome-extension ───────┘           │
                                         │
(all backend plans) ─────────────────────┘

frontend-website (INDEPENDENT - can be done anytime!)
```

## Parallel Execution Strategy

### Phase 1: Foundation (1 day)
- `database-schema-migrations`

### Phase 2: Core Backend (2-3 days, parallel)
- `auth-system`
- `classification-system`
- `billing-system`

### Phase 3: Extensions (1 day, parallel)
- `feedback-system`
- `chrome-extension`
- `infrastructure-deployment` (can start once Phase 2 is mostly done)

### Phase 4: Frontend (can be done anytime, independent)
- `frontend-website`

## Execution

Use `superpowers:executing-plans` skill to implement any plan:

```bash
# For example, to implement the database plan:
cd docs/plans
# Open 2025-02-03-database-schema-migrations.md and follow it
```

Each plan is self-contained with:
- Exact file paths
- Complete code
- Exact commands
- Expected outputs
- Test coverage
