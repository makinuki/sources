import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import Ajv, { type ValidateFunction } from "ajv";
import addFormats from "ajv-formats";
import { loadPlugin } from "./lib/host.ts";

const require = createRequire(import.meta.url);
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const distDir = join(root, "dist");
const wasmOutDir = join(distDir, "wasm");
const specDir = join(dirname(require.resolve("@makinuki/spec/package.json")), "schemas");

const REGISTRY_BASE = "https://makinuki.github.io";
const MIN_RUNTIME_VERSION = "1.0.0";

const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);
const schema = JSON.parse(readFileSync(join(specDir, "index.schema.json"), "utf8")) as object;
const validate: ValidateFunction = ajv.compile(schema);

function updatedAt(): number {
  const head = spawnSync("git", ["show", "-s", "--format=%ct", "HEAD"], { encoding: "utf8" });
  const timestamp = Number((head.stdout ?? "").trim());
  return Number.isInteger(timestamp) && timestamp > 0 ? timestamp : Math.floor(Date.now() / 1000);
}

async function main(): Promise<void> {
  const wasmFiles = readdirSync(distDir)
    .filter((file) => file.endsWith(".wasm"))
    .sort();

  if (wasmFiles.length === 0) {
    console.error("no .wasm files found under dist/ (run pnpm build first)");
    process.exitCode = 1;
    return;
  }

  const sources: Array<Record<string, unknown>> = [];
  for (const file of wasmFiles) {
    const bytes = readFileSync(join(distDir, file));
    const plugin = await loadPlugin(join(distDir, file));
    const metadata = JSON.parse((await plugin.call("get_metadata", "")).text()) as Record<string, unknown>;
    const id = String(metadata.id);
    const version = String(metadata.version);
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    mkdirSync(wasmOutDir, { recursive: true });
    writeFileSync(join(wasmOutDir, `${id}-v${version}.wasm`), bytes);
    const entry: Record<string, unknown> = {
      id,
      name: String(metadata.name),
      version,
      abiVersion: metadata.abiVersion,
      lang: String(metadata.lang),
      baseUrl: String(metadata.baseUrl),
      iconUrl: String(metadata.iconUrl),
      nsfw: metadata.nsfw,
      wasmUrl: `${REGISTRY_BASE}/wasm/${id}-v${version}.wasm`,
      sha256,
      minRuntimeVersion: MIN_RUNTIME_VERSION,
    };
    if (Array.isArray(metadata.allowedHosts) && metadata.allowedHosts.length > 0) {
      entry.allowedHosts = metadata.allowedHosts;
    }
    sources.push(entry);
    console.log(`indexed ${id} v${version} ${sha256.slice(0, 12)}...`);
  }

  sources.sort((a, b) => String(a.id).localeCompare(String(b.id)));

  const index = {
    version: 1,
    updatedAt: updatedAt(),
    sources,
  };

  if (!validate(index)) {
    console.error("index.json failed schema validation:");
    for (const error of validate.errors ?? []) {
      console.error(`  ${error.instancePath || "/"} ${error.message}`);
    }
    process.exitCode = 1;
    return;
  }

  writeFileSync(join(distDir, "index.json"), JSON.stringify(index, null, 2) + "\n");
  console.log(`wrote dist/index.json (${sources.length} sources, updatedAt=${index.updatedAt})`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});