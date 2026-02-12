# Frontend (Public Site) Spec (v0.1)

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
