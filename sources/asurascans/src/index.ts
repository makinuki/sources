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

const API = "https://api.asurascans.com/api";
const WEB = "https://asurascans.com";
const PER_PAGE_LIMIT = 20;
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

type RecordObject = Record<string, unknown>;

class ScraperError extends Error {
  readonly code: ErrorCode;

  constructor(code: ErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

function asRecord(value: unknown, fallback: RecordObject = {}): RecordObject {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as RecordObject) : fallback;
}

function asArray(value: unknown, fallback: unknown[] = []): unknown[] {
  return Array.isArray(value) ? value : fallback;
}

function mapHttpStatus(status: number): ErrorCode {
  if (status === 401) return "SESSION_REQUIRED";
  if (status === 403) return "CLOUDFLARE_BLOCKED";
  if (status === 404) return "NOT_FOUND";
  if (status === 429) return "RATE_LIMITED";
  if (status >= 500) return "SOURCE_OFFLINE";
  return "NETWORK_TIMEOUT";
}

function request(url: string): string {
  const response = fetch({ url, method: "GET", headers: { Accept: "*/*" } });
  if (response.status < 200 || response.status >= 300) {
    throw new ScraperError(mapHttpStatus(response.status), `HTTP ${response.status}`);
  }
  return response.body;
}

function requestJson(url: string): RecordObject {
  return asRecord(JSON.parse(request(url)));
}

function requestHtml(url: string): string {
  return request(url);
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
    if (error instanceof SyntaxError || error instanceof TypeError) {
      return JSON.stringify(fail("PARSING_ERROR", error.message));
    }
    return JSON.stringify(fail("PARSING_ERROR", error instanceof Error ? error.message : String(error)));
  }
}

function unescapeHtmlAttr(input: string): string {
  return input
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function unwrapAstro(value: unknown): unknown {
  if (Array.isArray(value)) {
    if (value.length === 0 || value.length === 1) return null;
    if (value.length === 2 && (typeof value[0] === "number" || value[0] === null)) {
      return unwrapAstro(value[1]);
    }
    return value.map(unwrapAstro);
  }
  if (typeof value === "object" && value !== null) {
    const result: RecordObject = {};
    for (const [key, item] of Object.entries(value as RecordObject)) {
      result[key] = unwrapAstro(item);
    }
    return result;
  }
  return value;
}

function islandProps(html: string): RecordObject[] {
  const props: RecordObject[] = [];
  const pattern = /<astro-island[^>]*props="([^"]*)"[^>]*>/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(html)) !== null) {
    try {
      const parsed = JSON.parse(unescapeHtmlAttr(match[1]));
      props.push(asRecord(unwrapAstro(parsed)));
    } catch {
      // skip malformed island props
    }
  }
  return props;
}

function findIsland(html: string, predicate: (props: RecordObject) => boolean): RecordObject {
  for (const props of islandProps(html)) {
    if (predicate(props)) return props;
  }
  throw new ScraperError("PARSING_ERROR", "required astro island props not found on page");
}

const metadata: SourceMetadata = {
  id: "asurascans",
  name: "Asura Scans",
  version: "0.1.0",
  abiVersion: 1,
  lang: "en",
  baseUrl: WEB,
  iconUrl: "https://asurascans.com/favicon.ico",
  nsfw: false,
};

const GENRES: Array<{ name: string; slug: string }> = [
  { name: "Action", slug: "action" },
  { name: "Adventure", slug: "adventure" },
  { name: "Comedy", slug: "comedy" },
  { name: "Crazy MC", slug: "crazy-mc" },
  { name: "Dark Fantasy", slug: "dark-fantasy" },
  { name: "Demon", slug: "demon" },
  { name: "Drama", slug: "drama" },
  { name: "Dungeons", slug: "dungeons" },
  { name: "Fantasy", slug: "fantasy" },
  { name: "Game", slug: "game" },
  { name: "Genius MC", slug: "genius-mc" },
  { name: "Isekai", slug: "isekai" },
  { name: "Kuchikuchi", slug: "kuchikuchi" },
  { name: "Magic", slug: "magic" },
  { name: "Martial Arts", slug: "martial-arts" },
  { name: "Murim", slug: "murim" },
  { name: "Mystery", slug: "mystery" },
  { name: "Necromancer", slug: "necromancer" },
  { name: "Overpowered", slug: "overpowered" },
  { name: "Psychological", slug: "psychological" },
  { name: "Regression", slug: "regression" },
  { name: "Reincarnation", slug: "reincarnation" },
  { name: "Revenge", slug: "revenge" },
  { name: "Romance", slug: "romance" },
  { name: "School Life", slug: "school-life" },
  { name: "Sci-fi", slug: "sci-fi" },
  { name: "Shoujo", slug: "shoujo" },
  { name: "Shounen", slug: "shounen" },
  { name: "System", slug: "system" },
  { name: "Tower", slug: "tower" },
  { name: "Tragedy", slug: "tragedy" },
  { name: "Villain", slug: "villain" },
  { name: "Violence", slug: "violence" },
];

const FILTERS: FilterSchema[] = (() => {
  const result: FilterSchema[] = [];
  result.push({
    id: "sort",
    title: "Sort By",
    type: "select",
    options: [
      { label: "Latest Update", value: "latest_desc" },
      { label: "Popular", value: "popular_desc" },
      { label: "Rating", value: "rating_desc" },
      { label: "A-Z", value: "title_asc" },
      { label: "Newest", value: "update_desc" },
    ],
    default: "latest_desc",
  });
  result.push({
    id: "status",
    title: "Status",
    type: "select",
    options: [
      { label: "All", value: "" },
      { label: "Ongoing", value: "ongoing" },
      { label: "Completed", value: "completed" },
      { label: "Hiatus", value: "hiatus" },
      { label: "Dropped", value: "dropped" },
      { label: "Axed", value: "axed" },
    ],
    default: "",
  });
  result.push({
    id: "type",
    title: "Type",
    type: "select",
    options: [
      { label: "All", value: "" },
      { label: "Manhwa", value: "manhwa" },
      { label: "Manhua", value: "manhua" },
      { label: "Manga", value: "manga" },
    ],
    default: "",
  });
  for (const genre of GENRES) {
    result.push({ id: genre.slug, title: genre.name, type: "checkbox", default: false });
  }
  result.push({ id: "min_chapters", title: "Min Chapters", type: "text", placeholder: "e.g. 20" });
  return result;
})();

interface NormalizedFilters {
  sort: string;
  order: string;
  status: string;
  type: string;
  genres: string;
  minChapters: string;
}

function normalizeFilters(raw: RecordObject | undefined): NormalizedFilters {
  const value = (key: string, fallback: string): string => {
    const item = raw?.[key];
    return typeof item === "string" ? item : fallback;
  };
  const sortValue = value("sort", "latest_desc");
  const [sort, order] = sortValue.split("_") as [string, string];
  const checked = GENRES.filter((genre) => raw?.[genre.slug] === true)
    .map((genre) => genre.slug)
    .join(",");
  return {
    sort: sort || "latest",
    order: order && (order === "asc" || order === "desc") ? order : "desc",
    status: value("status", ""),
    type: value("type", ""),
    genres: checked,
    minChapters: value("min_chapters", ""),
  };
}

function addParams(url: URL, params: Record<string, string | undefined>) {
  for (const [key, item] of Object.entries(params)) {
    if (item !== undefined && item.length > 0) url.searchParams.append(key, item);
  }
}

function searchUrl(query: string, page: number, filters: NormalizedFilters): string {
  const url = new URL(`${API}/series`);
  addParams(url, {
    offset: String(PER_PAGE_LIMIT * (page - 1)),
    limit: String(PER_PAGE_LIMIT),
    search: query.trim(),
    sort: filters.sort,
    order: filters.order,
    status: filters.status,
    type: filters.type,
    genres: filters.genres,
    min_chapters: filters.minChapters,
  });
  return url.toString();
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function createMangaItem(data: RecordObject): MangaItem {
  const slug = asString(data["slug"]);
  const item: MangaItem = {
    id: slug,
    title: cleanText(asString(data["title"])) || "Untitled",
    coverUrl: asString(data["cover"]),
    url: `${WEB}${asString(data["public_url"])}`,
  };
  const latest = asArray(data["latest_chapters"])[0];
  const latestNumber = asNumber(asRecord(latest)["number"]);
  if (latestNumber !== null) item.latestChapter = "Ch. " + String(latestNumber);
  return item;
}

function altTitlesFrom(value: unknown): string[] {
  const result: string[] = [];
  if (Array.isArray(value)) {
    for (const entry of value) {
      const text = cleanText(asString(entry));
      if (text.length > 0 && !result.includes(text)) result.push(text);
    }
    return result;
  }
  const text = asString(value);
  if (text.length === 0) return result;
  for (const entry of text.split("•")) {
    const trimmed = cleanText(entry);
    if (trimmed.length > 0 && !result.includes(trimmed)) result.push(trimmed);
  }
  return result;
}

function parseStatus(status: unknown): MangaDetails["status"] {
  switch (asString(status).toLowerCase()) {
    case "ongoing":
      return "Ongoing";
    case "completed":
      return "Completed";
    case "hiatus":
      return "Hiatus";
    case "dropped":
    case "axed":
      return "Cancelled";
    default:
      return "Unknown";
  }
}

function formatNumber(number: number): string {
  return String(number).replace(/\.0$/, "");
}

function chapterNumber(number: unknown): number | null {
  const raw = asNumber(number);
  if (raw !== null) return raw;
  const parsed = parseFloat(asString(number));
  return Number.isFinite(parsed) ? parsed : null;
}

function createChapterItem(
  data: RecordObject,
  randomSlug: string,
  seriesSlug: string,
): ChapterItem | null {
  const number = chapterNumber(data["number"]);
  if (number === null) return null;
  if (data["is_premium"] === true) return null;
  const numberStr = formatNumber(number);
  const chapterUrl = `${WEB}/comics/${randomSlug}/chapter/${numberStr}`;
  const item: ChapterItem = {
    id: chapterUrl,
    number,
    title: `Chapter ${numberStr}`,
    url: chapterUrl,
  };
  const createdAt = asString(data["published_at"]);
  const parsed = Date.parse(createdAt);
  if (!Number.isNaN(parsed) && parsed >= 0) item.uploadedAt = parsed;
  return item;
}

function createMangaDetails(count: RecordObject, slug: string): MangaDetails {
  const details: MangaDetails = {
    id: slug,
    title: cleanText(asString(count["title"])) || "Untitled",
    status: parseStatus(count["status"]),
    coverUrl: asString(count["coverUrl"]),
    chapters: [],
  };

  const altTitles = altTitlesFrom(count["alternativeTitles"]);
  if (altTitles.length > 0) details.altTitles = altTitles;

  const description = cleanText(asString(count["description"]));
  const rank = asNumber(count["popularityRank"]);
  const rating = asNumber(count["rating"]);
  if (description.length > 0 || rank !== null || rating !== null) {
    const parts: string[] = [];
    if (description.length > 0) parts.push(description);
    if (rank !== null) parts.push(`Rank: #${rank}`);
    if (rating !== null) parts.push(`Rating: ${rating.toFixed(2)}`);
    details.description = parts.join("\n\n");
  }

  const author = cleanText(asString(count["author"]));
  if (author.length > 0) details.authors = [author];
  const artist = cleanText(asString(count["artist"]));
  if (artist.length > 0) details.artists = [artist];

  const genres = asArray(count["genres"])
    .map((genre) => cleanText(asString(asRecord(genre)["name"])))
    .filter((genre) => genre.length > 0)
    .filter((genre, index, all) => all.indexOf(genre) === index);
  if (genres.length > 0) details.genres = genres;

  return details;
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
      const filters = normalizeFilters(asRecord(input.filters));
      const response = requestJson(searchUrl(input.query, page, filters));
      const items = asArray(response["data"]).map((entry) => createMangaItem(asRecord(entry)));
      const hasMore = asRecord(response["meta"])["has_more"] === true;
      const total = Number(asRecord(response["meta"])["total"] ?? 0);
      const result: PageResult<MangaItem> = {
        page,
        hasNextPage: hasMore || total > page * PER_PAGE_LIMIT,
        items,
      };
      return result;
    }),
  );
  return 0;
}

export function get_details(): I32 {
  const slug = JSON.parse(Host.inputString()) as string;
  Host.outputString(
    runExport(() => {
      const html = requestHtml(`${WEB}/comics/${slug}`);
      const metaIsland = findIsland(
        html,
        (props) => typeof props["title"] !== "undefined" && typeof props["description"] !== "undefined",
      );
      const chaptersIsland = findIsland(html, (props) => props["chapters"] !== undefined && props["publicUrl"] !== undefined);
      const details = createMangaDetails(metaIsland, slug);
      const publicUrl = asString(chaptersIsland["publicUrl"]);
      const segments = publicUrl.split("/").filter((part) => part.length > 0);
      const randomSlug = segments.length > 0 ? segments[segments.length - 1] : slug;
      details.chapters = asArray(chaptersIsland["chapters"])
        .map((entry) => createChapterItem(asRecord(entry), randomSlug, details.id))
        .filter((chapter): chapter is ChapterItem => chapter !== null);
      return details;
    }),
  );
  return 0;
}

export function get_pages(): I32 {
  const chapterUrl = JSON.parse(Host.inputString()) as string;
  Host.outputString(
    runExport(() => {
      const html = requestHtml(chapterUrl);
      const island = findIsland(html, (props) => props["pages"] !== undefined);
      const pages = asArray(island["pages"]).map((entry, index): PageItem => {
        const page = asRecord(entry);
        const url = asString(page["url"]);
        if (url.length === 0) {
          throw new ScraperError("PARSING_ERROR", "chapter page missing image url");
        }
        const item: PageItem = { index, url, isScrambled: false };
        const tiles = asArray(page["tiles"]);
        if (tiles.length > 0) {
          const order = tiles.map((tile) => Number(tile)).filter((tile) => Number.isFinite(tile));
          item.isScrambled = true;
          item.metadata = {
            layout: "custom",
            rows: Number(page["tile_rows"] ?? 0),
            cols: Number(page["tile_cols"] ?? 0),
            tileW: 0,
            tileH: 0,
            order,
          };
        }
        return item;
      });
      if (pages.length === 0) {
        throw new ScraperError("PARSING_ERROR", "chapter has no pages");
      }
      return pages;
    }),
  );
  return 0;
}