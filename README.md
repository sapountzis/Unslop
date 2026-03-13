<div align="center">

<svg width="64" height="64" viewBox="0 0 128 128" fill="none" xmlns="http://www.w3.org/2000/svg">
  <path d="M36 28V68C36 85.6731 50.3269 100 68 100C85.6731 100 100 85.6731 100 68V28"
        stroke="#1A1A1A" stroke-width="12" stroke-linecap="square"/>
  <circle cx="68" cy="62" r="14" fill="#4A6C48"/>
</svg>

# Unslop

**A browser extension that filters AI-generated content from your social feeds.**
Runs entirely in your browser. Bring your own API key. No account, no backend, no telemetry.

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

</div>

---

Unslop classifies posts in your LinkedIn, X, and Reddit feeds using an LLM of your choice. The model returns a direct `keep` or `hide` decision for each post. Everything runs locally in the Chrome service worker; only the LLM API calls you configure ever leave your machine.

## Install

### From source

```bash
# Requires Bun v1.3.8+
cd extension
bun install
bun run build
```

1. Open Chrome → `chrome://extensions/`
2. Enable **Developer mode** (top right)
3. Click **Load unpacked** → select `extension/dist/`

### From releases

Pre-built zips are available on the [Releases](../../releases) page.

## Setup

Open the extension popup and enter:

| Field | Example |
|-------|---------|
| API Key | your key from OpenAI, OpenRouter, etc. |
| Base URL | `https://api.openai.com/v1` |
| Model | `claude-haiku-4-5` |

Save, flip the toggle, scroll your feed. Done.

## Supported platforms

| Platform | Status |
|----------|--------|
| LinkedIn | ✅ |
| X / Twitter | experimental |
| Reddit | experimental |

## Supported providers

Any OpenAI-compatible endpoint works:

| Provider | Base URL |
|----------|----------|
| OpenAI | `https://api.openai.com/v1` |
| OpenRouter | `https://openrouter.ai/api/v1` |
| Ollama (local) | `http://localhost:11434/v1` |
| vLLM / LiteLLM | your own URL |

Recommended model: `claude-haiku-4-5` — fast, cheap, accurate for classification. Any model with JSON mode works.

## How it works

Each post is classified directly in the Chrome service worker:

```
post arrives in feed
       ↓
 local classifier (your API key)
       ↓
 keep / hide
```

## Development

```bash
cd extension

bun run build          # production build
bun run dev            # watch mode

bun test src/          # full test suite
bunx tsgo --noEmit -p tsconfig.json  # type check
```

## Project structure

```
extension/src/
├── background/
│   ├── llmClient.ts          # Typed OpenAI-compatible client
│   ├── localClassifier.ts    # Batch classifier with concurrency control
│   ├── storageFacade.ts      # API key + settings (chrome.storage.local)
│   ├── runtimeDiagnostics.ts # LLM endpoint health probe
│   └── handlers.ts           # Message handlers for content scripts
├── lib/
│   ├── prompts.ts            # System + user prompt templates
│   └── config.ts
├── content/                  # Feed DOM observation and rendering
├── platforms/                # LinkedIn, X, Reddit DOM adapters
└── popup/                    # Extension popup UI
```

## Privacy

Post text is sent only to the API endpoint you configure. No analytics, no telemetry, no external requests beyond your own LLM calls. Your API key lives in `chrome.storage.local`.

## Contributing

PRs welcome. Before opening one:

```bash
bunx tsgo --noEmit -p tsconfig.json  # must pass
bun test src/                         # must pass
```

## License

MIT
