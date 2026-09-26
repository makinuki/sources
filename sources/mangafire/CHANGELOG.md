# Changelog

All notable changes to the mangafire source plugin are recorded here. The plugin
version follows semver; contract-level changes follow the ABI versioning policy
defined in the spec repository (SPECIFICATION.md, Section 7).

## [1.1.1] - 2026-09-26

- Attach the chapter page URL to every chapter entry, so a host can open
  the chapter on the site.
- Resolve the emitted chapter page URL back through get_pages.
- Fetch the chapter list through the last page the source reports instead
  of stopping at 20 pages.

## [1.1.0] - 2026-09-26

- Emit every chapter language: the chapter list no longer asks for English
  only and each chapter carries the language the payload reports.
- Attach the site referer to every page entry, so the page image hosts
  serve their files instead of answering 403.
- Declare the page image hosts for transport allowlists.
- Split details tags by axis: the genre list stays in genres, the themes
  axis and the demographics set move to tags.
- Add a site address setting for the site origin; the cover and page image
  hosts are unaffected by the override.

## [1.0.1] - 2026-09-12

- Accept the series locators `/title/<hid>-<slug>` and `/manga/<slug>.<hid>`,
  and the chapter locators `<id>-chapter-<n>-<lang>` and `/volume/<id>`
  beside the published `c:<id>` form, so a locator recorded by a backup
  resolves.

## [1.0.0] - 2026-09-12

- Add the MangaFire source plugin: search, details, chapter list and page images.
