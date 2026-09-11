import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const pdkPath = dirname(require.resolve("@makinuki/pdk/package.json", { paths: [root] }));
const extism = require(require.resolve("@extism/extism", { paths: [pdkPath] }));

// A challenged source can only be exercised with the clearance material an
// operator obtained in a browser, so both the user agent and the cookie jar
// can be overridden for a run.
export const UA = process.env.MAKINUKI_TEST_UA?.trim() || "MakiNuki/0.1 (github.com/makinuki; conformance runner)";
export const COOKIE = process.env.MAKINUKI_TEST_COOKIE?.trim() ?? "";
export const WASM_EXPORTS = ["get_metadata", "get_filters", "search", "get_details", "get_pages"] as const;

const store = new Map<string, string>();

// Cookies are part of the environment a browser-shaped source expects. The
// runner keeps its own jar so a session established by one request reaches
// the next, exactly as the plugin runtime does.
const cookieJar = new Map<string, Map<string, string>>();

function jarFor(url: string): Map<string, string> {
  const host = new URL(url).hostname;
  let jar = cookieJar.get(host);
  if (!jar) {
    jar = new Map();
    cookieJar.set(host, jar);
  }
  return jar;
}

function parseCookieHeader(value: string): Array<[string, string]> {
  const entries: Array<[string, string]> = [];
  for (const part of value.split(";")) {
    const trimmed = part.trim();
    if (trimmed.length === 0) continue;
    const separator = trimmed.indexOf("=");
    if (separator <= 0) continue;
    entries.push([trimmed.slice(0, separator).trim(), trimmed.slice(separator + 1).trim()]);
  }
  return entries;
}

function withStoredCookies(url: string, header: string | undefined): string {
  const merged = new Map<string, string>();
  const jar = cookieJar.get(new URL(url).hostname);
  if (jar) {
    for (const [name, value] of jar) merged.set(name, value);
  }
  for (const [name, value] of parseCookieHeader(header ?? "")) merged.set(name, value);
  return Array.from(merged, ([name, value]) => `${name}=${value}`).join("; ");
}

function rememberCookies(url: string, response: { headers: { getSetCookie?: () => string[] } }): void {
  const entries = typeof response.headers.getSetCookie === "function" ? response.headers.getSetCookie() : [];
  for (const entry of entries) {
    const [pair] = entry.split(";");
    const separator = pair.indexOf("=");
    if (separator <= 0) continue;
    jarFor(url).set(pair.slice(0, separator).trim(), pair.slice(separator + 1).trim());
  }
}

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
      const headers: Record<string, string> = {
        ...(req.headers ?? {}),
        "User-Agent": UA,
        ...(COOKIE.length > 0 ? { Cookie: COOKIE } : {}),
      };
      const jarCookie = withStoredCookies(req.url, headers["Cookie"]);
      if (jarCookie.length > 0) {
        headers["Cookie"] = jarCookie;
      } else {
        delete headers["Cookie"];
      }
      const res = await fetch(req.url, {
        method: req.method ?? "GET",
        headers,
        body: req.body,
      });
      rememberCookies(req.url, res);
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