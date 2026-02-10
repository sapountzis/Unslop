# AGENTS.md – Chrome Extension

You are working in the **Chrome extension** that filters the LinkedIn feed.

Minimal behavior:

- Content script observes LinkedIn feed, extracts post text + ids.
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

## UX constraints

- **Fail open**:
  - If classify fails, do not break LinkedIn. Leave post as-is.
- Keep UI minimal:
  - No “aggressiveness sliders”, category controls, or per-author rules.

## Documentation Discipline

- `extension/README.md` is a required living technical guide for the extension.
- Any change to extension behavior, architecture, lifecycle, message contracts, selectors, configuration, or troubleshooting flow must update `extension/README.md` in the same change.
- Do not ship extension changes with stale README content.
