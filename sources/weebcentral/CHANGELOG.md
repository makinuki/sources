# Changelog

All notable changes to the weebcentral source plugin are recorded here. The plugin
version follows semver; contract-level changes follow the ABI versioning policy
defined in the spec repository (SPECIFICATION.md, Section 7).

## [1.1.0] - 2026-09-26

- Add a site address setting for the site origin; the search, series and
  chapter requests and the emitted series and chapter URLs follow the
  override. Cover and page images are served from their own hosts and do not
  follow it.
- Declare the two page image hosts, which the chapter scanlator decides
  between, so a transport can route to a page image at all. Drop the two
  entries that no longer serve anything: the placeholder host and the apex
  that does not resolve.
- Keep the medium (Manga, Manhwa, Manhua, OEL) out of the genre list; it is a
  format classification rather than a genre, and the tag axis is reported on
  its own.

## [1.0.0] - 2026-09-12

- Add the Weeb Central source plugin: search, details, chapter list and page images.
