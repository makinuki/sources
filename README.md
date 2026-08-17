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
│   └── build.ts        # batch compiler: sources/* -> dist/*.wasm
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

## Schemas

The JSON Schemas live in the spec repository and are consumed through the
linked `@makinuki/spec` package, e.g. `@makinuki/spec/schemas/metadata.schema.json`.
The spec repo is the single source of truth; there are no copies in this
repository. The conformance test runner asserts plugin output against them.
