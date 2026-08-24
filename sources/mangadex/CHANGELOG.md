# Changelog

All notable changes to the mangadex source plugin are recorded here. The
plugin version follows semver; contract-level changes follow the ABI
versioning policy defined in the spec repository (SPECIFICATION.md,
Section 7).

## [Unreleased]

## [1.1.0] - 2026-08-23

- Adopt contract 1.2.0 (`@makinuki/spec` 1.2.0, `@makinuki/pdk` 1.3.0).
- Emit integer chapter volumes in details and chapters payloads.
- Expose manga cover size variants at 256px and 512px.

## [1.0.0] - 2026-08-17

- Frozen-ABI baseline, released in lockstep with spec v1.0.0 (ABI 1).
- No scraper logic changes; the registry serves the baseline artifact
  `mangadex-v1.0.0.wasm`.
