import { parseArgs } from "node:util";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import Ajv, { type ValidateFunction } from "ajv";
import addFormats from "ajv-formats";
import { checkExports, loadPlugin, UA, WASM_EXPORTS } from "./lib/host.ts";

const require = createRequire(import.meta.url);
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const distDir = join(root, "dist");
const specDir = join(dirname(require.resolve("@makinuki/spec/package.json")), "schemas");

const SCRAMBLE_LAYOUTS = ["slice", "shift", "custom"] as const;
// How many search results the default run probes for a title that carries
// chapters before giving up.
const DETAILS_PROBES = 5;

const { values, positionals } = parseArgs({
  args: process.argv.slice(2),
  allowPositionals: true,
  options: {
    search: { type: "string" },
    filters: { type: "string" },
    page: { type: "string" },
    details: { type: "string" },
    pages: { type: "string" },
    expect: { type: "string" },
  },
});

const targets = positionals.length > 0 ? positionals : readdirSync(distDir).filter((f) => f.endsWith(".wasm")).map((f) => f.slice(0, -5)).sort();
if (targets.length === 0) {
  console.error("usage: node scripts/run-tests.ts [source ...] [--search <q>] [--filters <json>] [--page <n>] [--details <id>] [--pages <id>] [--expect <id>]");
  console.error("(no source: test every plugin in dist/)");
  process.exit(1);
}
if (positionals.length === 0) console.log(`targets: ${targets.join(", ")}`);

const opts = values as unknown as {
  search?: string;
  filters?: string;
  page?: string;
  details?: string;
  pages?: string;
  expect?: string;
};

let fails = 0;
let passes = 0;

function pass(name: string, info?: string) {
  passes++;
  console.log(`PASS ${name}${info ? ` (${info})` : ""}`);
}

function fail(name: string, info: string) {
  fails++;
  console.log(`FAIL ${name}: ${info}`);
}

function schemaErrors(validate: ValidateFunction): string {
  const shown = (validate.errors ?? []).slice(0, 3).map((e) => `${e.instancePath || "/"} ${e.message}`);
  const rest = (validate.errors?.length ?? 0) - shown.length;
  return `${shown.join("; ")}${rest > 0 ? `; and ${rest} more` : ""}`;
}

const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);
// Register every schema before compiling any: payload schemas carry
// cross-file $refs (details.schema.json points into manga.schema.json),
// and ajv resolves those only against schemas already registered.
const schemaFiles = readdirSync(specDir).filter((f) => f.endsWith(".schema.json") && f !== "index.schema.json");
const validators = new Map<string, ValidateFunction>();
for (const file of schemaFiles) {
  const schema = JSON.parse(readFileSync(join(specDir, file), "utf8")) as object;
  ajv.addSchema(schema);
}
for (const file of schemaFiles) {
  validators.set(file, ajv.getSchema(`https://makinuki.github.io/schemas/${file}`)!);
}
const validate = (name: string): ValidateFunction => {
  const v = validators.get(name);
  if (!v) throw new Error(`unknown schema ${name}`);
  return v;
};

function checkEnvelope(data: unknown): string | null {
  if (typeof data !== "object" || data === null) return "plugin returned non-object";
  const env = data as { ok?: boolean; error?: { code?: unknown; message?: unknown }; data?: unknown };
  if (env.ok !== true) return `ok:false (code=${String(env.error?.code ?? "?")}, message=${String(env.error?.message ?? "?")})`;
  if (!("data" in env)) return "envelope missing data";
  return null;
}

function requireUnique(ids: Array<string | undefined>, what: string): string | null {
  const seen = new Set<string>();
  for (const id of ids) {
    if (id === undefined || id === "") return `${what} has empty id`;
    if (seen.has(id)) return `${what} has duplicate id ${id}`;
    seen.add(id);
  }
  return null;
}

async function runSource(source: string): Promise<boolean> {
  fails = 0;
  passes = 0;
  const wasmPath = join(distDir, `${source}.wasm`);
  if (!existsSync(wasmPath)) {
    fail("load", `no such plugin: ${wasmPath}`);
    return false;
  }
  console.log(`=== ${source} ===`);
  console.log(`schema dir: ${specDir}`);
  console.log(`user-agent: ${UA}`);

  const exports = await checkExports(wasmPath);
  const missing = WASM_EXPORTS.filter((name) => !exports.includes(name));
  if (missing.length > 0) {
    fail("exports", `missing ${missing.join(", ")}`);
    return false;
  }
  pass("exports", WASM_EXPORTS.join(" "));

  const plugin = await loadPlugin(wasmPath);

  const metadataRaw = (await plugin.call("get_metadata", "")).text();
  const metadata = JSON.parse(metadataRaw) as Record<string, unknown>;
  {
    const v = validate("metadata.schema.json");
    if (!v(metadata)) {
      fail("get_metadata", schemaErrors(v));
      return false;
    }
    if (metadata.abiVersion !== 1) {
      fail("get_metadata", `abiVersion must be 1, got ${String(metadata.abiVersion)}`);
      return false;
    }
    pass("get_metadata", `${String(metadata.id)} v${String(metadata.version)} lang=${String(metadata.lang)}`);
  }

  const filtersRaw = (await plugin.call("get_filters", "")).text();
  const filters = JSON.parse(filtersRaw) as Array<Record<string, unknown>>;
  {
    const v = validate("filter.schema.json");
    if (!v(filters)) {
      fail("get_filters", schemaErrors(v));
      return false;
    }
    const dup = requireUnique(filters.map((f) => String(f.id ?? "")), "filters");
    if (dup) {
      fail("get_filters", dup);
      return false;
    }
    const counts: Record<string, number> = {};
    for (const f of filters) counts[String(f.type)] = (counts[String(f.type)] ?? 0) + 1;
    pass("get_filters", `${filters.length} (${Object.entries(counts).map(([t, n]) => `${t}x${n}`).join(", ")})`);
  }

  // A source whose search maps direct links instead of a server-side
  // catalogue can pin the locators the default run exercises in
  // sources/<id>/test.json; explicit CLI options still win.
  const fixturePath = join(root, "sources", source, "test.json");
  let fixture: { search?: string; details?: string; pages?: string } = {};
  if (existsSync(fixturePath)) {
    try {
      fixture = JSON.parse(readFileSync(fixturePath, "utf8")) as typeof fixture;
    } catch {
      fail("fixture", `sources/${source}/test.json is not valid JSON`);
      return false;
    }
  }

  const query = opts.search ?? fixture.search ?? "a";
  const page = Number(opts.page ?? "1");
  const filtersJson = (() => {
    if (!opts.filters) return {};
    try {
      return JSON.parse(opts.filters) as Record<string, unknown>;
    } catch {
      console.error(`FAIL bad --filters JSON: ${opts.filters}`);
      process.exit(1);
    }
  })();

  let searchData: { items: Array<Record<string, unknown>>; hasNextPage: boolean; page: number } | null = null;
  {
    const raw = (await plugin.call("search", JSON.stringify({ query, page, filters: filtersJson }))).text();
    const result = JSON.parse(raw) as { ok: boolean; data?: unknown; error?: unknown };
    const envErr = checkEnvelope(result);
    if (envErr) {
      fail("search", `${envErr} (query=${query} page=${page})`);
      return false;
    }
    const v = validate("manga.schema.json");
    if (!v(result.data)) {
      fail("search", schemaErrors(v));
      return false;
    }
    const data = result.data as { items: Array<Record<string, unknown>>; hasNextPage: boolean; page: number };
    const items = data.items;
    const dup = requireUnique(items.map((i) => String(i.id ?? "")), "search items");
    if (dup) {
      fail("search", dup);
      return false;
    }
    if (opts.expect && !items.some((i) => i.id === opts.expect)) {
      fail("search", `--expect ${opts.expect} not in ${items.length} results`);
      return false;
    }
    searchData = data;
    pass(
      "search",
      `"${query}" page=${data.page} items=${items.length} hasNextPage=${data.hasNextPage}` +
        (opts.expect ? " expect=found" : "")
    );
  }

  // Details target: an explicit --details value, or the first search result
  // that carries chapters. Search ranking is data-driven, so the top hit can
  // be a title whose chapters are unavailable; probing a few candidates keeps
  // the default run stable without pinning a fixture that would rot.
  const candidates = (opts.details ?? fixture.details)
    ? [String(opts.details ?? fixture.details)]
    : searchData.items.slice(0, DETAILS_PROBES).map((item) => String(item.id));
  if (candidates.length === 0) {
    fail("get_details", "no id available (search returned no items and no --details given)");
    return false;
  }

  let chapters: Array<Record<string, unknown>> = [];
  let detailsId = "";
  let detailsStatus = "";
  let probed = 0;
  for (const candidate of candidates) {
    const raw = (await plugin.call("get_details", JSON.stringify(candidate))).text();
    const result = JSON.parse(raw) as { ok: boolean; data?: unknown; error?: unknown };
    const envErr = checkEnvelope(result);
    if (envErr) {
      fail("get_details", envErr);
      return false;
    }
    const details = result.data as {
      id: string;
      title: string;
      status: string;
      coverUrl?: string;
      chapters: Array<Record<string, unknown>>;
    };
    const v = validate("details.schema.json");
    if (!v(details)) {
      fail("get_details", schemaErrors(v));
      return false;
    }
    if (details.id !== candidate) {
      fail("get_details", `id mismatch: requested ${candidate}, got ${details.id}`);
      return false;
    }
    const dup = requireUnique(details.chapters.map((c) => String(c.id ?? "")), "chapters");
    if (dup) {
      fail("get_details", dup);
      return false;
    }
    probed++;
    chapters = details.chapters;
    detailsId = candidate;
    detailsStatus = details.status;
    if (chapters.length > 0) break;
  }
  pass(
    "get_details",
    `${detailsId} chapters=${chapters.length} status=${detailsStatus}` +
      (probed > 1 ? ` after ${probed} candidates` : "")
  );

  const pagesId = opts.pages ?? fixture.pages ?? (chapters[0]?.id as string | undefined);
  if (!pagesId) {
    fail("get_pages", "no chapter id available (details has no chapters and no --pages given)");
    return false;
  }

  {
    const raw = (await plugin.call("get_pages", JSON.stringify(pagesId))).text();
    const result = JSON.parse(raw) as { ok: boolean; data?: unknown; error?: unknown };
    const envErr = checkEnvelope(result);
    if (envErr) {
      fail("get_pages", envErr);
      return false;
    }
    const pages = result.data as Array<{
      index: number;
      url: string;
      isScrambled: boolean;
      metadata?: { layout: string; rows: number; cols: number; tileW: number; tileH: number; order: number[] };
    }>;
    const v = validate("pages.schema.json");
    if (!v(pages)) {
      fail("get_pages", schemaErrors(v));
      return false;
    }
    for (let i = 0; i < pages.length; i++) {
      const p = pages[i];
      if (p.index !== i) {
        fail("get_pages", `page[${i}] index=${p.index} (must be sequential from 0)`);
        return false;
      }
      if (p.isScrambled) {
        const m = p.metadata;
        if (!m || !SCRAMBLE_LAYOUTS.includes(m.layout as (typeof SCRAMBLE_LAYOUTS)[number])) {
          fail("get_pages", `page[${i}] isScrambled without valid metadata`);
          return false;
        }
        if (m.order.length !== m.rows * m.cols || new Set(m.order).size !== m.order.length) {
          fail("get_pages", `page[${i}] order must be a permutation (rows*cols=${m.rows * m.cols}, got ${m.order.length})`);
          return false;
        }
      }
    }
    const scrambled = pages.filter((p) => p.isScrambled).length;
    pass("get_pages", `${pagesId} pages=${pages.length} scrambled=${scrambled}`);
  }

  return fails === 0;
}

(async () => {
  let allOk = true;
  for (const target of targets) {
    const ok = await runSource(target);
    const total = passes + fails;
    console.log("==================================================================");
    console.log(ok ? `RESULT: PASS (${passes}/${total})` : `RESULT: FAIL (${passes}/${total})`);
    if (!ok) allOk = false;
  }
  if (targets.length > 1) {
    console.log("==================================================================");
    console.log(allOk ? `ALL SOURCES PASS (${targets.length})` : `SOME SOURCES FAILED (${targets.length})`);
  }
  process.exitCode = allOk ? 0 : 1;
})().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
