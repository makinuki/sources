# Changelog

All notable changes to the omegascans source plugin are recorded here. The plugin
version follows semver; contract-level changes follow the ABI versioning policy
defined in the spec repository (SPECIFICATION.md, Section 7).

## [1.1.0] - 2026-09-27

- List early-access chapters as locked entries while their paid window is
  open, instead of listing them as readable. A chapter that was priced but
  whose window has elapsed is listed as readable again, which matches what
  the site serves.
- Add a site address setting: the override moves the site origin and the API
  origin follows as api.<host>.

## [1.0.0] - 2026-09-12

- Add the Omega Scans source plugin: search, details, chapter list and page images.
