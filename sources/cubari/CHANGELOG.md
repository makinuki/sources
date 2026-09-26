# Changelog

All notable changes to the cubari source plugin are recorded here. The plugin
version follows semver; contract-level changes follow the ABI versioning policy
defined in the spec repository (SPECIFICATION.md, Section 7).

## [Unreleased]

- Add a site address setting for the reading-list origin; the image proxy
  and the third-party image hosts are unaffected by the override.
- Resolve a chapter link that a list addresses as a site-relative path
  against the site origin, when emitting it and when fetching it, so such
  lists publish absolute chapter links and serve their pages.
- Stop emitting a chapter language: no list payload carries one.

## [1.0.1] - 2026-09-12

- Strip the site read prefix from a chapter locator, so the
  `/read/<source>/<slug>/<chapter>/<group>` value a backup records resolves
  to the same series and chapter the published id does.

## [1.0.0] - 2026-09-12

- Add the Cubari source plugin: search, details, chapter list and page images.
