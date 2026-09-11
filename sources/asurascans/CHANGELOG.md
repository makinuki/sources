# Changelog

All notable changes to the asurascans source plugin are recorded here. The
plugin version follows semver; contract-level changes follow the ABI
versioning policy defined in the spec repository (SPECIFICATION.md,
Section 7).

## [1.1.2] - 2026-09-11

- Key chapter identity on the stable series slug instead of the rotating
  per-series URL suffix. A suffix rotation no longer reads as a full chapter
  replacement, and the stable chapter URL redirects to the current suffix.

## [1.1.1] - 2026-08-24

- Declare chapter language (`en`) on chapter items.

## [1.1.0] - 2026-08-23

- Adopt contract 1.2.0 (`@makinuki/spec` 1.2.0, `@makinuki/pdk` 1.3.0).
- Omit `coverUrl` from manga items and details when the source provides
  no cover image.

## [1.0.0] - 2026-08-17

- Frozen-ABI baseline, released in lockstep with spec v1.0.0 (ABI 1).
