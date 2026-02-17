---
owner: unslop
status: verified
last_verified: 2026-02-15
---

# Frontend (Public Site) Spec (v0.1)

## problem
The product requires a trustworthy public web presence with stable policy/support pages and install CTA, without becoming an app surface.

## non_goals
- Application dashboard features, analytics surfaces, or account management UI.
- Dynamic tracking, cookie banners driven by trackers, or marketing expansion beyond core pages.

## acceptance_criteria
- AC1: Required pages (`/`, `/privacy`, `/support`) exist with required content blocks.
- AC2: Privacy copy reflects actual data usage and processors.
- AC3: Site remains static and deployable without a runtime backend dependency.

## constraints
- Performance: Static pages should load quickly with minimal assets.
- Security/Privacy: No analytics scripts, tracking pixels, or cookies by default.
- Compatibility: Works on static hosting with HTTPS and optional apex/www redirect.

## telemetry
- Logs: Hosting-level access/error logs only when needed for ops.
- Metrics: Basic uptime and page availability checks.
- Traces: Not required for static-site baseline.

## test_plan
- Unit: Not required for static content-focused pages.
- Integration: Link integrity and policy/support route availability checks.
- E2E: UI smoke for required pages and CTA/navigation links.

## rollout
- Flags: No feature flags required for static content rollout.
- Migration: Content changes ship as static deploy updates.
- Backout: Re-deploy previous static bundle.

This is the static website served at:

- `https://getunslop.com` (and optionally `https://www.getunslop.com`)

It exists for:
- trust (a real home for the project)
- required links for store/payments
- stable Privacy Policy and Support contact

It is **not** an application UI.

## Pages (required)

### 1) `/` Landing page

Must include:

- Product name + one-sentence description:
  - “Chrome extension that hides low-value LinkedIn posts.”
- Primary CTA:
  - “Install on Chrome” linking to `<CHROME_WEB_STORE_URL>`
- Secondary links:
  - Privacy Policy → `/privacy`
  - Support → `/support`
  - (Optional) Terms → `/terms`

No newsletter capture, no blog, no tracking.

### 2) `/privacy` Privacy Policy

Must describe (plain language):

**Data we collect**
- Account:
  - email (for magic-link login)
- Content for classification:
  - `post_id`, `author_id`, `author_name`
  - `nodes[]` text graph (`id`, `parent_id`, `kind`, `text`) used to preserve root/repost context
  - `attachments[]` classification inputs (e.g., image `sha256`, `mime_type`, `base64`; pdf `source_url`, `excerpt_text`)
  - decision/event metadata used for cache and attempt history (`decision`, `source`, timestamps, provider error/status metadata)
- Feedback (if user submits it):
  - `post_id`, rendered decision, user label

**Why**
- Provide filtering decisions
- Prevent duplicate LLM calls (cache)
- Enforce quotas
- Improve future versions (data collection only; no training in v0.1)

**Where it goes (processors)**
- LLM inference provider (e.g. OpenRouter): receives post content for classification
- Hosting provider for backend (Railway)
- Database provider (Neon)
- Billing provider (Polar)

**Retention**
- Recommended defaults:
  - posts: 90 days
  - feedback: 180 days
  - user record: until deletion request

**Deletion**
- Provide a single support email:
  - `<SUPPORT_EMAIL>`
- State: “Email us from the account email to request deletion.”

### 3) `/support`

Must include:

- Contact: `<SUPPORT_EMAIL>`
- Short FAQ:
  - “How do I sign in?”
  - “Why was something hidden?”
  - “How do I cancel Pro?” (point to Polar flow, or “email support”)

## Pages (optional)

### `/terms`

If included, keep it short:
- provided “as is”
- no guarantees
- liability limitations

## Implementation constraints

- Static HTML/CSS only (no JS required).
- No cookies, no analytics scripts, no tracking pixels.
- Must be deployable with no build step.
