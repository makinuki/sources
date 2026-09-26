# Changelog

All notable changes to the mangadex source plugin are recorded here. The
plugin version follows semver; contract-level changes follow the ABI
versioning policy defined in the spec repository (SPECIFICATION.md,
Section 7).

## [1.2.0] - 2026-09-26

- Split details tags by catalogue group: the genre group stays in genres,
  theme, format, and content move to tags.
- Add source settings: data saver (compressed chapter images),
  include-unavailable (list removed chapters as locked entries), and an API
  address override that leaves site links on the public origin.
- Mark chapters listed but not readable as locked, pointing at the official
  portal or the chapter page; placeholder entries with no readable images
  are dropped.
- Declare a 200ms request pacing hint in the source metadata.

## [1.1.1] - 2026-09-12

- Accept a locator in every published form: the bare id, the `/manga/<id>`
  and `/chapter/<id>` paths a backup records, or an absolute URL carrying
  either. An imported title and its chapters resolve without a prior
  refresh, and a differing declaration is reported as the id.

## [1.1.0] - 2026-08-23

- Adopt contract 1.2.0 (`@makinuki/spec` 1.2.0, `@makinuki/pdk` 1.3.0).
- Emit integer chapter volumes in details and chapters payloads.
- Expose manga cover size variants at 256px and 512px.

## [1.0.0] - 2026-08-17

- Frozen-ABI baseline, released in lockstep with spec v1.0.0 (ABI 1).
- No scraper logic changes; the registry serves the baseline artifact
  `mangadex-v1.0.0.wasm`.
