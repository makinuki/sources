# Changelog

All notable changes to the atsumaru source plugin are recorded here. The plugin
version follows semver; contract-level changes follow the ABI versioning policy
defined in the spec repository (SPECIFICATION.md, Section 7).

## [Unreleased]

- Add a site address setting for the site origin; the search, series, chapter
  and reader requests, the cover artwork and the emitted URLs all follow the
  override.
- Declare the image host, so a transport that checks every redirect hop accepts
  the jump from a site artwork path to the image origin.
- Emit the cover artwork again. The poster matcher read a payload shape the
  site no longer returns, so search results and series details carried no
  cover; both the search and the series payload shapes are read now.
- Point every page image at the image host. The payload path answers 410 on
  the site origin, so pages were emitted as URLs that could not be fetched.
- Report the site's tag axis separately from its genre axis instead of
  reporting genres alone.
- Keep the medium (manga, manhwa, manhua, OEL, other) out of the genre list;
  it is a format classification rather than a genre.

## [1.0.0] - 2026-09-12

- Add the Atsumaru source plugin: search, details, chapter list and page images.
