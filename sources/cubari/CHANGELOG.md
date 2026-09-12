# Changelog

All notable changes to the cubari source plugin are recorded here. The plugin
version follows semver; contract-level changes follow the ABI versioning policy
defined in the spec repository (SPECIFICATION.md, Section 7).

## [Unreleased]

- Strip the site read prefix from a chapter locator, so the
  `/read/<source>/<slug>/<chapter>/<group>` value a backup records resolves
  to the same series and chapter the published id does.

## [1.0.0] - 2026-09-12

- Add the Cubari source plugin: search, details, chapter list and page images.
