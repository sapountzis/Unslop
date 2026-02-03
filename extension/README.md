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
