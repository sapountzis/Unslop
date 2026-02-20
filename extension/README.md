# Unslop Extension (Chrome MV3)

Filters LinkedIn, X, and Reddit feeds: detect → classify → apply `keep|hide`. Fail open on errors.

## Quick Start

```bash
bun install
bun run build
```

Load `extension/dist` in Chrome via **Load unpacked** (`chrome://extensions`).

## Commands

- `bun run dev` — watch build
- `bun test` — run tests
- `bun run build` — production build

## Architecture

See **`AGENTS.md`** for architecture, flows, entry points, and module roles.
