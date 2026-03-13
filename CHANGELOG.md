# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- Simplified repository automation to extension-only CI by replacing Make-based checks with `cd extension && bun test src/`.

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
