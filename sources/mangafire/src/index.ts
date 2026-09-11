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

const WEB = "https://mangafire.to";
const SEARCH_LIMIT = 50;
const CHAPTER_PAGE_SIZE = 200;
const CHAPTER_PAGE_CAP = 20;
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
  id: "mangafire",
  name: "MangaFire",
  version: "1.0.0",
  abiVersion: 1,
  lang: "multi",
  baseUrl: WEB,
  iconUrl: `${WEB}/assets/mangafire/favicon.svg`,
  nsfw: false,
  allowedHosts: ["mangafire.to", "mfcdn.nl", "static.mfcdn.nl", "cdn.mfcdn.nl"],
};

const STATUSES = [
  { label: "Releasing", value: "releasing" },
  { label: "Finished", value: "finished" },
  { label: "On hiatus", value: "on_hiatus" },
  { label: "Discontinued", value: "discontinued" },
  { label: "Not yet released", value: "not_yet_released" },
];
const GENRES = [
  { label: "Action", value: "1" },
  { label: "Adult", value: "268929" },
  { label: "Adventure", value: "78" },
  { label: "Avant Garde", value: "3" },
  { label: "Boys Love", value: "4" },
  { label: "Comedy", value: "5" },
  { label: "Crime", value: "268921" },
  { label: "Demons", value: "77" },
  { label: "Drama", value: "6" },
  { label: "Ecchi", value: "7" },
  { label: "Fantasy", value: "79" },
  { label: "Girls Love", value: "9" },
  { label: "Gourmet", value: "10" },
  { label: "Harem", value: "11" },
  { label: "Hentai", value: "268930" },
  { label: "Historical", value: "268922" },
  { label: "Horror", value: "530" },
  { label: "Isekai", value: "13" },
  { label: "Iyashikei", value: "531" },
  { label: "Josei", value: "15" },
  { label: "Kids", value: "532" },
  { label: "Magic", value: "539" },
  { label: "Magical Girls", value: "268923" },
  { label: "Mahou Shoujo", value: "533" },
  { label: "Martial Arts", value: "534" },
  { label: "Mature", value: "268931" },
  { label: "Mecha", value: "19" },
  { label: "Medical", value: "268924" },
  { label: "Military", value: "535" },
  { label: "Music", value: "21" },
  { label: "Mystery", value: "22" },
  { label: "Parody", value: "23" },
  { label: "Philosophical", value: "268925" },
  { label: "Psychological", value: "536" },
  { label: "Reverse Harem", value: "25" },
  { label: "Romance", value: "26" },
  { label: "School", value: "73" },
  { label: "Sci-Fi", value: "28" },
  { label: "Seinen", value: "537" },
  { label: "Shoujo", value: "30" },
  { label: "Shounen", value: "31" },
  { label: "Slice of Life", value: "538" },
  { label: "Smut", value: "268932" },
  { label: "Space", value: "33" },
  { label: "Sports", value: "34" },
  { label: "Super Power", value: "75" },
  { label: "Superhero", value: "268926" },
  { label: "Supernatural", value: "76" },
  { label: "Suspense", value: "37" },
  { label: "Thriller", value: "38" },
  { label: "Tragedy", value: "268927" },
  { label: "Vampire", value: "39" },
  { label: "Wuxia", value: "268928" },
];

const THEMES = [
  { label: "Aliens", value: "268933" },
  { label: "Animals", value: "268934" },
  { label: "Cooking", value: "268935" },
  { label: "Crossdressing", value: "268936" },
  { label: "Delinquents", value: "268937" },
  { label: "Demons", value: "268938" },
  { label: "Genderswap", value: "268939" },
  { label: "Ghosts", value: "268940" },
  { label: "Gyaru", value: "268941" },
  { label: "Harem", value: "268942" },
  { label: "Incest", value: "268943" },
  { label: "Loli", value: "268944" },
  { label: "Mafia", value: "268945" },
  { label: "Magic", value: "268946" },
  { label: "Martial Arts", value: "268947" },
  { label: "Military", value: "268948" },
  { label: "Monster Girls", value: "268949" },
  { label: "Monsters", value: "268950" },
  { label: "Music", value: "268951" },
  { label: "Ninja", value: "268952" },
  { label: "Office Workers", value: "268953" },
  { label: "Police", value: "268954" },
  { label: "Post-Apocalyptic", value: "268955" },
  { label: "Reincarnation", value: "268956" },
  { label: "Reverse Harem", value: "268957" },
  { label: "Samurai", value: "268958" },
  { label: "School Life", value: "268959" },
  { label: "Shota", value: "268960" },
  { label: "Supernatural", value: "268961" },
  { label: "Survival", value: "268962" },
  { label: "Time Travel", value: "268963" },
  { label: "Traditional Games", value: "268964" },
  { label: "Vampires", value: "268965" },
  { label: "Video Games", value: "268966" },
  { label: "Villainess", value: "268967" },
  { label: "Virtual Reality", value: "268968" },
  { label: "Zombies", value: "268969" },
];

const TYPES = [
  { label: "Manga", value: "manga" },
  { label: "Manhwa", value: "manhwa" },
  { label: "Manhua", value: "manhua" },
  { label: "Other", value: "other" },
];

const FILTERS: FilterSchema[] = [
  {
    id: "sort",
    title: "Sort by",
    type: "select",
    options: [
      { label: "Latest update", value: "chapter_updated_at:desc" },
      { label: "Best match", value: "relevance:desc" },
      { label: "Recently added", value: "created_at:desc" },
      { label: "Title (A-Z)", value: "title:asc" },
      { label: "Title (Z-A)", value: "title:desc" },
      { label: "Year (newest)", value: "year:desc" },
      { label: "Year (oldest)", value: "year:asc" },
      { label: "Highest rated", value: "score:desc" },
      { label: "Most viewed all time", value: "views_total:desc" },
      { label: "Most followed", value: "follows_total:desc" },
    ],
    default: "relevance:desc",
  },
  {
    id: "match",
    title: "Genre and theme match",
    type: "select",
    options: [
      { label: "AND", value: "and" },
      { label: "OR", value: "or" },
    ],
    default: "and",
  },
  { id: "status", title: "Status", type: "tri_state", options: STATUSES },
  { id: "genres", title: "Genres", type: "tri_state", options: GENRES },
  { id: "themes", title: "Themes", type: "tri_state", options: THEMES },
  { id: "types", title: "Type", type: "tri_state", options: TYPES },
  { id: "year_from", title: "Release year from", type: "text", placeholder: "e.g. 2015", default: "" },
  { id: "year_to", title: "Release year to", type: "text", placeholder: "e.g. 2024", default: "" },
  { id: "min_chapters", title: "Minimum chapters", type: "text", placeholder: "e.g. 50", default: "" },
  { id: "author", title: "Author or artist", type: "text", placeholder: "", default: "" },
];

type Json = Record<string, unknown>;
type Param = [string, string];

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

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function mapHttpStatus(status: number): ErrorCode {
  if (status === 401) return "SESSION_REQUIRED";
  if (status === 403) return "CLOUDFLARE_BLOCKED";
  if (status === 404) return "NOT_FOUND";
  if (status === 429) return "RATE_LIMITED";
  if (status >= 500) return "SOURCE_OFFLINE";
  return "NETWORK_TIMEOUT";
}

function base64Decode(value: string): number[] {
  const clean = value.replace(/[^A-Za-z0-9+/=]/g, "");
  const bytes: number[] = [];
  let buffer = 0;
  let bits = 0;
  for (const character of clean) {
    if (character === "=") break;
    const index = BASE64_ALPHABET.indexOf(character);
    if (index < 0) continue;
    buffer = (buffer << 6) | index;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((buffer >> bits) & 0xff);
    }
  }
  return bytes;
}

function base64UrlEncode(bytes: number[]): string {
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
  return output.replace(/\+/g, "-").replace(/\//g, "_");
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

// The API rejects unsigned requests. Every signature is three substitution
// stages seeded by published tables, keyed with the request path and the
// sorted query string.
const STAGE_TABLES = [
  "yINlmUNho8VYJT+ibTIP+9ESiULpVEtMOoD6U6lRE0R/xwXo/Xp9NrUgC4cw/Lmo33vUyjUE40kUoEWIr/fxfNNcq2s79ShQ5NhNrFnJ4hXPwOu/SuXzIbuTQKGFvfm08E9jvCfqAtoDqvQq3dVWPQFmJjgvkISBeXY3BgANR+yVnjGbcxZ47d6kLNfZPIayTq3/YGySb1KuVZodWp/WGNAO5pfMcpaK53Hhs0allBszaMaxuouOwdxbwgxIw6YunSsXjI05Yi0j9j4eHKfSXR8Ifo/Od+8iamRfCXTyvm7NGRGYdcQ0ywcK/u6RXhrbcCm4t2eCtrDgQVecJGkQ+A==",
  "IUFltCxD3Oc2cwCgkJffthaOg9cgPUb0LgW6H/VtfcF0kc5F25t+aWj6JH9VOhOaY0rAFdUxlDnl5BLNvwEJvQtP5qcw7vdb/K+chnbwnspSHT8mz5lqwz41TezG0hkO06FTjJZhsyNuFLDpD2ZZxQj/QIRcF90zpmQ7Byu483WsQqUE0C342HL+JXngRB6fRzxRyVTaKu83h7UYTJ0QMt6ixFh6S3F8gqkKwrGTL3jHNBsD45UnifK8+RGtishQV2K3rujLKEkiZxpr2dYcudFW4oFsDKhad3CLBvuyTqsCo4B7mL5IKQ1vXo/MOOvq1I1d8ar9X6Ttu5KF4fZgiA==",
  "NQHlu1/wVO5EmkwQymF810qqY2xG1k2obcas4Z9mCsPEIFl9pRIjFxbJ7ybMHbBckT5Ton85E0FOeHezbh/mjlEYpmpnlXOS8dgrqeq2KfxImTh1YK9y0PeMNhzA1OQzSY9brYOJq/l2QnE/hwOeZIhPixVSKIUlDb5vLcH6RWKxkIEMuP0bDwIqQ71AJJaEaMJL7A6YtyIwoRT+L5v4aZzodN/0+3nOGsfblFjgxSfPzVDjNFeNl5P26+kEC/8AHgdrpAbt3hHz3HrRN1Y6e+JHgF7ncFWnoF0y3THL1S71WgWGCa6KtSzTCCG58n68nTyj2T3Sshk7utqCtMi/ZQ==",
];

const STAGE_KEYS = [
  "0Ec58JOY3uBzJK9m3zqIOpdlF7UFiax9DmA=",
  "AAdjb1iPY8CiDmq9H34tKTBF8a3oDQ==",
  "DELOJgPsVaCcblDtTGMdHzM=",
];

const STAGE_SEEDS = [0x5a, 0x35, 0xba];

function signEnvironment(path: string): string {
  let data = utf8Bytes(path);
  for (let stage = 0; stage < STAGE_TABLES.length; stage++) {
    const table = base64Decode(STAGE_TABLES[stage]);
    const key = base64Decode(STAGE_KEYS[stage]);
    const output: number[] = [];
    let previous = STAGE_SEEDS[stage];
    for (let index = 0; index < data.length; index++) {
      previous = table[(data[index] ^ key[index % key.length] ^ previous) & 0xff];
      output.push(previous);
    }
    data = output;
  }
  return base64UrlEncode(data);
}

function sortParams(params: Param[]): Param[] {
  return [...params].sort((left, right) => (left[0] < right[0] ? -1 : left[0] > right[0] ? 1 : 0));
}

function signedParamString(params: Param[]): string {
  const parts: string[] = [];
  let lastKey = "";
  let index = 0;
  for (const [key, value] of params) {
    let name = key;
    if (key.endsWith("[]")) {
      if (lastKey !== key) index = 0;
      lastKey = key;
      name = key.replace("[]", `[${index++}]`);
    }
    parts.push(`${name}=${value}`);
  }
  return parts.join("&");
}

function apiGet(path: string, params: Param[]): Json {
  const sorted = sortParams(params);
  const canonical = signedParamString(sorted);
  const signature = signEnvironment(canonical.length > 0 ? `${path}?${canonical}` : path);
  const query = sorted.map(([key, value]) => `${key}=${encodeURIComponent(value)}`);
  query.push(`vrf=${signature}`);
  const url = `${WEB}/api${path}?${query.join("&")}`;
  const response = fetch({ url, method: "GET", headers: { Accept: "application/json" } });
  if (response.status < 200 || response.status >= 300) {
    throw new ScraperError(mapHttpStatus(response.status), `HTTP ${response.status}`);
  }
  try {
    return asRecord(JSON.parse(response.body));
  } catch {
    throw new ScraperError("PARSING_ERROR", `response from ${path} is not JSON`);
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

function posterOf(record: Json): string | undefined {
  const poster = asRecord(record["poster"]);
  const candidates = [poster["large"], poster["medium"], poster["small"]];
  for (const candidate of candidates) {
    const value = asString(candidate);
    if (value.length > 0) return value;
  }
  return undefined;
}

function statusOf(value: string): MangaDetails["status"] {
  switch (value.trim().toLowerCase()) {
    case "releasing":
      return "Ongoing";
    case "finished":
      return "Completed";
    case "on_hiatus":
    case "hiatus":
      return "Hiatus";
    case "discontinued":
      return "Cancelled";
    default:
      return "Unknown";
  }
}

function stateMap(filters: Json, id: string): { include: string[]; exclude: string[] } {
  const state = asRecord(filters[id]);
  const include: string[] = [];
  const exclude: string[] = [];
  for (const [value, flag] of Object.entries(state)) {
    if (flag === "+") include.push(value);
    if (flag === "-") exclude.push(value);
  }
  return { include, exclude };
}

// A series locator is the identifier slug that follows the title prefix.
function seriesLocator(input: string): string {
  const value = input.trim();
  if (!value.startsWith("http")) return value.replace(/^\/?(title\/)?/, "").split("/")[0];
  const segments = new URL(value).pathname.split("/").filter((segment) => segment.length > 0);
  const index = segments.indexOf("title");
  const raw = index >= 0 && index + 1 < segments.length ? segments[index + 1] : segments[segments.length - 1] ?? "";
  return raw.includes(".") ? raw.slice(raw.lastIndexOf(".") + 1) : raw;
}

function searchUrl(query: string, page: number, filters: Json, authorId: string | null): { path: string; params: Param[] } {
  const params: Param[] = [
    ["page", String(page)],
    ["limit", String(SEARCH_LIMIT)],
  ];
  if (query.trim().length > 0) params.push(["keyword", query.trim()]);
  if (authorId !== null) params.push(["authors[]", authorId]);

  const [sortKey, sortDirection] = (asString(filters["sort"]) || "relevance:desc").split(":");
  params.push([`order[${sortKey}]`, sortDirection === "asc" ? "asc" : "desc"]);

  const mode = asString(filters["match"]) === "or" ? "or" : "and";
  params.push(["genres_mode", mode]);
  params.push(["theme_mode", mode]);

  const statuses = stateMap(filters, "status");
  for (const value of statuses.include) params.push(["statuses[]", value]);

  const genres = stateMap(filters, "genres");
  for (const value of genres.include) params.push(["genres_in[]", value]);
  for (const value of genres.exclude) params.push(["genres_ex[]", value]);

  const themes = stateMap(filters, "themes");
  themes.include.forEach((value) => params.push(["theme_ids[]", value]));

  const types = stateMap(filters, "types");
  for (const value of types.include) params.push(["types[]", value]);

  const yearFrom = asString(filters["year_from"]).trim();
  if (/^\d+$/.test(yearFrom)) params.push(["year_from", yearFrom]);
  const yearTo = asString(filters["year_to"]).trim();
  if (/^\d+$/.test(yearTo)) params.push(["year_to", yearTo]);
  const minChapters = asString(filters["min_chapters"]).trim();
  if (/^\d+$/.test(minChapters)) params.push(["min_chap", minChapters]);

  return { path: "/titles", params };
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
      const filters = asRecord(input.filters);
      let authorId: string | null = null;
      const authorQuery = asString(filters["author"]).trim();
      if (authorQuery.length > 0) {
        const tags = apiGet("/tags", [["keyword", authorQuery]]);
        for (const entry of asArray(tags["data"])) {
          const tag = asRecord(entry);
          const type = asString(tag["type"]);
          if (type === "author" || type === "artist") {
            const id = asNumber(tag["id"]);
            if (id !== null) {
              authorId = String(id);
              break;
            }
          }
        }
        if (authorId === null) {
          const empty: PageResult<MangaItem> = { page, hasNextPage: false, items: [] };
          return empty;
        }
      }

      const request = searchUrl(input.query ?? "", page, filters, authorId);
      const body = apiGet(request.path, request.params);
      const items: MangaItem[] = [];
      for (const entry of asArray(body["items"])) {
        const record = asRecord(entry);
        const hid = asString(record["hid"]);
        const title = cleanText(asString(record["title"]));
        if (hid.length === 0 || title.length === 0) continue;
        const item: MangaItem = { id: hid, title, url: `${WEB}/title/${hid}` };
        const cover = posterOf(record);
        if (cover) item.coverUrl = cover;
        items.push(item);
      }
      const meta = asRecord(body["meta"]);
      const result: PageResult<MangaItem> = { page, hasNextPage: meta["hasNext"] === true, items };
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
      if (locator.length === 0) {
        throw new ScraperError("NOT_FOUND", "empty series locator");
      }
      const body = apiGet(`/titles/${encodeURIComponent(locator)}`, []);
      const data = asRecord(body["data"]);
      const title = cleanText(asString(data["title"]));
      if (title.length === 0) {
        throw new ScraperError("NOT_FOUND", `no series for ${locator}`);
      }
      const details: MangaDetails = {
        id: asString(data["hid"]) || locator,
        title,
        status: statusOf(asString(data["status"])),
        chapters: [],
      };
      const cover = posterOf(data);
      if (cover) details.coverUrl = cover;
      const description = cleanText(asString(data["synopsisHtml"]));
      if (description.length > 0) details.description = description;
      const authors = asArray(data["authors"])
        .map((entry) => cleanText(asString(asRecord(entry)["title"])))
        .filter((entry) => entry.length > 0);
      if (authors.length > 0) details.authors = authors;
      const artists = asArray(data["artists"])
        .map((entry) => cleanText(asString(asRecord(entry)["title"])))
        .filter((entry) => entry.length > 0);
      if (artists.length > 0) details.artists = artists;
      const genres = [
        ...asArray(data["genres"]).map((entry) => cleanText(asString(asRecord(entry)["title"]))),
        ...asArray(data["themes"]).map((entry) => cleanText(asString(asRecord(entry)["title"]))),
      ].filter((entry) => entry.length > 0);
      if (genres.length > 0) details.genres = genres;

      const hid = details.id;
      const collected: ChapterItem[] = [];
      let chapterPage = 1;
      let lastPage = 1;
      do {
        const chapterBody = apiGet(`/titles/${encodeURIComponent(hid)}/chapters`, [
          ["language", "en"],
          ["sort", "number"],
          ["order", "desc"],
          ["page", String(chapterPage)],
          ["limit", String(CHAPTER_PAGE_SIZE)],
        ]);
        for (const entry of asArray(chapterBody["items"])) {
          const record = asRecord(entry);
          const id = asNumber(record["id"]);
          const number = asNumber(record["number"]);
          if (id === null) continue;
          const name = cleanText(asString(record["name"]));
          const item: ChapterItem = { id: `c:${id}`, number, language: "en" };
          if (name.length > 0) item.title = name;
          const scanlator = asString(record["type"]);
          item.scanlator = scanlator.length > 0 ? scanlator : "Unknown";
          const createdAt = asNumber(record["createdAt"]);
          if (createdAt !== null) item.uploadedAt = createdAt * 1000;
          collected.push(item);
        }
        const meta = asRecord(chapterBody["meta"]);
        lastPage = asNumber(meta["lastPage"]) ?? chapterPage;
        chapterPage++;
      } while (chapterPage <= lastPage && chapterPage <= CHAPTER_PAGE_CAP);
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
      const locator = input.trim();
      const separator = locator.indexOf(":");
      if (separator <= 0) {
        throw new ScraperError("NOT_FOUND", "chapter locator must be <kind>:<id>");
      }
      const kind = locator.slice(0, separator);
      const id = locator.slice(separator + 1);
      if (!/^\d+$/.test(id)) {
        throw new ScraperError("NOT_FOUND", "chapter locator carries no numeric id");
      }
      const segment = kind === "v" ? "volumes" : "chapters";
      const body = apiGet(`/${segment}/${id}`, []);
      const pages = asArray(asRecord(body["data"])["pages"]);
      if (pages.length === 0) {
        throw new ScraperError("PARSING_ERROR", "chapter carries no pages");
      }
      return pages.map((entry, index): PageItem => {
        const url = asString(asRecord(entry)["url"]);
        if (url.length === 0) {
          throw new ScraperError("PARSING_ERROR", "chapter page missing an image source");
        }
        return { index, url, isScrambled: false };
      });
    }),
  );
  return 0;
}