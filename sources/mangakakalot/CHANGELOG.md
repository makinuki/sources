# Changelog

All notable changes to the mangakakalot source plugin are recorded here. The plugin
version follows semver; contract-level changes follow the ABI versioning policy
defined in the spec repository (SPECIFICATION.md, Section 7).

## [1.1.0] - 2026-09-26

- Add a site address setting for the site origin; the series, chapter,
  listing and chapter API requests follow the override.
- Attach the site referer to every page entry, so the page image hosts
  serve their files instead of answering 403.
- Declare the page image hosts and drop the two stale entries.
- Emit the canonical chapter URL on every chapter entry.
- Read the chapter number from the chapter payload's numeric field and fall
  back to the chapter name.
- Read the authors from the plain-text Author(s) row instead of looking for
  anchors that the site never renders, and split the line into one entry per
  name.
- Drop the title prefix and the summary label from the description, and
  probe both markups for the alternate title.
- Keep the medium entries (manga, manhwa, manhua) out of the genre list and
  refresh the category list.
- Fix the search pagination flag, which always reported a following page
  because the disabled Next link matched, so later search pages are reachable.
- Publish the measured rate limit and retry hints, and report a challenge
  response as a blocked error rather than a rate limit, so a caller can tell a
  solvable interstitial apart from a spent request budget.

## [1.0.0] - 2026-09-12

- Add the Mangakakalot source plugin: search, details, chapter list and page images.
