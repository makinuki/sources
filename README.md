# MakiNuki Sources

Reference source plugins for MakiNuki: WASM scrapers built with
[@makinuki/pdk](https://github.com/makinuki/pdk-ts). Each subdirectory under
`sources/` is one installable source plugin implementing the MakiNuki ABI
contract, defined in [makinuki/spec](https://github.com/makinuki/spec).

## Layout

```
sources/
├── sources/
│   ├── mangadex/       # MangaDex (REST API based)
│   └── asurascans/     # Asura Scans (HTML scraping)
├── scripts/
│   ├── build.ts        # batch compiler: sources/* -> dist/*.wasm
│   └── release.sh      # cuts and tags a release for one source
└── dist/               # compiled .wasm outputs (gitignored)
```

## Prerequisites

- Node.js 22.18 or newer
- pnpm
- The `extism-js` compiler and binaryen `wasm-merge`/`wasm-opt` tools on PATH

## Building

```
pnpm install
pnpm build
```

Each source package compiles to `dist/<name>.wasm`. `pnpm typecheck` runs the
TypeScript compiler over the scripts and all source packages.

## Testing

`pnpm test` runs the conformance runner against every plugin in `dist/`,
asserting payloads against the schemas and exercising live endpoints.
Pass one or more plugin ids to scope it, e.g. `pnpm test mangadex`. The
runner talks to real source websites, so network access is required.

A source can pin the locators the run exercises, or declare that it cannot
be reached without a browser, in `sources/<id>/test.json`:

```json
{
  "search": "query",
  "details": "series-locator",
  "pages": "chapter-locator",
  "challengeGated": true
}
```

`challengeGated` marks a source whose catalogue is behind an anti-bot
challenge that a runner without a browser cannot pass. Hosting networks are
challenged far more often than ordinary connections, so a source can be fully
reachable from a desktop and still be gated from CI; the marker makes that
difference explicit instead of leaving the pipeline red. The runner then
reports `SKIP` for such a source instead of a failure, as long as the plugin
still answers with a well-formed envelope carrying `CLOUDFLARE_BLOCKED`; any
other error still fails the run, so a plugin that regresses into a different
failure mode is caught. To run the full check for such a source, solve the
challenge in a browser and pass that browser's credentials to the runner:

```sh
MAKINUKI_TEST_UA="<browser user agent>" \
MAKINUKI_TEST_COOKIE="cf_clearance=<value>" \
  pnpm test <id>
```

## Schemas

The JSON Schemas live in the spec repository and are consumed through the
linked `@makinuki/spec` package, e.g. `@makinuki/spec/schemas/metadata.schema.json`.
The spec repo is the single source of truth; there are no copies in this
repository. The conformance test runner asserts plugin output against them.

## Releasing a source

Each plugin is released independently. The plugin version lives in the
metadata constant in `sources/<id>/src/index.ts`; each plugin carries its
own `sources/<id>/CHANGELOG.md`. There is no repo-wide version.

To cut a release for one plugin:

1. Make the changes and describe them under `[Unreleased]` in
   `sources/<id>/CHANGELOG.md`. Do not bump the version yourself; the
   release script does that.
2. Run `scripts/release.sh <id> <patch|minor|major|x.y.z>`. The script
   requires a clean tree on master, rejects releases with no source
   changes since the previous tag, refuses versions that collide with or
   undercut existing `<id>-v*` tags, runs typecheck, build, and
   conformance tests for the plugin, bumps its version, folds the
   changelog section into a dated one, and creates an annotated
   `<id>-vX.Y.Z` tag.
3. Push with `git push --follow-tags origin master`.

Two pipelines run on GitHub:

- Every push to master rebuilds all plugins, runs conformance tests, and
  republishes [makinuki.github.io](https://makinuki.github.io/index.json)
  with the freshly built registry. Unchanged plugins keep their version.
- A pushed `<id>-vX.Y.Z` tag additionally triggers the release pipeline:
  it verifies that the built plugin metadata matches the tag, deploys
  the registry, and creates a GitHub Release named after the tag carrying
  the `dist/wasm/<id>-v<version>.wasm` artifact and the matching
  changelog section as notes.

Registry deployments are serialized through a single queue so concurrent
releases cannot overwrite each other on the pages repository. Versions
never move backwards: every release ships under a new
`<id>-v<version>.wasm` name, and a deployment that would downgrade any
plugin relative to the live registry fails.

