/// <reference path="./index.d.ts" />

import {
  cleanText,
  fail,
  fetch,
  ok,
  type ChapterItem,
  type ErrorCode,
  type FilterSchema,
  type MangaDetails,
  type MangaItem,
  type PageItem,
  type PageResult,
  type SearchQuery,
  type SourceMetadata,
} from "@makinuki/pdk";
import { MakiNukiHttpError } from "@makinuki/pdk";

const WEB = "https://cubari.moe";
const ERROR_CODES: ErrorCode[] = [
  "CLOUDFLARE_BLOCKED",
  "RATE_LIMITED",
  "NETWORK_TIMEOUT",
  "SESSION_REQUIRED",
  "AUTH_EXPIRED",
  "NOT_FOUND",
  "SOURCE_OFFLINE",
  "PARSING_ERROR",
  "UNSUPPORTED_MEDIA",
  "MEMORY_LIMIT_EXCEEDED",
  "UNSCRAMBLE_FAILED",
];

const metadata: SourceMetadata = {
  id: "cubari",
  name: "Cubari",
  version: "1.0.0",
  abiVersion: 1,
  lang: "multi",
  baseUrl: WEB,
  iconUrl: `${WEB}/static/favicon.png`,
  nsfw: false,
  allowedHosts: [
    "cubari.moe",
    "services.f-ck.me",
    "files.catbox.moe",
    "imgur.com",
    "i.imgur.com",
    "redd.it",
    "i.redd.it",
    "preview.redd.it",
    "cdn.discordapp.com",
    "media.discordapp.net",
    "mangadex.org",
    "uploads.mangadex.org",
    "drive.google.com",
    "lh3.googleusercontent.com",
    "i.gyazo.com",
    "i.ibb.co",
    "imgchest.com",
    "cdn.imgchest.com",
    "githubusercontent.com",
    "raw.githubusercontent.com",
  ],
};

// Cubari serves user-curated reading lists and has no server-side catalogue
// search, so search accepts direct reading-list URLs or the legacy
// cubari:<source>/<slug> form and returns the addressed series.
const FILTERS: FilterSchema[] = [];

type Json = Record<string, unknown>;

const BASE64_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

class ScraperError extends Error {
  readonly code: ErrorCode;

  constructor(code: ErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

function asRecord(value: unknown): Json {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Json) : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function mapHttpStatus(status: number): ErrorCode {
  if (status === 401) return "SESSION_REQUIRED";
  if (status === 403) return "CLOUDFLARE_BLOCKED";
  if (status === 404) return "NOT_FOUND";
  if (status === 429) return "RATE_LIMITED";
  if (status >= 500) return "SOURCE_OFFLINE";
  return "NETWORK_TIMEOUT";
}

function get(url: string): string {
  const response = fetch({ url, method: "GET", headers: { Accept: "application/json, text/plain, */*" } });
  if (response.status < 200 || response.status >= 300) {
    throw new ScraperError(mapHttpStatus(response.status), `HTTP ${response.status}`);
  }
  return response.body;
}

function getJson(url: string): Json {
  const body = get(url);
  try {
    const parsed = JSON.parse(body);
    return asRecord(parsed);
  } catch {
    throw new ScraperError("PARSING_ERROR", `response from ${url} is not a JSON object`);
  }
}

function runExport<T>(fn: () => T): string {
  try {
    return JSON.stringify(ok(fn()));
  } catch (error) {
    if (error instanceof ScraperError) {
      return JSON.stringify(fail(error.code, error.message));
    }
    if (error instanceof MakiNukiHttpError) {
      const code = ERROR_CODES.includes(error.code as ErrorCode)
        ? (error.code as ErrorCode)
        : mapHttpStatus(error.status ?? 0);
      return JSON.stringify(fail(code, error.message));
    }
    return JSON.stringify(fail("PARSING_ERROR", error instanceof Error ? error.message : String(error)));
  }
}

function utf8Bytes(value: string): number[] {
  const bytes: number[] = [];
  for (let index = 0; index < value.length; index++) {
    let code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff && index + 1 < value.length) {
      const next = value.charCodeAt(index + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        code = 0x10000 + ((code - 0xd800) << 10) + (next - 0xdc00);
        index++;
      }
    }
    if (code < 0x80) {
      bytes.push(code);
    } else if (code < 0x800) {
      bytes.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
    } else if (code < 0x10000) {
      bytes.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
    } else {
      bytes.push(
        0xf0 | (code >> 18),
        0x80 | ((code >> 12) & 0x3f),
        0x80 | ((code >> 6) & 0x3f),
        0x80 | (code & 0x3f),
      );
    }
  }
  return bytes;
}

function base64Encode(value: string): string {
  const bytes = utf8Bytes(value);
  let output = "";
  for (let index = 0; index < bytes.length; index += 3) {
    const first = bytes[index] ?? 0;
    const second = bytes[index + 1] ?? 0;
    const third = bytes[index + 2] ?? 0;
    const chunk = (first << 16) | (second << 8) | third;
    output += BASE64_ALPHABET[(chunk >> 18) & 0x3f];
    output += BASE64_ALPHABET[(chunk >> 12) & 0x3f];
    if (index + 1 < bytes.length) output += BASE64_ALPHABET[(chunk >> 6) & 0x3f];
    if (index + 2 < bytes.length) output += BASE64_ALPHABET[chunk & 0x3f];
  }
  return output;
}

// A direct reading-list link maps to the pair of path segments that follows
// the site's read prefix; external gallery links map to a generated gist slug.
function resolveDeepLink(query: string): { source: string; slug: string } | null {
  const value = query.trim();
  if (value.startsWith("cubari:")) {
    const rest = value.slice("cubari:".length);
    const slash = rest.indexOf("/");
    if (slash <= 0) return null;
    return { source: rest.slice(0, slash), slug: rest.slice(slash + 1) };
  }
  if (!value.startsWith("http")) return null;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  const host = url.hostname;
  const segments = url.pathname.split("/").filter((segment) => segment.length > 0);
  if (segments.length >= 3 && host.endsWith("cubari.moe")) {
    return { source: segments[1], slug: segments[2] };
  }
  if (segments.length >= 2 && host.endsWith("imgur.com") && (segments[0] === "a" || segments[0] === "gallery")) {
    return { source: "imgur", slug: segments[1] };
  }
  if (segments.length >= 2 && host.endsWith("reddit.com") && segments[0] === "gallery") {
    return { source: "reddit", slug: segments[1] };
  }
  if (segments.length >= 2 && host === "imgchest.com" && segments[0] === "p") {
    return { source: "imgchest", slug: segments[1] };
  }
  if (segments.length >= 2 && host.endsWith("catbox.moe") && segments[0] === "c") {
    return { source: "catbox", slug: segments[1] };
  }
  if (host.endsWith(".githubusercontent.com")) {
    const source = host.split(".")[0];
    return { source: "gist", slug: base64Encode(`${source}${url.pathname}`) };
  }
  return null;
}

// A series locator is the source and slug pair that follows the read prefix.
function seriesLocator(input: string): { source: string; slug: string } | null {
  const value = input.trim();
  const path = value.startsWith("http") ? new URL(value).pathname : value;
  const segments = path.split("/").filter((segment) => segment.length > 0);
  const index = segments.indexOf("read");
  const parts = index >= 0 ? segments.slice(index + 1) : segments;
  if (parts.length < 2) return null;
  return { source: parts[0], slug: parts[1] };
}

function seriesUrl(locator: { source: string; slug: string }): string {
  return `${WEB}/read/api/${locator.source}/series/${locator.slug}/`;
}

function statusOf(value: string): MangaDetails["status"] {
  switch (value.toLowerCase()) {
    case "ongoing":
    case "releasing":
      return "Ongoing";
    case "completed":
    case "complete":
      return "Completed";
    case "hiatus":
      return "Hiatus";
    case "cancelled":
    case "canceled":
    case "discontinued":
      return "Cancelled";
    default:
      return "Unknown";
  }
}

function coverOf(series: Json): string | undefined {
  const cover = asString(series["cover"]) || asString(series["coverUrl"]);
  return cover.length > 0 ? cover : undefined;
}

function mangaFrom(series: Json, locator: { source: string; slug: string }): MangaItem {
  const item: MangaItem = {
    id: `${locator.source}/${locator.slug}`,
    title: cleanText(asString(series["title"])),
    url: `${WEB}/read/${locator.source}/${locator.slug}`,
  };
  const cover = coverOf(series);
  if (cover) item.coverUrl = cover;
  return item;
}

function normalizeChapterKey(value: string): string {
  return value.replace(/^0+(?!$)/, "");
}

function pagesFromPayload(payload: unknown): PageItem[] {
  const entries = asArray(payload);
  return entries.map((entry, index): PageItem => {
    const url = typeof entry === "string" ? entry : asString(asRecord(entry)["src"]);
    if (url.length === 0) {
      throw new ScraperError("PARSING_ERROR", "chapter page missing an image source");
    }
    return { index, url, isScrambled: false };
  });
}

export function get_metadata(): I32 {
  Host.outputString(JSON.stringify(metadata));
  return 0;
}

export function get_filters(): I32 {
  Host.outputString(JSON.stringify(FILTERS));
  return 0;
}

export function search(): I32 {
  const input = JSON.parse(Host.inputString()) as SearchQuery;
  const page = typeof input.page === "number" && input.page >= 1 ? input.page : 1;
  Host.outputString(
    runExport(() => {
      const locator = resolveDeepLink(input.query ?? "");
      if (!locator || page > 1) {
        const empty: PageResult<MangaItem> = { page, hasNextPage: false, items: [] };
        return empty;
      }
      const series = getJson(seriesUrl(locator));
      const result: PageResult<MangaItem> = { page, hasNextPage: false, items: [mangaFrom(series, locator)] };
      return result;
    }),
  );
  return 0;
}

export function get_details(): I32 {
  const input = JSON.parse(Host.inputString()) as string;
  Host.outputString(
    runExport(() => {
      const locator = seriesLocator(input);
      if (!locator) {
        throw new ScraperError("NOT_FOUND", "empty series locator");
      }
      const series = getJson(seriesUrl(locator));
      const title = cleanText(asString(series["title"]));
      if (title.length === 0) {
        throw new ScraperError("NOT_FOUND", `no series for ${locator.source}/${locator.slug}`);
      }
      const details: MangaDetails = {
        id: `${locator.source}/${locator.slug}`,
        title,
        status: statusOf(asString(series["status"])),
        chapters: [],
      };
      const cover = coverOf(series);
      if (cover) details.coverUrl = cover;
      const description = asString(series["description"]);
      const tagIndex = description.indexOf("Tags: ");
      const summary = cleanText(tagIndex >= 0 ? description.slice(0, tagIndex) : description);
      if (summary.length > 0) details.description = summary;
      const genres = tagIndex >= 0
        ? description
            .slice(tagIndex + "Tags: ".length)
            .split(",")
            .map((entry) => cleanText(entry))
            .filter((entry) => entry.length > 0)
        : [];
      if (genres.length > 0) details.genres = genres;
      const author = cleanText(asString(series["author"]));
      if (author.length > 0) details.authors = [author];
      const artist = cleanText(asString(series["artist"]));
      if (artist.length > 0) details.artists = [artist];

      const groupNames = asRecord(series["groups"]);
      const chapters = asRecord(series["chapters"]);
      const collected: ChapterItem[] = [];
      for (const [chapterKey, chapterValue] of Object.entries(chapters)) {
        const chapter = asRecord(chapterValue);
        const groups = asRecord(chapter["groups"]);
        const releaseDates = asRecord(chapter["release_date"]);
        const volume = asString(chapter["volume"]);
        const volumeLabel = ["", "null", "Uncategorized"].includes(volume) ? "" : volume;
        const chapterTitle = cleanText(asString(chapter["title"]));
        const number = Number.isFinite(Number(chapterKey)) ? Number(chapterKey) : null;
        for (const [groupKey, groupValue] of Object.entries(groups)) {
          const item: ChapterItem = {
            id: `${locator.source}/${locator.slug}/${chapterKey}/${groupKey}`,
            number,
            language: "en",
          };
          const name = cleanText(asString(groupNames[groupKey]));
          if (name.length > 0) item.scanlator = name;
          let label = "";
          if (volumeLabel.length > 0) label += `Vol.${volumeLabel} `;
          label += `Ch.${chapterKey}`;
          if (chapterTitle.length > 0) label += ` - ${chapterTitle}`;
          item.title = label;
          const released = releaseDates[groupKey];
          if (typeof released === "number" && Number.isFinite(released)) {
            item.uploadedAt = released * 1000;
          }
          if (Array.isArray(groupValue)) {
            item.url = `${WEB}/read/${locator.source}/${locator.slug}/${chapterKey}/${groupKey}`;
          } else if (typeof groupValue === "string") {
            item.url = groupValue;
          }
          collected.push(item);
        }
      }
      collected.sort((left, right) => (right.number ?? -1) - (left.number ?? -1));
      details.chapters = collected;
      return details;
    }),
  );
  return 0;
}

export function get_pages(): I32 {
  const input = JSON.parse(Host.inputString()) as string;
  Host.outputString(
    runExport(() => {
      const value = input.trim();
      if (value.length === 0) {
        throw new ScraperError("NOT_FOUND", "empty chapter locator");
      }
      if (value.startsWith("http")) {
        const payload = JSON.parse(get(value)) as unknown;
        return pagesFromPayload(payload);
      }
      const segments = value
        .replace(/^\/+/, "")
        .split("/")
        .filter((segment) => segment.length > 0);
      if (segments.length < 4) {
        throw new ScraperError("NOT_FOUND", "chapter locator must carry a series and a chapter");
      }
      const locator = { source: segments[0], slug: segments[1] };
      const series = getJson(seriesUrl(locator));
      const chapters = asRecord(series["chapters"]);
      const chapter = asRecord(chapters[normalizeChapterKey(segments[2])]);
      const groups = asRecord(chapter["groups"]);
      const entry = groups[segments[3]];
      if (entry === undefined) {
        throw new ScraperError("NOT_FOUND", `no pages for chapter ${segments[2]}`);
      }
      if (Array.isArray(entry)) {
        return pagesFromPayload(entry);
      }
      if (typeof entry === "string") {
        const payload = JSON.parse(get(entry)) as unknown;
        return pagesFromPayload(payload);
      }
      throw new ScraperError("PARSING_ERROR", "chapter entry is neither a page list nor a page list URL");
    }),
  );
  return 0;
}