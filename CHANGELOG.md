# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.9.2] - 2026-03-21

### Fixed

- Fixed SDUI LinkedIn feed detection failing on DOMs where `role="listitem"` posts are nested inside wrapper divs rather than being direct children of `role="list"` (changed `>` direct-child combinator to a descendant selector).

### Added

- Two additional hint selectors for SDUI feed discovery: `[data-testid="expandable-text-box"]` (stable post text body) and `[componentkey*="FeedType_MAIN_FEED"]` (per-post component key), providing redundant entry points for post detection.

### Changed

- Rewrote SDUI detection test fixtures to match the actual minified LinkedIn DOM structure with realistic wrapper div nesting, `componentkey` attributes, and `expandable-text-box` test IDs, replacing the previous misleadingly-simplified fixtures.

## [0.9.1] - 2026-03-21

### Added

- Support for LinkedIn's newer SDUI/minified feed DOM by detecting `role="listitem"` posts with author links and social-action buttons, plus a text-hash fallback when `data-urn` identifiers are missing.
- Shared provider URL normalization helpers and tests for OpenAI-compatible endpoints, including validation, query stripping, and normalized origin patterns.

### Changed

- Moved custom model-host permission requests into the popup save flow so endpoint access is granted before provider settings are stored, and persist normalized base URLs instead of raw input.
- Added `http://localhost:8001/*` to extension host permissions for local OpenAI-compatible servers.
- Normalized LLM user messages to content-part arrays for both text-only and multimodal requests, reducing duplicate request-building paths.

## [0.8.0] - 2026-03-13

### Added

- Dark-mode logo and favicon variants for the website and extension branding.
- Buy Me a Coffee funding metadata in the repository and a persistent support button in the website header.

### Changed

- Refreshed the landing page copy and calls to action with a direct Chrome Web Store install link, a GitHub link, clearer BYOK/no-backend messaging, and a simpler before/after demo framing.
- Refreshed the shipped extension icons and aligned the core logo geometry across website and extension assets.
- Upgraded the website from Astro 5 to Astro 6 and removed unused website test dependencies.

### Removed

- Obsolete backend/local-infra scaffolding and deployment scripts, including local Docker/observability compose files and stale release/setup docs.

## [0.7.2] - 2026-03-13

### Added

- MIT licensing for the project.
- GitHub bug-report and feature-request issue templates.

### Changed

- Generalized LinkedIn article detection from `article[role="article"]` to `[role="article"]` so post discovery works across more DOM variants.
- Updated the release workflow to publish extension packages with the repository `GITHUB_TOKEN` and explicit `contents: write` permissions.

## [0.7.0] - 2026-03-01

### Added

- BYOK-first extension runtime that classifies posts directly via OpenAI-compatible endpoints.
- Local aggregate stats in the popup, with no account-level analytics.

### Changed

- Migrated classification output from score-based processing to direct binary `keep`/`hide` decisions.
- Switched caching to local hash-based keys to avoid storing post identifiers/content in cache records.
- Renamed `frontend/` to `website/` as part of the repo split.

### Removed

- Backend runtime dependency from the extension path.
- Auth, billing, quota, and backend stats dependency paths from the extension.

## [0.5.0] - 2026-02-23

### Changed

- Release version bump from `0.4.6` to `0.5.0`.

## [0.4.6] - 2026-02-23

### Changed

- Reworked LinkedIn cleanup into a deterministic metadata-classified pipeline with stronger metadata-only stripping and fail-open fallback.

## [0.4.5] - 2026-02-23

### Changed

- Refactored LinkedIn cleanup to bounded edge-peeling normalization with guarded follow-action prefix removal.

## [0.4.4] - 2026-02-23

### Changed

- Hardened LinkedIn cleanup against leaked social-graph follow-prefix noise while preserving legitimate prose.

## [0.4.3] - 2026-02-23

### Changed

- Expanded LinkedIn parser sanitization coverage for feed chrome and metadata-heavy artifacts.

## [0.4.2] - 2026-02-23

### Changed

- Added sanitize-stage cleanup in LinkedIn parsing flow.

## [0.4.1] - 2026-02-20

### Fixed

- Updated extension configuration for `0.4.1`.

## [0.4.0] - 2026-02-20

### Changed

- Simplified core extension/backend flow for the `0.4.0` release.

## [0.3.0] - 2026-02-17

### Added

- Runtime diagnostics panel and onboarding flow.

### Changed

- Refactored extension flow abstractions and related documentation.
- Refactored diagnostics into the core engine and platform-owned services.
- Bumped backend and extension versions to `0.3.0`.

### Fixed

- Added expiry guard for pending batch queue entries.
