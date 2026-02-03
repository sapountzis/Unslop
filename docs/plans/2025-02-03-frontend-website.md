# Frontend Website Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a static HTML/CSS website for getunslop.com with landing page, privacy policy, and support pages.

**Architecture:** Pure static HTML/CSS files with no build step, no JavaScript, no tracking.

**Tech Stack:** HTML5, CSS3, plain text files

---

## Task 1: Create base HTML structure and shared CSS

**Files:**
- Create: `frontend/index.html`
- Create: `frontend/css/styles.css`

**Step 1: Create the landing page HTML**

```html
<!-- frontend/index.html -->
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Unslop - Filter Your LinkedIn Feed</title>
  <link rel="stylesheet" href="css/styles.css">
</head>
<body>
  <header>
    <nav class="container">
      <div class="logo">Unslop</div>
      <ul class="nav-links">
        <li><a href="/">Home</a></li>
        <li><a href="/privacy">Privacy</a></li>
        <li><a href="/support">Support</a></li>
      </ul>
    </nav>
  </header>

  <main>
    <section class="hero">
      <div class="container">
        <h1>Unslop</h1>
        <p class="tagline">Chrome extension that dims or hides low-value LinkedIn posts.</p>
        <a href="https://chrome.google.com/webstore" class="cta-button">Install on Chrome</a>
      </div>
    </section>

    <section class="features">
      <div class="container">
        <h2>How it works</h2>
        <div class="feature-grid">
          <div class="feature">
            <h3>1. Install</h3>
            <p>Add the extension to Chrome</p>
          </div>
          <div class="feature">
            <h3>2. Browse</h3>
            <p>Scroll through LinkedIn normally</p>
          </div>
          <div class="feature">
            <h3>3. Filter</h3>
            <p>Low-value posts are dimmed or hidden</p>
          </div>
        </div>
      </div>
    </section>
  </main>

  <footer>
    <div class="container">
      <p>&copy; 2025 Unslop. <a href="/privacy">Privacy Policy</a> · <a href="/support">Support</a></p>
    </div>
  </footer>
</body>
</html>
```

**Step 2: Create the shared CSS file**

```css
/* frontend/css/styles.css */
:root {
  --primary: #0077b5;
  --primary-dark: #005885;
  --text: #333;
  --text-light: #666;
  --bg: #ffffff;
  --bg-alt: #f5f5f5;
  --border: #ddd;
}

* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
  line-height: 1.6;
  color: var(--text);
  background: var(--bg);
}

.container {
  max-width: 900px;
  margin: 0 auto;
  padding: 0 20px;
}

/* Header */
header {
  background: var(--bg);
  border-bottom: 1px solid var(--border);
  padding: 1rem 0;
}

nav {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.logo {
  font-size: 1.5rem;
  font-weight: 700;
  color: var(--primary);
}

.nav-links {
  display: flex;
  list-style: none;
  gap: 1.5rem;
}

.nav-links a {
  color: var(--text);
  text-decoration: none;
}

.nav-links a:hover {
  color: var(--primary);
}

/* Hero Section */
.hero {
  padding: 4rem 0;
  text-align: center;
}

.hero h1 {
  font-size: 3rem;
  margin-bottom: 0.5rem;
  color: var(--primary);
}

.tagline {
  font-size: 1.25rem;
  color: var(--text-light);
  margin-bottom: 2rem;
}

.cta-button {
  display: inline-block;
  background: var(--primary);
  color: white;
  padding: 0.75rem 2rem;
  border-radius: 6px;
  text-decoration: none;
  font-weight: 600;
  transition: background 0.2s;
}

.cta-button:hover {
  background: var(--primary-dark);
}

/* Features Section */
.features {
  padding: 3rem 0;
  background: var(--bg-alt);
}

.features h2 {
  text-align: center;
  margin-bottom: 2rem;
}

.feature-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 2rem;
}

.feature {
  text-align: center;
  padding: 1.5rem;
  background: white;
  border-radius: 8px;
}

.feature h3 {
  margin-bottom: 0.5rem;
  color: var(--primary);
}

/* Footer */
footer {
  padding: 2rem 0;
  text-align: center;
  color: var(--text-light);
  border-top: 1px solid var(--border);
}

footer a {
  color: var(--text-light);
  text-decoration: none;
}

footer a:hover {
  color: var(--primary);
}

/* Responsive */
@media (max-width: 600px) {
  .hero h1 {
    font-size: 2rem;
  }

  .nav-links {
    gap: 1rem;
    font-size: 0.9rem;
  }
}
```

**Step 3: Verify files exist**

Run: `ls -la frontend/index.html frontend/css/styles.css`
Expected: Both files listed

**Step 4: Commit**

```bash
git add frontend/index.html frontend/css/styles.css
git commit -m "feat: add landing page with base styles"
```

---

## Task 2: Create Privacy Policy page

**Files:**
- Create: `frontend/privacy.html`

**Step 1: Write the privacy policy HTML**

```html
<!-- frontend/privacy.html -->
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Privacy Policy - Unslop</title>
  <link rel="stylesheet" href="css/styles.css">
  <link rel="stylesheet" href="css/legal.css">
</head>
<body>
  <header>
    <nav class="container">
      <div class="logo"><a href="/">Unslop</a></div>
      <ul class="nav-links">
        <li><a href="/">Home</a></li>
        <li><a href="/privacy">Privacy</a></li>
        <li><a href="/support">Support</a></li>
      </ul>
    </nav>
  </header>

  <main class="legal">
    <div class="container">
      <h1>Privacy Policy</h1>
      <p class="updated">Last updated: February 2025</p>

      <section>
        <h2>Data we collect</h2>

        <h3>Account data</h3>
        <ul>
          <li><strong>Email address</strong> — for magic-link login authentication</li>
        </ul>

        <h3>Content for classification</h3>
        <p>When you use the extension, we process LinkedIn posts to classify them:</p>
        <ul>
          <li><code>post_id</code> — LinkedIn post identifier (or derived hash)</li>
          <li><code>author_id</code> — Author's profile identifier</li>
          <li><code>author_name</code> — Author's display name (best-effort)</li>
          <li><code>content_text</code> — Post content, normalized and truncated to 4,000 characters</li>
          <li><code>decision</code> — The classification result (keep/dim/hide)</li>
          <li><code>timestamps</code> — When the post was processed</li>
        </ul>

        <h3>Feedback (optional)</h3>
        <p>If you choose to submit feedback on a classification:</p>
        <ul>
          <li><code>post_id</code> — Which post the feedback is about</li>
          <li><code>rendered_decision</code> — What action the extension took</li>
          <li><code>user_label</code> — Your feedback (should_keep/should_hide)</li>
        </ul>
      </section>

      <section>
        <h2>Why we collect this data</h2>
        <ul>
          <li><strong>Provide filtering decisions</strong> — To determine which posts to dim or hide</li>
          <li><strong>Prevent duplicate LLM calls</strong> — Cached decisions reduce costs and improve speed</li>
          <li><strong>Enforce quotas</strong> — Track usage to provide free and paid tiers</li>
          <li><strong>Improve future versions</strong> — Feedback helps us refine the classifier (no model training in v0.1)</li>
        </ul>
      </section>

      <section>
        <h2>Where your data goes</h2>
        <p>We use the following third-party services:</p>
        <ul>
          <li><strong>LLM Inference Provider</strong> (e.g., OpenRouter) — Receives post content for classification</li>
          <li><strong>Backend Hosting</strong> (Railway) — Hosts our API</li>
          <li><strong>Database</strong> (Neon Postgres) — Stores cached decisions and user data</li>
          <li><strong>Billing</strong> (Polar) — Processes subscription payments</li>
        </ul>
      </section>

      <section>
        <h2>Data retention</h2>
        <ul>
          <li><strong>Posts</strong> — 90 days (after this, cached decisions expire)</li>
          <li><strong>Feedback</strong> — 180 days</li>
          <li><strong>User account</strong> — Until you request deletion</li>
        </ul>
      </section>

      <section>
        <h2>Data deletion</h2>
        <p>To request deletion of your account and associated data:</p>
        <p>Email <strong>support@getunslop.com</strong> from the email address associated with your account.</p>
        <p>We will process deletion requests within 7 days.</p>
      </section>

      <section>
        <h2>No tracking</h2>
        <p>We do not use:</p>
        <ul>
          <li>Cookies for analytics or tracking</li>
          <li>Third-party analytics services</li>
          <li>Tracking pixels or beacons</li>
        </ul>
      </section>
    </div>
  </main>

  <footer>
    <div class="container">
      <p>&copy; 2025 Unslop. <a href="/privacy">Privacy Policy</a> · <a href="/support">Support</a></p>
    </div>
  </footer>
</body>
</html>
```

**Step 2: Create legal-specific CSS**

```css
/* frontend/css/legal.css */
.legal {
  padding: 3rem 0;
}

.legal h1 {
  font-size: 2.5rem;
  margin-bottom: 0.5rem;
  color: var(--primary);
}

.legal .updated {
  color: var(--text-light);
  margin-bottom: 2rem;
}

.legal section {
  margin-bottom: 2rem;
}

.legal h2 {
  font-size: 1.5rem;
  margin-bottom: 1rem;
  color: var(--text);
}

.legal h3 {
  font-size: 1.2rem;
  margin: 1.5rem 0 0.5rem;
  color: var(--text);
}

.legal p {
  margin-bottom: 1rem;
}

.legal ul {
  margin-left: 1.5rem;
  margin-bottom: 1rem;
}

.legal li {
  margin-bottom: 0.5rem;
}

.legal code {
  background: var(--bg-alt);
  padding: 0.2rem 0.4rem;
  border-radius: 4px;
  font-size: 0.9em;
}

.legal strong {
  color: var(--text);
}

.logo a {
  color: var(--primary);
  text-decoration: none;
}
```

**Step 3: Verify files exist**

Run: `ls -la frontend/privacy.html frontend/css/legal.css`
Expected: Both files listed

**Step 4: Commit**

```bash
git add frontend/privacy.html frontend/css/legal.css
git commit -m "feat: add privacy policy page"
```

---

## Task 3: Create Support page

**Files:**
- Create: `frontend/support.html`

**Step 1: Write the support page HTML**

```html
<!-- frontend/support.html -->
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Support - Unslop</title>
  <link rel="stylesheet" href="css/styles.css">
  <link rel="stylesheet" href="css/legal.css">
</head>
<body>
  <header>
    <nav class="container">
      <div class="logo"><a href="/">Unslop</a></div>
      <ul class="nav-links">
        <li><a href="/">Home</a></li>
        <li><a href="/privacy">Privacy</a></li>
        <li><a href="/support">Support</a></li>
      </ul>
    </nav>
  </header>

  <main class="legal">
    <div class="container">
      <h1>Support</h1>

      <section>
        <h2>Contact us</h2>
        <p>For help, feedback, or questions:</p>
        <p><strong>Email: <a href="mailto:support@getunslop.com">support@getunslop.com</a></strong></p>
      </section>

      <section>
        <h2>Frequently Asked Questions</h2>

        <h3>How do I sign in?</h3>
        <p>Click the Unslop extension icon in Chrome, then click "Sign In". Enter your email address and we'll send a magic link. Click the link to sign in.</p>
        <p>The sign-in link expires in 15 minutes. If it expires, just request a new one.</p>

        <h3>Why was a post hidden or dimmed?</h3>
        <p>Unslop uses an AI to classify LinkedIn posts as "keep", "dim", or "hide" based on content quality. Posts that appear to be:</p>
        <ul>
          <li>Engagement bait ("Like if you agree!")</li>
          <li>Vague platitudes without substance</li>
          <li>Spam or scams</li>
        </ul>
        <p>may be dimmed or hidden. The AI isn't perfect—you can provide feedback to help us improve.</p>

        <h3>How do I provide feedback?</h3>
        <p>In the extension popup, click on a post that was dimmed or hidden and select whether it should have been kept or hidden. This helps us improve future classifications.</p>

        <h3>What are the usage limits?</h3>
        <p><strong>Free plan:</strong> 300 AI classifications per month (cached posts don't count)</p>
        <p><strong>Pro plan:</strong> 10,000 AI classifications per month</p>
        <p>When you exceed your limit, posts will be shown normally (not dimmed or hidden) until your quota resets.</p>

        <h3>How do I upgrade to Pro?</h3>
        <p>Click the extension popup, then click "Upgrade to Pro". You'll be taken to Polar checkout to complete your subscription (€3.99/month).</p>

        <h3>How do I cancel my Pro subscription?</h3>
        <p>You can cancel through Polar, or email <strong>support@getunslop.com</strong> and we can cancel it for you. Your account will revert to the Free plan at the end of your billing period.</p>

        <h3>How do I delete my account?</h3>
        <p>Email <strong>support@getunslop.com</strong> from your account email address with the subject "Account deletion". We'll delete your account and all associated data within 7 days.</p>

        <h3>The extension isn't working on LinkedIn</h3>
        <p>Make sure:</p>
        <ul>
          <li>You're on <strong>linkedin.com</strong> (not the mobile site)</li>
          <li>The extension is enabled in Chrome (click the puzzle icon)</li>
          <li>The toggle in the popup is set to "Enable filtering"</li>
        </ul>
        <p>If issues persist, email support with details about what you're seeing.</p>
      </section>
    </div>
  </main>

  <footer>
    <div class="container">
      <p>&copy; 2025 Unslop. <a href="/privacy">Privacy Policy</a> · <a href="/support">Support</a></p>
    </div>
  </footer>
</body>
</html>
```

**Step 2: Verify file exists**

Run: `ls -la frontend/support.html`
Expected: File listed

**Step 3: Commit**

```bash
git add frontend/support.html
git commit -m "feat: add support page with FAQ"
```

---

## Task 4: Create Terms page (optional but recommended)

**Files:**
- Create: `frontend/terms.html`

**Step 1: Write the terms page HTML**

```html
<!-- frontend/terms.html -->
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Terms of Service - Unslop</title>
  <link rel="stylesheet" href="css/styles.css">
  <link rel="stylesheet" href="css/legal.css">
</head>
<body>
  <header>
    <nav class="container">
      <div class="logo"><a href="/">Unslop</a></div>
      <ul class="nav-links">
        <li><a href="/">Home</a></li>
        <li><a href="/privacy">Privacy</a></li>
        <li><a href="/support">Support</a></li>
      </ul>
    </nav>
  </header>

  <main class="legal">
    <div class="container">
      <h1>Terms of Service</h1>
      <p class="updated">Last updated: February 2025</p>

      <section>
        <h2>1. Acceptance of Terms</h2>
        <p>By accessing or using the Unslop Chrome extension ("the Service"), you agree to be bound by these Terms of Service.</p>
      </section>

      <section>
        <h2>2. Description of Service</h2>
        <p>Unslop is a browser extension that filters LinkedIn feed posts by dimming or hiding content classified as low-value. The service is provided "as is" and may include advertisements or sponsored content in the future.</p>
      </section>

      <section>
        <h2>3. User Responsibilities</h2>
        <p>You agree to:</p>
        <ul>
          <li>Use the service only for its intended purpose</li>
          <li>Not attempt to circumvent usage limits or quotas</li>
          <li>Not use the service to violate LinkedIn's terms of service</li>
          <li>Be responsible for maintaining the security of your account</li>
        </ul>
      </section>

      <section>
        <h2>4. Payment and Billing</h2>
        <p>Pro subscriptions are processed through Polar. By subscribing, you agree to Polar's terms and billing practices. You may cancel your subscription at any time through Polar or by contacting support.</p>
      </section>

      <section>
        <h2>5. Disclaimer of Warranties</h2>
        <p>THE SERVICE IS PROVIDED "AS IS" WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND NONINFRINGEMENT.</p>
      </section>

      <section>
        <h2>6. Limitation of Liability</h2>
        <p>Unslop shall not be liable for any indirect, incidental, special, consequential, or punitive damages resulting from your use or inability to use the service.</p>
      </section>

      <section>
        <h2>7. Modifications</h2>
        <p>We reserve the right to modify these terms at any time. Continued use of the service after changes constitutes acceptance of the new terms.</p>
      </section>

      <section>
        <h2>8. Termination</h2>
        <p>We may terminate or suspend your account at any time for violation of these terms or for any other reason at our sole discretion.</p>
      </section>

      <section>
        <h2>9. Governing Law</h2>
        <p>These terms are governed by the laws of the jurisdiction in which Unslop is established.</p>
      </section>

      <section>
        <h2>10. Contact</h2>
        <p>Questions about these terms? Contact us at <a href="mailto:support@getunslop.com">support@getunslop.com</a></p>
      </section>
    </div>
  </main>

  <footer>
    <div class="container">
      <p>&copy; 2025 Unslop. <a href="/privacy">Privacy Policy</a> · <a href="/support">Support</a></p>
    </div>
  </footer>
</body>
</html>
```

**Step 2: Verify file exists**

Run: `ls -la frontend/terms.html`
Expected: File listed

**Step 3: Commit**

```bash
git add frontend/terms.html
git commit -m "feat: add terms of service page"
```

---

## Task 5: Update navigation to include Terms link

**Files:**
- Modify: `frontend/index.html`
- Modify: `frontend/privacy.html`
- Modify: `frontend/support.html`
- Modify: `frontend/terms.html`

**Step 1: Update navigation in all files to include Terms link**

Find the nav-links section in each file and update:

```html
<ul class="nav-links">
  <li><a href="/">Home</a></li>
  <li><a href="/privacy">Privacy</a></li>
  <li><a href="/support">Support</a></li>
  <li><a href="/terms">Terms</a></li>
</ul>
```

**Step 2: Verify all files updated**

Run: `grep -l "Terms" frontend/*.html`
Expected: index.html, privacy.html, support.html, terms.html

**Step 3: Commit**

```bash
git add frontend/*.html
git commit -m "feat: add Terms link to navigation"
```

---

## Task 6: Create README for deployment

**Files:**
- Create: `frontend/README.md`

**Step 1: Write deployment README**

```markdown
# Unslop Frontend

Static website for getunslop.com.

## Files

- `index.html` - Landing page
- `privacy.html` - Privacy Policy
- `support.html` - Support/FAQ
- `terms.html` - Terms of Service
- `css/styles.css` - Main stylesheet
- `css/legal.css` - Legal page stylesheet

## Deployment

### Requirements

- Static hosting with HTTPS
- Custom domain support (getunslop.com)
- No build step required

### Deployment Options

**Option 1: Cloudflare Pages**
1. Connect GitHub repository
2. Set build directory to `frontend/`
3. No build command needed
4. Add custom domain in settings

**Option 2: Netlify**
1. Connect repository or drag-drop `frontend/` folder
2. No build settings needed
3. Add custom domain

**Option 3: Vercel**
1. Import project
2. Set root directory to `frontend/`
3. No build command
4. Add domain

**Option 4: GitHub Pages**
1. Push to gh-pages branch or use docs folder
2. Enable in repository settings

### DNS Configuration

For apex domain (getunslop.com):
- A record: points to hosting provider's IP
- Or CNAME flattening service

For www subdomain:
- CNAME: points to hosting provider

### No Tracking

This site intentionally has:
- No analytics scripts
- No cookies
- No tracking pixels
- No JavaScript (except optional polyfills)

## Local Testing

Simply open `index.html` in a browser, or use:

```bash
cd frontend
python3 -m http.server 8000
# Visit http://localhost:8000
```
```

**Step 2: Verify file created**

Run: `cat frontend/README.md`
Expected: README content displayed

**Step 3: Commit**

```bash
git add frontend/README.md
git commit -m "docs: add deployment README for frontend"
```

---

## Task 7: Create favicon (optional but nice to have)

**Files:**
- Create: `frontend/favicon.ico`

**Step 1: Create simple SVG favicon**

Create `frontend/favicon.svg`:

```html
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <rect width="100" height="100" fill="#0077b5" rx="20"/>
  <text x="50" y="65" font-family="Arial, sans-serif" font-size="50" fill="white" text-anchor="middle">U</text>
</svg>
```

**Step 2: Add favicon link to all HTML pages**

Add to `<head>` section of all HTML files:

```html
<link rel="icon" type="image/svg+xml" href="favicon.svg">
```

**Step 3: Verify file exists**

Run: `ls -la frontend/favicon.svg`
Expected: File listed

**Step 4: Commit**

```bash
git add frontend/favicon.svg frontend/*.html
git commit -m "feat: add SVG favicon"
```

---

## Dependencies

- **None** - This is a completely independent static site

---

## What's NOT included

- No JavaScript framework (React, Vue, etc.)
- No build step (Webpack, Vite, etc.)
- No server-side rendering
- No CMS or dynamic content
- No analytics (Google Analytics, etc.)
- No A/B testing
- No feature flags
- No newsletter signup
- No blog

---

## Verification Checklist

After completing all tasks:

- [ ] All HTML pages validate (https://validator.w3.org/)
- [ ] All links work (no 404s)
- [ ] Site displays correctly on mobile
- [ ] Site displays correctly on desktop
- [ ] Privacy policy contains all required sections
- [ ] Support page contains all FAQ items
- [ ] No JavaScript errors in browser console
- [ ] All pages share consistent navigation
- [ ] Footer links work on all pages
