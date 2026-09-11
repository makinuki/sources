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

const WEB = "https://omegascans.org";
const API = "https://api.omegascans.org";
const PER_PAGE = 12;
const CHAPTER_PAGE_SIZE = 1000;
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
  id: "omegascans",
  name: "Omega Scans",
  version: "1.0.0",
  abiVersion: 1,
  lang: "en",
  baseUrl: WEB,
  iconUrl: `${WEB}/favicon.ico`,
  nsfw: true,
  allowedHosts: ["omegascans.org", "api.omegascans.org", "media.omegascans.org"],
};

const FILTERS: FilterSchema[] = [
  {
    id: "status",
    title: "Status",
    type: "select",
    options: [
      { label: "All", value: "All" },
      { label: "Ongoing", value: "Ongoing" },
      { label: "On hiatus", value: "Hiatus" },
      { label: "Dropped", value: "Dropped" },
      { label: "Completed", value: "Completed" },
      { label: "Canceled", value: "Canceled" },
    ],
    default: "All",
  },
  {
    id: "sort",
    title: "Sort by",
    type: "select",
    options: [
      { label: "Views", value: "total_views" },
      { label: "Title", value: "title" },
      { label: "Latest chapter", value: "latest" },
      { label: "Created at", value: "created_at" },
    ],
    default: "total_views",
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
  return typeof value === "number" && Number.isFinite(value) ? value : null;
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
    return asRecord(JSON.parse(body));
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

function absoluteUrl(value: string): string | undefined {
  if (value.length === 0) return undefined;
  if (value.startsWith("http://") || value.startsWith("https://")) return value;
  return `${API}${value.startsWith("/") ? "" : "/"}${value}`;
}

// A series locator is the slug that follows the site's series prefix. Series
// links on the site carry a trailing fragment with the numeric series id,
// which is dropped because the slug alone addresses the series.
function seriesLocator(input: string): string {
  const value = input.trim();
  const path = value.startsWith("http") ? new URL(value).pathname : value.split("#")[0];
  const segments = path.split("/").filter((segment) => segment.length > 0);
  const index = segments.indexOf("series");
  if (index >= 0 && index + 1 < segments.length) return segments[index + 1];
  return segments.length > 0 ? segments[segments.length - 1] : "";
}

function statusOf(value: string): MangaDetails["status"] {
  switch (value.trim().toLowerCase()) {
    case "ongoing":
      return "Ongoing";
    case "completed":
    case "finished":
      return "Completed";
    case "hiatus":
    case "on hiatus":
      return "Hiatus";
    case "dropped":
    case "canceled":
    case "cancelled":
      return "Cancelled";
    default:
      return "Unknown";
  }
}

function descriptionOf(value: string): string {
  return cleanText(value);
}

function queryUrl(query: string, page: number, filters: Json): string {
  const status = asString(filters["status"]) || "All";
  const sort = asString(filters["sort"]) || "total_views";
  const order = asString(filters["order"]) || "desc";
  const url = new URL(`${API}/query`);
  url.searchParams.set("query_string", query.trim());
  url.searchParams.set("status", status);
  url.searchParams.set("order", order);
  url.searchParams.set("orderBy", sort);
  url.searchParams.set("series_type", "Comic");
  url.searchParams.set("page", String(page));
  url.searchParams.set("perPage", String(PER_PAGE));
  url.searchParams.set("tags_ids", "[]");
  url.searchParams.set("adult", "true");
  return url.toString();
}

function mangaFrom(value: unknown): MangaItem | null {
  const record = asRecord(value);
  const slug = asString(record["series_slug"]);
  const title = asString(record["title"]);
  if (slug.length === 0 || title.length === 0) return null;
  const item: MangaItem = { id: slug, title, url: `${WEB}/series/${slug}` };
  const cover = absoluteUrl(asString(record["thumbnail"]));
  if (cover) item.coverUrl = cover;
  return item;
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
      const body = getJson(queryUrl(input.query ?? "", page, asRecord(input.filters)));
      const items: MangaItem[] = [];
      for (const entry of asArray(body["data"])) {
        const item = mangaFrom(entry);
        if (item) items.push(item);
      }
      const meta = asRecord(body["meta"]);
      const current = asNumber(meta["current_page"]) ?? page;
      const last = asNumber(meta["last_page"]) ?? page;
      const result: PageResult<MangaItem> = { page, hasNextPage: current < last, items };
      return result;
    }),
  );
  return 0;
}

export function get_details(): I32 {
  const input = JSON.parse(Host.inputString()) as string;
  Host.outputString(
    runExport(() => {
      const slug = seriesLocator(input);
      if (slug.length === 0) {
        throw new ScraperError("NOT_FOUND", "empty series locator");
      }
      const series = getJson(`${API}/series/${slug}`);
      const title = asString(series["title"]);
      if (title.length === 0) {
        throw new ScraperError("NOT_FOUND", `no series for ${slug}`);
      }
      const seriesId = asNumber(series["id"]);
      const details: MangaDetails = {
        id: slug,
        title,
        status: statusOf(asString(series["status"])),
        chapters: [],
      };
      const cover = absoluteUrl(asString(series["thumbnail"]));
      if (cover) details.coverUrl = cover;
      const description = descriptionOf(asString(series["description"]));
      if (description.length > 0) details.description = description;
      const author = cleanText(asString(series["author"]));
      if (author.length > 0) details.authors = [author];
      const artist = cleanText(asString(series["studio"]));
      if (artist.length > 0) details.artists = [artist];
      const altTitles = asArray(series["alternative_names"])
        .map((entry) => cleanText(asString(entry)))
        .filter((entry) => entry.length > 0);
      if (altTitles.length > 0) details.altTitles = altTitles;
      const genres = asArray(series["tags"])
        .map((entry) => cleanText(asString(asRecord(entry)["name"])))
        .filter((entry) => entry.length > 0);
      if (genres.length > 0) details.genres = genres;

      if (seriesId !== null) {
        const chaptersUrl = `${API}/chapter/query?page=1&perPage=${CHAPTER_PAGE_SIZE}&series_id=${seriesId}`;
        const chapterBody = getJson(chaptersUrl);
        for (const raw of asArray(chapterBody["data"])) {
          const chapter = asRecord(raw);
          const chapterSlug = asString(chapter["chapter_slug"]);
          const name = cleanText(asString(chapter["chapter_name"]));
          if (chapterSlug.length === 0 || name.length === 0) continue;
          const chapterTitle = cleanText(asString(chapter["chapter_title"]));
          const item: ChapterItem = {
            id: `${slug}/${chapterSlug}`,
            number: parseChapterNumber(name),
            language: "en",
          };
          item.title = chapterTitle.length > 0 ? `${name} - ${chapterTitle}` : name;
          const uploadedAt = Date.parse(asString(chapter["created_at"]));
          if (Number.isFinite(uploadedAt)) item.uploadedAt = uploadedAt;
          item.url = `${WEB}/series/${slug}/${chapterSlug}`;
          details.chapters.push(item);
        }
      }
      return details;
    }),
  );
  return 0;
}

export function get_pages(): I32 {
  const input = JSON.parse(Host.inputString()) as string;
  Host.outputString(
    runExport(() => {
      const locator = input.trim().replace(/^https?:\/\/[^/]+/, "").replace(/^\/+/, "");
      const segments = locator.split("/").filter((segment) => segment.length > 0);
      if (segments.length < 2) {
        throw new ScraperError("NOT_FOUND", "chapter locator must carry a series and a chapter slug");
      }
      const chapterSlug = segments[segments.length - 1];
      const seriesSlug = segments[segments.length - 2];
      const body = getJson(`${API}/chapter/${seriesSlug}/${chapterSlug}`);
      const chapter = asRecord(body["chapter"]);
      const chapterData = asRecord(chapter["chapter_data"]);
      const images = asArray(chapterData["images"]);
      if (images.length === 0) {
        if (Object.keys(chapterData).length === 0) {
          throw new ScraperError("SESSION_REQUIRED", "chapter is paywalled");
        }
        throw new ScraperError("PARSING_ERROR", "chapter carries no pages");
      }
      return images.map((entry, index): PageItem => {
        const url = absoluteUrl(asString(entry));
        if (!url) {
          throw new ScraperError("PARSING_ERROR", "chapter page missing an image source");
        }
        return { index, url, isScrambled: false };
      });
    }),
  );
  return 0;
}