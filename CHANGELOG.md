# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Changed

- Set Cloudflare Worker `keep_vars = true` to preserve dashboard text env vars during deploy.
- Corrected backend Worker `MAGIC_LINK_BASE_URL` to `https://api.getunslop.com/v1/auth/callback`.
- Bumped backend and extension versions to `0.4.3`.
- Added best-effort LinkedIn parser cleanup for feed chrome text (for example feed numbering, engagement preface, and action-bar tokens) while preserving fallback to raw normalized text.
- Expanded LinkedIn text cleanup with unified staged filtering that preserves prior feed-chrome stripping and adds handling for duplicated names, follower/time metadata, job update labels, following/verified tokens, comment/repost count rails, automated reaction suggestion tails, and promoted/download UI chrome.

## [0.3.0] - 2026-02-17

### Added

- Runtime diagnostics panel and onboarding flow (`bd28fe9`).

### Changed

- Refactored extension flow abstractions and related documentation (`061e508`, PR #16).
- Refactored diagnostics into the core engine and platform-owned services (`1e4a712`, PR #16).
- Bumped backend and extension versions to `0.3.0` (`62a58c7`).

### Fixed

- Added expiry guard for pending batch queue entries (`e1e0ff7`).
