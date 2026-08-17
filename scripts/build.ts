import { spawnSync } from "node:child_process";
import { readdirSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourcesDir = join(root, "sources");
const distDir = join(root, "dist");

const pdkPackage = require.resolve("@makinuki/pdk/package.json");
const buildBin = join(dirname(pdkPackage), require(pdkPackage).bin["makinuki-build"]);

const sources = readdirSync(sourcesDir, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && existsSync(join(sourcesDir, entry.name, "package.json")))
  .map((entry) => entry.name);

if (sources.length === 0) {
  console.error("no source packages found under sources/");
  process.exit(1);
}

for (const name of sources) {
  console.log(`building ${name}`);
  const result = spawnSync(
    process.execPath,
    [buildBin, "src/index.ts", "-i", "src/index.d.ts", "-o", join(distDir, `${name}.wasm`)],
    { cwd: join(sourcesDir, name), stdio: "inherit" }
  );
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

console.log(`built ${sources.length} source(s) into ${distDir}`);