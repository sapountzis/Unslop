# AGENTS.md – Chrome Extension

You are working in the **Chrome extension** that filters social media feeds (LinkedIn, X/Twitter, Reddit).

## Plugin Architecture

The extension uses a **platform plugin system** to support multiple social media platforms. All platform-specific logic (DOM selectors, post parsing, route detection, surface resolution) is encapsulated in plugins.

- **Core runtime**: `src/content/runtime.ts` — platform-agnostic engine, parameterized by a `PlatformPlugin`.
- **Platform interface**: `src/platforms/platform.ts` — defines the `PlatformPlugin` contract.
- **Platform plugins**: `src/platforms/{linkedin,x,reddit}/` — each contains:
  - `plugin.ts` — wires together all platform-specific modules into a `PlatformPlugin`.
  - `selectors.ts` — platform-specific DOM selectors.
  - `parser.ts` — post data extraction and identity reading.
  - `surface.ts` — post surface resolution (content root, render root, label root → identity).
  - `route-detector.ts` — route eligibility and key extraction.
  - `index.ts` — entry point: imports `createPlatformRuntime` and the plugin, calls it.

## Minimal behavior

- Content script observes platform feed, extracts post text + ids.
- Background service worker calls backend `/v1/classify`.
- Content script applies `decision ∈ {keep, hide}`.
- Popup offers:
  - enabled toggle
  - sign-in status / sign-in action
  - upgrade button (when authenticated)
- Feedback is in-scope: user can mark a decision wrong (stored by backend).

Refer to:
- `../spec/extension.md`
- `../spec/api.md`
- `../spec/spec.md`
- `./docs/constitution.md` (binding extension constitution)

## Setup & dev commands

From `extension/`:

- `bun install`
- `bun run dev`
- `bun run build`
- `bun test src/` — runs all tests (platforms, content, lib)
- `bun test src/platforms/` — runs platform plugin tests only

## UX constraints

- **Fail open**:
  - If classify fails, do not break the platform. Leave post as-is.
- Keep UI minimal:
  - No "aggressiveness sliders", category controls, or per-author rules.

## Adding a new platform

1. Create `src/platforms/<platform>/` with: `selectors.ts`, `parser.ts`, `surface.ts`, `route-detector.ts`, `plugin.ts`, `index.ts`.
2. Implement the `PlatformPlugin` interface from `src/platforms/platform.ts`.
3. Add content script entry + host permissions in `manifest.json`.
4. Add the origin to the backend CORS allowlist in `backend/src/app/create-app.ts`.
5. Add tests for all modules: route-detector, parser, selectors.
6. Run `bun test src/platforms/plugin-compliance.test.ts` to verify contract compliance.

## Documentation Discipline

- `extension/README.md` is a required living technical guide for the extension.
- Any change to extension behavior, architecture, lifecycle, message contracts, selectors, configuration, or troubleshooting flow must update `extension/README.md` in the same change.
- Do not ship extension changes with stale README content.

## Prohibited

- Platform-specific logic outside `src/platforms/<platform>/`.
- `instanceof HTMLElement` in parsers (use duck-type checks for bun test compatibility).
- Importing platform selectors from `src/lib/selectors.ts` (that file only contains shared ATTRIBUTES and auth selectors).
