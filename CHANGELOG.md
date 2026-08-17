# Changelog

All notable changes to the MakiNuki source plugin catalog are recorded here. Plugin versions follow semver; contract changes follow the ABI versioning policy (spec, SPECIFICATION.md Section 7).

## [1.0.0] - 2026-08-17

- Both reference plugins (`mangadex`, `asurascans`) bumped to `1.0.0`, released in lockstep with spec v1.0.0 (ABI 1 frozen).
- No scraper logic changes; the registry now serves the frozen-ABI baseline artifacts (`mangadex-v1.0.0.wasm`, `asurascans-v1.0.0.wasm`).