# Chrome Extension Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build Chrome Extension that filters LinkedIn feed based on backend decisions.

**Architecture:** Content script detects posts, background handles API calls, popup manages auth state.

**Tech Stack:** Chrome Extension Manifest V3, TypeScript, Vite

---

## Task 1: Initialize extension project structure

**Files:**
- Create: `extension/package.json`
- Create: `extension/tsconfig.json`
- Create: `extension/vite.config.ts`
- Create: `extension/index.html`
- Create: `extension/manifest.json`

**Step 1: Create package.json**

```json
{
  "name": "unslop-extension",
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "@crxjs/vite-plugin": "^2.0.0-beta.23"
  },
  "devDependencies": {
    "@types/chrome": "^0.0.254",
    "typescript": "^5.9.0",
    "vite": "^5.0.0"
  }
}
```

**Step 2: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "lib": ["ES2020", "DOM"],
    "moduleResolution": "bundler",
    "strict": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "types": ["chrome", "node"]
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules"]
}
```

**Step 3: Create vite.config.ts**

```typescript
import { defineConfig } from 'vite';
import { crx } from '@crxjs/vite-plugin';
import manifest from './manifest.json';

export default defineConfig({
  plugins: [
    crx({ manifest }),
  ],
  build: {
    rollupOptions: {
      input: {
        popup: 'index.html',
        background: 'src/background/index.ts',
        'content-linkedin': 'src/content/linkedin.ts',
        'content-auth': 'src/content/auth.ts',
      },
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: '[name].js',
        assetFileNames: '[name].[ext]',
      },
    },
  },
});
```

**Step 4: Create manifest.json**

```json
{
  "manifest_version": 3,
  "name": "Unslop",
  "version": "0.1.0",
  "description": "Filter your LinkedIn feed",
  "permissions": [
    "storage",
    "activeTab"
  ],
  "host_permissions": [
    "https://www.linkedin.com/*",
    "https://api.getunslop.com/*"
  ],
  "background": {
    "service_worker": "src/background/index.ts",
    "type": "module"
  },
  "content_scripts": [
    {
      "matches": ["https://www.linkedin.com/*"],
      "js": ["src/content/linkedin.ts"],
      "run_at": "document_idle"
    },
    {
      "matches": ["https://api.getunslop.com/*"],
      "js": ["src/content/auth.ts"],
      "run_at": "document_idle"
    }
  ],
  "action": {
    "default_popup": "index.html",
    "default_icon": {
      "16": "icons/icon16.png",
      "48": "icons/icon48.png",
      "128": "icons/icon128.png"
    }
  },
  "icons": {
    "16": "icons/icon16.png",
    "48": "icons/icon48.png",
    "128": "icons/icon128.png"
  }
}
```

**Step 5: Create placeholder icons**

Run: `mkdir -p extension/icons && cd extension/icons && convert -size 16x16 xc:white -fill black -draw "circle 8,8 8,0" icon16.png` (or create simple SVG icons)

For now, create simple placeholder:
```bash
mkdir -p extension/icons
echo "iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAFklEQVQ4T2nk5+f/w8AIowAXAC0A8Y6Xk3sAAAAASUVORK5CYII=" | base64 -d > extension/icons/icon16.png
# Repeat for 48 and 128 (use proper images in production)
```

**Step 6: Create basic index.html**

```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Unslop</title>
  <style>
    body {
      width: 300px;
      padding: 16px;
      font-family: system-ui;
    }
  </style>
</head>
<body>
  <div id="app"></div>
  <script type="module" src="./src/popup/index.ts"></script>
</body>
</html>
```

**Step 7: Install dependencies**

Run: `cd extension && bun install`

**Step 8: Commit**

```bash
git add extension/
git commit -m "feat: initialize extension project structure"
```

---

## Task 2: Create shared types and utilities

**Files:**
- Create: `extension/src/types.ts`
- Create: `extension/src/lib/storage.ts`
- Create: `extension/src/lib/hash.ts`

**Step 1: Create shared types**

```typescript
// extension/src/types.ts
export type Decision = 'keep' | 'dim' | 'hide';
export type Source = 'llm' | 'cache' | 'error';
export type UserLabel = 'should_keep' | 'should_hide';

export interface Storage {
  jwt?: string;
  enabled: boolean;
}

export interface PostData {
  post_id: string;
  author_id: string;
  author_name: string;
  content_text: string;
}

export interface ClassifyRequest {
  post: PostData;
}

export interface ClassifyResponse {
  post_id: string;
  decision: Decision;
  source: Source;
}

export interface UserInfo {
  user_id: string;
  email: string;
  plan: 'free' | 'pro';
  plan_status: 'active' | 'inactive';
}

export interface FeedbackRequest {
  post_id: string;
  rendered_decision: Decision;
  user_label: UserLabel;
}
```

**Step 2: Create storage utilities**

```typescript
// extension/src/lib/storage.ts
import type { Storage } from '../types';

const DEFAULT_STORAGE: Partial<Storage> = {
  enabled: true,
};

export async function getStorage(): Promise<Storage> {
  const result = await chrome.storage.sync.get(DEFAULT_STORAGE);
  return result as Storage;
}

export async function setStorage(values: Partial<Storage>): Promise<void> {
  await chrome.storage.sync.set(values);
}

export async function getJwt(): Promise<string | undefined> {
  const storage = await getStorage();
  return storage.jwt;
}

export async function setJwt(jwt: string): Promise<void> {
  await setStorage({ jwt });
}

export async function clearJwt(): Promise<void> {
  await chrome.storage.sync.remove('jwt');
}

export async function isEnabled(): Promise<boolean> {
  const storage = await getStorage();
  return storage.enabled !== false;
}
```

**Step 3: Create hash utilities**

```typescript
// extension/src/lib/hash.ts
import crypto from 'crypto';

/**
 * Normalize content text (matches backend)
 */
export function normalizeContentText(text: string): string {
  return text
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 4000);
}

/**
 * Generate SHA-256 hash (hex string)
 */
export function sha256(text: string): string {
  return crypto.createHash('sha256').update(text, 'utf-8').digest('hex');
}

/**
 * Derive post_id from author_id and content_text
 */
export function derivePostId(authorId: string, contentText: string): string {
  const combined = `${authorId}\n${contentText}`;
  return sha256(combined);
}
```

**Step 4: Run type check**

Run: `cd extension && bun run tsc --noEmit`
Expected: No errors

**Step 5: Commit**

```bash
git add extension/src/types.ts extension/src/lib/storage.ts extension/src/lib/hash.ts
git commit -m "feat: add shared types and utilities"
```

---

## Task 3: Create background service worker

**Files:**
- Create: `extension/src/background/index.ts`
- Create: `extension/src/background/api.ts`

**Step 1: Create API client**

```typescript
// extension/src/background/api.ts
import type {
  ClassifyRequest,
  ClassifyResponse,
  FeedbackRequest,
  UserInfo,
} from '../types';

const API_BASE = 'https://api.getunslop.com/v1';

export async function classifyPost(
  request: ClassifyRequest,
  jwt: string
): Promise<ClassifyResponse> {
  const response = await fetch(`${API_BASE}/classify`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${jwt}`,
    },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    if (response.status === 401) {
      // Clear invalid token
      await chrome.storage.sync.remove('jwt');
      // Notify popup
      chrome.runtime.sendMessage({ type: 'AUTH_REQUIRED' });
    }
    // Fail open - return keep
    return {
      post_id: request.post.post_id,
      decision: 'keep',
      source: 'error',
    };
  }

  return response.json();
}

export async function sendFeedback(
  request: FeedbackRequest,
  jwt: string
): Promise<void> {
  const response = await fetch(`${API_BASE}/feedback`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${jwt}`,
    },
    body: JSON.stringify(request),
  });

  // Ignore errors - feedback is optional
}

export async function getUserInfo(jwt: string): Promise<UserInfo | null> {
  const response = await fetch(`${API_BASE}/me`, {
    headers: {
      'Authorization': `Bearer ${jwt}`,
    },
  });

  if (!response.ok) {
    return null;
  }

  return response.json();
}

export async function createCheckout(jwt: string): Promise<string | null> {
  const response = await fetch(`${API_BASE}/billing/create-checkout`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${jwt}`,
    },
    body: JSON.stringify({ plan: 'pro-monthly' }),
  });

  if (!response.ok) {
    return null;
  }

  const data = await response.json();
  return data.checkout_url;
}

export async function startAuthFlow(email: string): Promise<void> {
  const response = await fetch(`${API_BASE}/auth/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });

  // 202 means email was sent
  if (response.status !== 202) {
    throw new Error('Failed to start auth flow');
  }
}
```

**Step 2: Create background service worker**

```typescript
// extension/src/background/index.ts
import { classifyPost, sendFeedback } from './api';
import type { ClassifyRequest, FeedbackRequest, PostData } from '../types';

// Handle messages from content scripts and popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  async function handleMessage() {
    const { type } = message;

    switch (type) {
      case 'CLASSIFY_POST': {
        const storage = await chrome.storage.sync.get(['jwt', 'enabled']);

        if (!storage.jwt || storage.enabled === false) {
          sendResponse({
            post_id: message.post.post_id,
            decision: 'keep',
            source: 'error' as const,
          });
          return;
        }

        try {
          const result = await classifyPost(message as ClassifyRequest, storage.jwt);
          sendResponse(result);
        } catch (err) {
          sendResponse({
            post_id: message.post.post_id,
            decision: 'keep',
            source: 'error' as const,
          });
        }
        break;
      }

      case 'SEND_FEEDBACK': {
        const storage = await chrome.storage.sync.get('jwt');

        if (storage.jwt) {
          await sendFeedback(message as FeedbackRequest, storage.jwt);
        }

        sendResponse({ status: 'ok' });
        break;
      }

      case 'GET_USER_INFO': {
        const storage = await chrome.storage.sync.get('jwt');

        if (storage.jwt) {
          const { getUserInfo } = await import('./api');
          const userInfo = await getUserInfo(storage.jwt);
          sendResponse(userInfo);
        } else {
          sendResponse(null);
        }
        break;
      }

      case 'CREATE_CHECKOUT': {
        const storage = await chrome.storage.sync.get('jwt');

        if (storage.jwt) {
          const { createCheckout } = await import('./api');
          const url = await createCheckout(storage.jwt);
          sendResponse({ checkout_url: url });
        } else {
          sendResponse({ checkout_url: null });
        }
        break;
      }

      case 'START_AUTH': {
        const { startAuthFlow } = await import('./api');
        await startAuthFlow(message.email);
        sendResponse({ status: 'ok' });
        break;
      }

      case 'SET_JWT': {
        await chrome.storage.sync.set({ jwt: message.jwt });
        sendResponse({ status: 'ok' });
        break;
      }

      case 'CLEAR_JWT': {
        await chrome.storage.sync.remove('jwt');
        sendResponse({ status: 'ok' });
        break;
      }

      case 'TOGGLE_ENABLED': {
        const current = await chrome.storage.sync.get('enabled');
        const newValue = current.enabled === false ? true : false;
        await chrome.storage.sync.set({ enabled: newValue });
        sendResponse({ enabled: newValue });
        break;
      }

      default:
        sendResponse({ error: 'Unknown message type' });
    }
  }

  // Return true for async response
  handleMessage().catch(console.error);
  return true;
});

// Listen for messages from auth callback page
chrome.runtime.onMessageExternal.addListener(
  (message, sender, sendResponse) => {
    if (sender.origin !== 'https://api.getunslop.com') {
      return;
    }

    if (message.type === 'UNSLOP_AUTH_SUCCESS') {
      chrome.storage.sync.set({ jwt: message.token });
      sendResponse({ status: 'ok' });
    }
  }
);
```

**Step 3: Run type check**

Run: `cd extension && bun run tsc --noEmit`
Expected: No errors

**Step 4: Commit**

```bash
git add extension/src/background/
git commit -m "feat: implement background service worker"
```

---

## Task 4: Create LinkedIn content script

**Files:**
- Create: `extension/src/content/linkedin.ts`
- Create: `extension/src/content/linkedin-parser.ts`

**Step 1: Create LinkedIn post parser**

```typescript
// extension/src/content/linkedin-parser.ts
import { normalizeContentText, derivePostId } from '../lib/hash';
import type { PostData } from '../types';

/**
 * Check if an element is a LinkedIn feed post
 */
function isFeedPost(element: HTMLElement): boolean {
  // LinkedIn feed posts typically have specific data attributes or class names
  // This is a simplified check - adjust based on actual DOM structure
  return (
    element.hasAttribute('data-urn') ||
    element.classList.contains('feed-shared-update-v2') ||
    element.querySelector('[data-urn]') !== null
  );
}

/**
 * Extract post data from a LinkedIn post element
 */
export function extractPostData(element: HTMLElement): PostData | null {
  if (!isFeedPost(element)) {
    return null;
  }

  // Try to get post ID from data-urn attribute
  const urnElement = element.querySelector('[data-urn]') || element;
  const postId = urnElement.getAttribute('data-urn');

  // Extract author info
  const authorLink = element.querySelector('a[href*="/in/"], a[href*="/company/"]');
  const authorId = authorLink?.getAttribute('href') || 'unknown';

  const authorNameElement = element.querySelector(
    '[data-anonymize="person-name"], .feed-shared-author__name'
  );
  const authorName = authorNameElement?.textContent?.trim() || 'Unknown';

  // Extract post content
  const contentElement = element.querySelector(
    '.feed-shared-text, .feed-shared-update-v2__description, [data-anonymize="text"]'
  );
  const contentText = normalizeContentText(
    contentElement?.textContent || ''
  );

  // Derive post_id if we don't have a native one
  const finalPostId = postId || derivePostId(authorId, contentText);

  return {
    post_id: finalPostId,
    author_id: authorId,
    author_name: authorName,
    content_text: contentText,
  };
}

/**
 * Apply a decision to a post element
 */
export function applyDecision(
  element: HTMLElement,
  decision: 'keep' | 'dim' | 'hide'
): void {
  // Mark element to avoid reprocessing
  if (element.hasAttribute('data-unslop-processed')) {
    return;
  }

  element.setAttribute('data-unslop-processed', 'true');

  switch (decision) {
    case 'keep':
      // No changes
      break;

    case 'dim':
      element.style.opacity = '0.35';
      element.setAttribute('data-unslop-decision', 'dim');

      // Optional: add small label
      const label = document.createElement('span');
      label.textContent = 'Unslop: dimmed';
      label.style.cssText = 'font-size: 10px; color: #666; display: block;';
      element.insertBefore(label, element.firstChild);
      break;

    case 'hide':
      // Replace with stub
      const stub = document.createElement('div');
      stub.textContent = 'Unslop hid a post · Show';
      stub.style.cssText = 'padding: 8px; color: #666; cursor: pointer; font-size: 12px;';

      stub.addEventListener('click', () => {
        stub.replaceWith(element);
        element.removeAttribute('data-unslop-processed');
      });

      element.replaceWith(stub);
      break;
  }
}
```

**Step 2: Create LinkedIn content script**

```typescript
// extension/src/content/linkedin.ts
import { extractPostData, applyDecision } from './linkedin-parser';
import type { PostData } from '../types';

// Track posts we've already classified
const processedPosts = new Set<string>();

/**
 * Classify a single post
 */
async function classifyPost(postData: PostData): Promise<'keep' | 'dim' | 'hide'> {
  try {
    const response = await chrome.runtime.sendMessage({
      type: 'CLASSIFY_POST',
      post: postData,
    });

    return response.decision || 'keep';
  } catch (err) {
    console.error('Classification failed:', err);
    return 'keep';
  }
}

/**
 * Process a post element
 */
async function processPost(element: HTMLElement): Promise<void> {
  const postData = extractPostData(element);

  if (!postData) {
    return;
  }

  // Skip if already processed
  if (processedPosts.has(postData.post_id)) {
    return;
  }

  processedPosts.add(postData.post_id);

  // Check if extension is enabled
  const storage = await chrome.storage.sync.get('enabled');
  if (storage.enabled === false) {
    return;
  }

  // Get classification
  const decision = await classifyPost(postData);

  // Apply decision
  applyDecision(element, decision);
}

/**
 * Scan the document for new posts
 */
function scanForPosts(): void {
  // Find potential post elements
  const postElements = document.querySelectorAll(
    '[data-urn], .feed-shared-update-v2'
  );

  postElements.forEach((element) => {
    if (element instanceof HTMLElement) {
      processPost(element);
    }
  });
}

// Set up MutationObserver to detect new posts
const observer = new MutationObserver((mutations) => {
  for (const mutation of mutations) {
    for (const node of mutation.addedNodes) {
      if (node instanceof HTMLElement) {
        // Check if this node or its children are posts
        const posts = node.matches('[data-urn], .feed-shared-update-v2')
          ? [node]
          : Array.from(node.querySelectorAll('[data-urn], .feed-shared-update-v2'));

        posts.forEach((post) => {
          if (post instanceof HTMLElement) {
            processPost(post);
          }
        });
      }
    }
  }
});

// Start observing
function startObserving(): void {
  const feedContainer = document.querySelector(
    '.scaffold-finite-scroll__content, .feed-shared-update-v2__container, main'
  );

  if (feedContainer) {
    observer.observe(feedContainer, {
      childList: true,
      subtree: true,
    });
  }

  // Initial scan
  scanForPosts();
}

// Wait for page to be ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', startObserving);
} else {
  startObserving();
}

// Re-scan periodically (fallback)
setInterval(scanForPosts, 5000);
```

**Step 3: Run type check**

Run: `cd extension && bun run tsc --noEmit`
Expected: No errors

**Step 4: Commit**

```bash
git add extension/src/content/linkedin.ts extension/src/content/linkedin-parser.ts
git commit -m "feat: implement LinkedIn content script"
```

---

## Task 5: Create auth callback content script

**Files:**
- Create: `extension/src/content/auth.ts`

**Step 1: Write auth callback script**

```typescript
// extension/src/content/auth.ts
// This script runs on https://api.getunslop.com/*
// It extracts the JWT from the auth callback page

function extractJwtFromPage(): string | null {
  // Check for meta tag with JWT
  const metaTag = document.querySelector('meta[name="unslop-jwt"]');

  if (metaTag instanceof HTMLMetaElement) {
    return metaTag.content;
  }

  return null;
}

function sendJwtToBackground(jwt: string): void {
  chrome.runtime.sendMessage({
    type: 'SET_JWT',
    jwt,
  });
}

// Try to extract JWT on page load
const jwt = extractJwtFromPage();

if (jwt) {
  sendJwtToBackground(jwt);

  // Show success message
  document.body.innerHTML = `
    <div style="display: flex; align-items: center; justify-content: center; height: 100vh; font-family: system-ui;">
      <div style="text-align: center;">
        <h1>✓ Sign in successful</h1>
        <p>You can close this tab and return to LinkedIn.</p>
      </div>
    </div>
  `;
}
```

**Step 2: Run type check**

Run: `cd extension && bun run tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add extension/src/content/auth.ts
git commit -m "feat: add auth callback content script"
```

---

## Task 6: Create popup UI

**Files:**
- Create: `extension/src/popup/index.ts`
- Create: `extension/src/popup/App.ts`

**Step 1: Create popup app**

```typescript
// extension/src/popup/App.ts
import type { UserInfo } from '../types';

export class App {
  private container: HTMLElement;

  constructor(containerId: string) {
    const container = document.getElementById(containerId);
    if (!container) {
      throw new Error(`Container ${containerId} not found`);
    }
    this.container = container;
  }

  async render(): Promise<void> {
    const storage = await chrome.storage.sync.get(['jwt', 'enabled']);

    if (!storage.jwt) {
      this.renderSignIn();
    } else {
      const userInfo = await this.getUserInfo();
      if (userInfo) {
        this.renderDashboard(userInfo, storage.enabled);
      } else {
        this.renderSignIn();
      }
    }
  }

  private async getUserInfo(): Promise<UserInfo | null> {
    try {
      const response = await chrome.runtime.sendMessage({ type: 'GET_USER_INFO' });
      return response;
    } catch {
      return null;
    }
  }

  private renderSignIn(): void {
    this.container.innerHTML = `
      <div style="text-align: center;">
        <h2 style="margin: 0 0 16px;">Unslop</h2>
        <p style="color: #666; font-size: 14px; margin-bottom: 16px;">
          Sign in to filter your LinkedIn feed
        </p>
        <form id="signin-form" style="display: flex; flex-direction: column; gap: 8px;">
          <input
            type="email"
            id="email-input"
            placeholder="your@email.com"
            required
            style="padding: 8px; border: 1px solid #ccc; border-radius: 4px; font-size: 14px;"
          />
          <button
            type="submit"
            style="padding: 8px 16px; background: #0077b5; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 14px;"
          >
            Send Sign In Link
          </button>
        </form>
        <p id="status" style="font-size: 12px; color: #666; margin-top: 8px;"></p>
      </div>
    `;

    const form = this.container.querySelector('#signin-form');
    const emailInput = this.container.querySelector('#email-input') as HTMLInputElement;
    const status = this.container.querySelector('#status')!;

    form?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = emailInput.value;

      status.textContent = 'Sending...';

      try {
        await chrome.runtime.sendMessage({
          type: 'START_AUTH',
          email,
        });

        status.textContent = 'Check your email for a sign-in link.';
        emailInput.value = '';
      } catch (err) {
        status.textContent = 'Failed to send email. Please try again.';
      }
    });
  }

  private renderDashboard(userInfo: UserInfo, enabled: boolean): void {
    const isPro = userInfo.plan === 'pro' && userInfo.plan_status === 'active';

    this.container.innerHTML = `
      <div>
        <h2 style="margin: 0 0 16px;">Unslop</h2>

        <div style="margin-bottom: 16px;">
          <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
            <input type="checkbox" id="enabled-toggle" ${enabled ? 'checked' : ''} />
            <span>Enable filtering</span>
          </label>
        </div>

        <div style="padding: 8px; background: #f5f5f5; border-radius: 4px; font-size: 13px; margin-bottom: 16px;">
          <div><strong>Email:</strong> ${userInfo.email}</div>
          <div><strong>Plan:</strong> ${isPro ? 'Pro' : 'Free'}</div>
        </div>

        ${!isPro ? `
          <button id="upgrade-btn" style="width: 100%; padding: 8px; background: #0077b5; color: white; border: none; border-radius: 4px; cursor: pointer;">
            Upgrade to Pro (€3.99/mo)
          </button>
        ` : ''}

        <button id="signout-btn" style="width: 100%; padding: 8px; margin-top: 8px; background: transparent; color: #666; border: 1px solid #ccc; border-radius: 4px; cursor: pointer; font-size: 13px;">
          Sign Out
        </button>
      </div>
    `;

    // Event listeners
    const enabledToggle = this.container.querySelector('#enabled-toggle') as HTMLInputElement;
    enabledToggle?.addEventListener('change', async () => {
      const response = await chrome.runtime.sendMessage({ type: 'TOGGLE_ENABLED' });
      enabledToggle.checked = response.enabled;
    });

    const upgradeBtn = this.container.querySelector('#upgrade-btn');
    upgradeBtn?.addEventListener('click', async () => {
      const response = await chrome.runtime.sendMessage({ type: 'CREATE_CHECKOUT' });
      if (response.checkout_url) {
        chrome.tabs.create({ url: response.checkout_url });
      }
    });

    const signoutBtn = this.container.querySelector('#signout-btn');
    signoutBtn?.addEventListener('click', async () => {
      await chrome.runtime.sendMessage({ type: 'CLEAR_JWT' });
      this.render();
    });
  }
}
```

**Step 2: Create entry point**

```typescript
// extension/src/popup/index.ts
import { App } from './App';

const app = new App('app');
app.render();
```

**Step 3: Update index.html with styles**

```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Unslop</title>
  <style>
    body {
      width: 300px;
      padding: 16px;
      margin: 0;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    }
    * {
      box-sizing: border-box;
    }
    button:hover {
      opacity: 0.9;
    }
  </style>
</head>
<body>
  <div id="app"></div>
  <script type="module" src="./src/popup/index.ts"></script>
</body>
</html>
```

**Step 4: Run type check**

Run: `cd extension && bun run tsc --noEmit`
Expected: No errors

**Step 5: Commit**

```bash
git add extension/src/popup/ extension/index.html
git commit -m "feat: implement popup UI"
```

---

## Task 7: Build and test extension

**Files:**
- None (build output)

**Step 1: Build extension**

Run: `cd extension && bun run build`
Expected: `dist/` directory created with all files

**Step 2: Load extension in Chrome**

1. Open `chrome://extensions/`
2. Enable "Developer mode"
3. Click "Load unpacked"
4. Select `extension/dist` directory

**Step 3: Test on LinkedIn**

1. Navigate to `https://www.linkedin.com/feed/`
2. Open popup, sign in
3. Verify posts are being processed (check console logs)
4. Verify dim/hide decisions are applied

**Step 4: Create README for extension**

```markdown
# Unslop Chrome Extension

## Development

```bash
bun install
bun run dev  # Watch mode
bun run build  # Production build
```

## Loading in Chrome

1. Run `bun run build`
2. Go to `chrome://extensions/`
3. Enable Developer Mode
4. Click "Load unpacked"
5. Select `extension/dist`

## Testing

1. Load extension
2. Sign in via popup
3. Visit LinkedIn feed
4. Observe console for classification activity
```

**Step 5: Commit**

```bash
git add extension/README.md
git commit -m "docs: add extension README"
```

---

## Dependencies

- **Requires:** Backend API running (auth, classify endpoints)

---

## What's NOT included

- No options page (all settings in popup)
- No keyboard shortcuts
- No per-site controls
- No analytics/telemetry
- No feedback UI in the feed (popup only)
