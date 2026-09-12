# Changelog

All notable changes to the mangafire source plugin are recorded here. The plugin
version follows semver; contract-level changes follow the ABI versioning policy
defined in the spec repository (SPECIFICATION.md, Section 7).

## [Unreleased]

- Accept the series locators `/title/<hid>-<slug>` and `/manga/<slug>.<hid>`,
  and the chapter locators `<id>-chapter-<n>-<lang>` and `/volume/<id>`
  beside the published `c:<id>` form, so a locator recorded by a backup
  resolves.

## [1.0.0] - 2026-09-12

- Add the MangaFire source plugin: search, details, chapter list and page images.
