import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const pdkPath = dirname(require.resolve("@makinuki/pdk/package.json", { paths: [root] }));
const extism = require(require.resolve("@extism/extism", { paths: [pdkPath] }));

export const UA = "MakiNuki/0.1 (github.com/makinuki; conformance runner)";
export const WASM_EXPORTS = ["get_metadata", "get_filters", "search", "get_details", "get_pages"] as const;

const store = new Map<string, string>();

export interface PluginCallResult {
  text(): string;
}

export interface Plugin {
  call(name: string, input?: string | Uint8Array): Promise<PluginCallResult>;
}

const hostFunctions = {
  "extism:host/makinuki": {
    makinuki_fetch: async (ctx: { read(p: number): { string(): string }; store(v: string): bigint }, ptr: number) => {
      const req = JSON.parse(ctx.read(ptr).string()) as {
        url: string;
        method?: string;
        headers?: Record<string, string>;
        body?: string;
      };
      const res = await fetch(req.url, {
        method: req.method ?? "GET",
        headers: { ...(req.headers ?? {}), "User-Agent": UA },
        body: req.body,
      });
      return ctx.store(
        JSON.stringify({ status: res.status, headers: Object.fromEntries(res.headers), body: await res.text() })
      );
    },
    makinuki_storage_get: (ctx: { read(p: number): { string(): string }; store(v: string): bigint }, ptr: number) => {
      const key = JSON.parse(ctx.read(ptr).string()) as string;
      const value = store.get(key);
      return value === undefined ? 0n : ctx.store(value);
    },
    makinuki_storage_set: (ctx: { read(p: number): { string(): string } }, ptr: number) => {
      const entry = JSON.parse(ctx.read(ptr).string()) as { key: string; value: string };
      if (Buffer.byteLength(entry.value, "utf8") > 64 * 1024) throw new Error("storage value exceeds 64 KB cap");
      store.set(entry.key, entry.value);
      return 0n;
    },
    makinuki_log: (ctx: { read(p: number): { string(): string } }, ptr: number) => {
      const entry = JSON.parse(ctx.read(ptr).string()) as { level?: string; message: string };
      console.log(`[plugin log ${entry.level ?? "info"}] ${entry.message}`);
      return 0n;
    },
  },
};

export async function checkExports(wasmPath: string): Promise<string[]> {
  const module = await WebAssembly.compile(readFileSync(wasmPath));
  return WebAssembly.Module.exports(module).map((entry) => entry.name);
}

export async function loadPlugin(wasmPath: string): Promise<Plugin> {
  const wasm = readFileSync(wasmPath);
  return extism.createPlugin(
    { wasm: [{ data: new Uint8Array(wasm) }] },
    { useWasi: true, functions: hostFunctions }
  ) as Promise<Plugin>;
}