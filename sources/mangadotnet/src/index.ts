/// <reference path="./index.d.ts" />

import {
  cleanText,
  fail,
  fetch,
  ok,
  parseChapterNumber,
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

const WEB = "https://mangadot.net";
const API = `${WEB}/api`;
const SEARCH_LIMIT = 56;
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
  id: "mangadotnet",
  name: "Mangadotnet",
  version: "1.0.0",
  abiVersion: 1,
  lang: "multi",
  baseUrl: WEB,
  iconUrl: `${WEB}/favicon.ico`,
  nsfw: false,
  allowedHosts: ["mangadot.net"],
};

const ORIGINS = [
  { label: "Manga", value: "JP" },
  { label: "Manhwa", value: "KR" },
  { label: "Manhua", value: "CN" },
  { label: "OEL", value: "EN" },
  { label: "One Shot", value: "ONESHOT" },
];

const GENRES = [
  "Action",   "Adult",   "Adventure",   "Aliens",   "Animals",   "Avant Garde",   "Award Winning",   "BDSM",   "Boys Love",   "Boys' Love",   "Bully",   "Business",   "Comedy",   "Comic",   "Cooking",   "Crazy MC",   "Crime",   "Crossdressing",   "Cultivation",   "Delinquents",   "Demons",   "Doujinshi",   "Drama",   "Ecchi",   "Erotica",   "Fantasy",   "Female Protagonist",   "Femdom",   "Fight",   "Game",   "Gender Bender",   "Genderswap",   "Genius MC",   "Genres",   "Ghosts",   "Girls Love",   "Girls' Love",   "Gore",   "Gourmet",   "Gyaru",   "Harem",   "Hentai",   "Historical",   "Horror",   "Hunters",   "Idol",   "Incest",   "Isekai",   "Loli",   "Lolicon",   "Mafia",   "Magic",   "Magical Girls",   "Mahou Shoujo",   "Manga",   "Manhwa",   "Martial Arts",   "Mature",   "Mecha",   "Medical",   "Military",   "Monster Girls",   "Monsters",   "Murim",   "Music",   "Mystery",   "Ninja",   "Office Romance",   "Office Worker",   "Office Workers",   "One Shot",   "Oneshot",   "Overpowered",   "Philosophical",   "playboy",   "Police",   "Politics",   "Post-Apocalyptic",   "Psychological",   "Regression",   "Reincarnation",   "Revenge",   "Reverse Harem",   "Romance",   "Samurai",   "School",   "School Life",   "Sci-Fi",   "Shota",   "Shotacon",   "Shoujo Ai",   "SHOUNEN",   "Shounen Ai",   "Slice of Life",   "Slice_of_life",   "Smut",   "Sports",   "Superhero",   "Supernatural",   "Survival",   "Suspense",   "System",   "Thriller",   "Time Travel",   "Tower",   "Tragedy",   "uncensored",   "Vampires",   "Video Games",   "Villainess",   "Virtual Reality",   "Webtoon",   "Workplace",   "Yaoi",   "Yuri",   "Zombies",
];

const FILTERS: FilterSchema[] = [
  {
    id: "browse",
    title: "Browse",
    type: "select",
    options: [
      { label: "None", value: "" },
      { label: "Most tracked", value: "most-tracked" },
      { label: "Top rated", value: "top-rated" },
      { label: "Latest updates", value: "latest-updates" },
      { label: "Recently added", value: "recently-added" },
    ],
    default: "",
  },
  {
    id: "sort",
    title: "Sort by",
    type: "select",
    options: [
      { label: "Relevance", value: "" },
      { label: "Latest update", value: "latest" },
      { label: "Alphabetical", value: "alphabetical" },
      { label: "Total chapters", value: "chapters" },
      { label: "Most viewed", value: "views" },
      { label: "Most tracked", value: "tracked" },
      { label: "Top rated", value: "rating" },
    ],
    default: "",
  },
  {
    id: "order",
    title: "Sort order",
    type: "select",
    options: [
      { label: "Descending", value: "desc" },
      { label: "Ascending", value: "asc" },
    ],
    default: "desc",
  },
  {
    id: "status",
    title: "Status",
    type: "select",
    options: [
      { label: "Any status", value: "" },
      { label: "Ongoing", value: "Ongoing" },
      { label: "Completed", value: "Completed" },
      { label: "Hiatus", value: "Hiatus" },
    ],
    default: "",
  },
  {
    id: "volumes",
    title: "Volumes",
    type: "select",
    options: [
      { label: "Any", value: "" },
      { label: "Has volumes", value: "1" },
      { label: "No volumes", value: "0" },
    ],
    default: "",
  },
  {
    id: "content_rating",
    title: "Content rating",
    type: "tri_state",
    options: [
      { label: "Safe", value: "safe" },
      { label: "Suggestive", value: "suggestive" },
      { label: "Erotica", value: "erotica" },
      { label: "Pornographic", value: "pornographic" },
    ],
  },
  { id: "types", title: "Types", type: "tri_state", options: ORIGINS },
  {
    id: "demographics",
    title: "Demographics",
    type: "tri_state",
    options: [
      { label: "Josei", value: "Josei" },
      { label: "Seinen", value: "Seinen" },
      { label: "Shoujo", value: "Shoujo" },
      { label: "Shounen", value: "Shounen" },
    ],
  },
  { id: "genres", title: "Genres", type: "tri_state", options: GENRES.map((genre) => ({ label: genre, value: genre })) },
  { id: "year_min", title: "Minimum year", type: "text", placeholder: "e.g. 2015", default: "" },
  { id: "year_max", title: "Maximum year", type: "text", placeholder: "e.g. 2024", default: "" },
  { id: "min_chapters", title: "Minimum chapters", type: "text", placeholder: "e.g. 50", default: "" },
  { id: "author", title: "Author", type: "text", placeholder: "", default: "" },
  { id: "artist", title: "Artist", type: "text", placeholder: "", default: "" },
];

type Json = Record<string, unknown>;

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

function get(url: string): string {
  const response = fetch({ url, method: "GET", headers: { Accept: "application/json, text/plain, */*" } });
  if (response.status < 200 || response.status >= 300) {
    throw new ScraperError(mapHttpStatus(response.status), `HTTP ${response.status}`);
  }
  return response.body;
}

function getJson(url: string): unknown {
  const body = get(url);
  try {
    return JSON.parse(body) as unknown;
  } catch {
    throw new ScraperError("PARSING_ERROR", `response from ${url} is not JSON`);
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

// The .data endpoints return a flattened payload in which every node is an
// index into the top-level array: arrays hold element indices, objects hold
// key-name indices and value indices, and negative indices mean null. The
// resolver expands that graph into ordinary JSON.
function decodeRsc(value: unknown): unknown {
  if (!Array.isArray(value)) {
    throw new ScraperError("PARSING_ERROR", "flattened payload is not an array");
  }
  const flat = value as unknown[];
  const cache = new Map<number, unknown>();
  const nil = Symbol("nil");
  const resolve = (index: number): unknown => {
    if (index < 0 || index >= flat.length) return null;
    if (cache.has(index)) {
      const cached = cache.get(index);
      return cached === nil ? null : cached;
    }
    const element = flat[index];
    let result: unknown;
    if (element === null || element === undefined) {
      result = null;
    } else if (Array.isArray(element)) {
      result = element.map((entry) => resolve(Number(entry) ?? -1) ?? null);
    } else if (typeof element === "object") {
      const record: Json = {};
      for (const [rawKey, rawValue] of Object.entries(element as Json)) {
        const keyIndex = Number(rawKey.replace(/^_/, ""));
        const key = flat[keyIndex];
        record[typeof key === "string" ? key : String(key)] = resolve(Number(rawValue) ?? -1) ?? null;
      }
      result = record;
    } else {
      result = element;
    }
    cache.set(index, result ?? nil);
    return result;
  };
  return resolve(0);
}

function getRsc(url: string, route?: string): Json {
  const decoded = asRecord(decodeRsc(getJson(url)));
  if (route === undefined) return decoded;
  const scoped = decoded[route];
  if (scoped === undefined) {
    throw new ScraperError("PARSING_ERROR", `route ${route} is absent from the payload`);
  }
  return asRecord(scoped);
}

function stringList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((entry) => cleanText(asString(entry))).filter((entry) => entry.length > 0);
  }
  if (typeof value === "string" && value.trim().length > 0) {
    try {
      return stringList(JSON.parse(value));
    } catch {
      return [cleanText(value)];
    }
  }
  return [];
}

function absoluteUrl(value: string): string | undefined {
  if (value.length === 0) return undefined;
  if (value.startsWith("http://") || value.startsWith("https://")) return value;
  return `${WEB}${value.startsWith("/") ? "" : "/"}${value}`;
}

function statusOf(value: string): MangaDetails["status"] {
  switch (value.trim().toLowerCase()) {
    case "ongoing":
      return "Ongoing";
    case "completed":
    case "finished":
      return "Completed";
    case "hiatus":
      return "Hiatus";
    case "cancelled":
    case "canceled":
    case "dropped":
      return "Cancelled";
    default:
      return "Unknown";
  }
}

function browseManga(value: unknown): MangaItem | null {
  const record = asRecord(value);
  const id = asNumber(record["id"]);
  const title = cleanText(asString(record["title"]));
  if (id === null || title.length === 0) return null;
  const item: MangaItem = { id: String(id), title, url: `${WEB}/manga/${id}` };
  const cover = absoluteUrl(asString(record["photo"]));
  if (cover) item.coverUrl = cover;
  return item;
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

function seriesLocator(input: string): string {
  const value = input.trim();
  if (value.startsWith("http")) {
    const segments = new URL(value).pathname.split("/").filter((segment) => segment.length > 0);
    const index = segments.indexOf("manga");
    if (index >= 0 && index + 1 < segments.length) return segments[index + 1];
    return segments.length > 0 ? segments[segments.length - 1] : "";
  }
  return value.replace(/^\/?(manga\/)?/, "").split("#")[0];
}

function searchUrl(query: string, page: number, filters: Json): string {
  const url = new URL(`${API}/search`);
  if (query.trim().length > 0) url.searchParams.set("search", query.trim());
  url.searchParams.set("page", String(page));
  url.searchParams.set("limit", String(SEARCH_LIMIT));

  const sort = asString(filters["sort"]);
  if (sort.length > 0) {
    url.searchParams.set("sortBy", sort);
  } else if (query.trim().length === 0) {
    url.searchParams.set("sortBy", "latest");
  }
  url.searchParams.set("sortOrder", asString(filters["order"]) === "asc" ? "asc" : "desc");

  const status = asString(filters["status"]);
  if (status.length > 0) url.searchParams.set("status", status);
  const volumes = asString(filters["volumes"]);
  if (volumes.length > 0) url.searchParams.set("has_volumes", volumes);

  const ratings = stateMap(filters, "content_rating");
  if (ratings.include.length > 0 || ratings.exclude.length > 0) {
    url.searchParams.set(
      "content_rating",
      [...ratings.include, ...ratings.exclude.map((value) => `-${value}`)].join(","),
    );
  }

  const types = stateMap(filters, "types");
  if (types.include.length > 0 && types.include.length < ORIGINS.length) {
    url.searchParams.set("origin", types.include.join(","));
  }

  const demographics = stateMap(filters, "demographics");
  const genres = stateMap(filters, "genres");
  const genreValues = [
    ...demographics.include,
    ...demographics.exclude.map((value) => `-${value}`),
    ...genres.include,
    ...genres.exclude.map((value) => `-${value}`),
  ];
  if (genreValues.length > 0) url.searchParams.set("genres", genreValues.join(","));

  for (const [id, parameter] of [
    ["year_min", "year_min"],
    ["year_max", "year_max"],
    ["min_chapters", "min_chapters"],
    ["author", "author"],
    ["artist", "artist"],
  ] as Array<[string, string]>) {
    const value = asString(filters[id]).trim();
    if (value.length > 0) url.searchParams.set(parameter, value);
  }
  return url.toString();
}

function viewAllUrl(mode: string, page: number): string {
  const url = new URL(`${WEB}/view-all/${mode}.data`);
  url.searchParams.set("adult", "both");
  url.searchParams.set("_routes", "pages/ViewAllPage");
  if (page > 1) url.searchParams.set("page", String(page));
  for (const origin of ORIGINS) url.searchParams.append("origin", origin.value);
  return url.toString();
}

// A chapter locator is "<source>:<id>"; volumes are addressed as
// "volume:<id>".
function chapterLocator(record: Json): string {
  const id = asString(record["id"]) || String(asNumber(record["id"]) ?? "");
  const isVolume = record["isVolume"] === true;
  const source = asString(record["source"]) || "user";
  return isVolume ? `volume:${id}` : `${source}:${id}`;
}

function parseChapterLocator(input: string): { id: string; source: string; isVolume: boolean } {
  const value = input.trim();
  if (value.startsWith("{")) {
    const record = asRecord(JSON.parse(value) as unknown);
    const id = asString(record["id"]) || String(asNumber(record["id"]) ?? "");
    const isVolume = record["isVolume"] === true;
    const source = asString(record["source"]) || "user";
    if (id.length === 0) throw new ScraperError("NOT_FOUND", "chapter locator carries no id");
    return { id, source, isVolume };
  }
  const separator = value.indexOf(":");
  if (separator > 0) {
    const prefix = value.slice(0, separator);
    const id = value.slice(separator + 1);
    if (prefix === "volume") return { id, source: "user", isVolume: true };
    return { id, source: prefix, isVolume: false };
  }
  if (value.length > 0) return { id: value, source: "user", isVolume: false };
  throw new ScraperError("NOT_FOUND", "empty chapter locator");
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
  const query = input.query ?? "";
  const filters = asRecord(input.filters);
  Host.outputString(
    runExport(() => {
      const browse = asString(filters["browse"]);
      if (browse.length > 0 && query.trim().length === 0) {
        const route = getRsc(viewAllUrl(browse, page), "pages/ViewAllPage");
        const data = asRecord(asRecord(route["data"])["data"]);
        const items: MangaItem[] = [];
        for (const entry of asArray(data["manga_list"])) {
          const item = browseManga(entry);
          if (item) items.push(item);
        }
        const pagination = asRecord(data["pagination"]);
        const current = asNumber(pagination["current_page"]) ?? page;
        const total = asNumber(pagination["total_pages"]) ?? page;
        const result: PageResult<MangaItem> = { page, hasNextPage: current < total, items };
        return result;
      }

      const body = asRecord(getJson(searchUrl(query, page, filters)));
      const items: MangaItem[] = [];
      for (const entry of asArray(body["manga_list"])) {
        const item = browseManga(entry);
        if (item) items.push(item);
      }
      const pagination = asRecord(body["pagination"]);
      const current = asNumber(pagination["current_page"]) ?? page;
      const total = asNumber(pagination["total_pages"]);
      const nextCursor = asString(pagination["next_cursor"]);
      const hasNextPage = total !== null ? current < total : nextCursor.length > 0;
      const result: PageResult<MangaItem> = { page, hasNextPage, items };
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
      const route = getRsc(`${WEB}/manga/${locator}.data?_routes=pages/MangaDetailPage`, "pages/MangaDetailPage");
      const manga = asRecord(asRecord(asRecord(route["data"])["mangaData"])["manga"]);
      const title = cleanText(asString(manga["title"]));
      if (title.length === 0) {
        throw new ScraperError("NOT_FOUND", `no series for ${locator}`);
      }
      const id = asString(manga["id"]) || String(asNumber(manga["id"]) ?? locator);
      const details: MangaDetails = { id, title, status: statusOf(asString(manga["status"])), chapters: [] };
      const cover = absoluteUrl(asString(manga["photo"]));
      if (cover) details.coverUrl = cover;
      const description = cleanText(asString(manga["description"]));
      if (description.length > 0) details.description = description;
      const authors = stringList(manga["authors"]);
      if (authors.length > 0) details.authors = authors;
      const artists = stringList(manga["artists"]);
      if (artists.length > 0) details.artists = artists;
      const altTitles = stringList(manga["alt_titles"]);
      if (altTitles.length > 0) details.altTitles = altTitles;
      const genres = asArray(manga["genres"])
        .map((entry) => cleanText(asString(entry)))
        .filter((entry) => entry.length > 0);
      if (genres.length > 0) details.genres = genres;

      const chaptersUrl = `${API}/manga/${id}/chapters/list?lang=${encodeURIComponent(metadata.lang === "multi" ? "en" : metadata.lang)}`;
      const chapters = asArray(getJson(chaptersUrl));
      const collected: ChapterItem[] = [];
      for (const raw of chapters) {
        const chapter = asRecord(raw);
        const chapterId = asString(chapter["id"]) || String(asNumber(chapter["id"]) ?? "");
        const number = asNumber(chapter["chapter_number"]);
        const name = cleanText(asString(chapter["chapter_title"]));
        if (chapterId.length === 0) continue;
        const item: ChapterItem = {
          id: chapterLocator({ id: chapterId, source: chapter["source"], isVolume: false }),
          number,
        };
        if (name.length > 0) item.title = name;
        const language = asString(chapter["language"]);
        if (language.length > 0) item.language = language;
        const scanlator = cleanText(asString(chapter["group_name"]) || asString(chapter["scanlator_name"]));
        if (scanlator.length > 0) item.scanlator = scanlator;
        const uploadedAt = Date.parse(asString(chapter["date_added"]).replace(" ", "T"));
        if (Number.isFinite(uploadedAt)) item.uploadedAt = uploadedAt;
        collected.push(item);
      }
      collected.reverse();
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
      const locator = parseChapterLocator(input);
      const segment = locator.isVolume || locator.source !== "user" ? "chapters" : "uploads";
      const body = asRecord(getJson(`${API}/${segment}/${locator.id}/images`));
      const images = asArray(body["images"]);
      if (images.length === 0) {
        throw new ScraperError("PARSING_ERROR", "chapter carries no pages");
      }
      return images.map((entry, index): PageItem => {
        const url = absoluteUrl(asString(asRecord(entry)["url"]));
        if (!url) {
          throw new ScraperError("PARSING_ERROR", "chapter page missing an image source");
        }
        return { index, url, isScrambled: false };
      });
    }),
  );
  return 0;
}