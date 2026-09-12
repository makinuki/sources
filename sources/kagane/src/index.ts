/// <reference path="./index.d.ts" />

import {
  fail,
  fetch,
  ok,
  parseChapterNumber,
  storageGet,
  storageSet,
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

const WEB = "https://kagane.to";
const API = `${WEB}/api/v2`;
const PER_PAGE = 35;
const CONTENT_RATINGS = ["safe", "suggestive", "erotica", "pornographic"];
const INTEGRITY_KEY = "kagane.integrity";
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
  id: "kagane",
  name: "Kagane",
  version: "1.0.1",
  abiVersion: 1,
  lang: "multi",
  baseUrl: WEB,
  iconUrl: `${WEB}/favicon.ico`,
  nsfw: false,
  allowedHosts: ["kagane.to", "kagane.org", "yuzuki.kagane.org"],
};

// Language codes the catalogue accepts as a content language.
const LANGUAGES = [
  "en",
  "ja",
  "ko",
  "zh-Hans",
  "zh-Hant",
  "es",
  "es-419",
  "fr",
  "de",
  "pt",
  "pt-br",
  "ru",
  "it",
  "id",
  "vi",
  "th",
  "pl",
  "hi",
  "ar",
];

const SORTS: Array<{ label: string; value: string }> = [
  { label: "Relevance", value: "" },
  { label: "Popular (total views)", value: "total_views" },
  { label: "Popular (average views)", value: "avg_views" },
  { label: "Popular (today)", value: "avg_views_today" },
  { label: "Popular (week)", value: "avg_views_week" },
  { label: "Popular (month)", value: "avg_views_month" },
  { label: "Latest", value: "updated_at" },
  { label: "Name", value: "series_name" },
  { label: "Book count", value: "books_count" },
  { label: "Created", value: "created_at" },
];

const FILTERS: FilterSchema[] = [
  { id: "sort", title: "Sort by", type: "select", options: SORTS, default: "" },
  { id: "sort_descending", title: "Descending order", type: "checkbox", default: true },
  {
    id: "source_type",
    title: "Releases",
    type: "select",
    options: [
      { label: "Official and scanlations", value: "all" },
      { label: "Official only", value: "official" },
    ],
    default: "all",
  },
  {
    id: "language",
    title: "Language",
    type: "select",
    options: [{ label: "Any", value: "" }, ...LANGUAGES.map((code) => ({ label: code, value: code }))],
    default: "",
  },
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

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function mapHttpStatus(status: number): ErrorCode {
  if (status === 401) return "SESSION_REQUIRED";
  if (status === 403) return "CLOUDFLARE_BLOCKED";
  if (status === 404) return "NOT_FOUND";
  if (status === 429) return "RATE_LIMITED";
  if (status === 507) return "SESSION_REQUIRED";
  if (status >= 500) return "SOURCE_OFFLINE";
  return "NETWORK_TIMEOUT";
}

function request(url: string, method: string, body: string | null, headers: Record<string, string>): string {
  const response = fetch({
    url,
    method,
    headers: { Accept: "application/json", ...headers },
    body,
  });
  if (response.status < 200 || response.status >= 300) {
    throw new ScraperError(mapHttpStatus(response.status), `HTTP ${response.status}`);
  }
  return response.body;
}

function requestJson(url: string, method: string, payload: unknown, headers: Record<string, string> = {}): RecordObject {
  const body = payload === null ? null : JSON.stringify(payload);
  const extra = body === null ? headers : { "Content-Type": "application/json", ...headers };
  return asRecord(JSON.parse(request(url, method, body, extra)));
}

// The catalogue hands out a short lived integrity token that the reader
// endpoints require. It is cached in plugin storage so a restart does not
// force a fresh handshake.
function integrityToken(): string {
  const cached = storageGet(INTEGRITY_KEY);
  if (cached !== null) {
    const parsed = asRecord(JSON.parse(cached));
    const token = asString(parsed["token"]);
    const expiresAt = Number(parsed["expiresAt"] ?? 0);
    if (token.length > 0 && expiresAt > Date.now()) {
      return token;
    }
  }
  // A document request primes the session before the integrity call.
  fetch({ url: `${WEB}/`, method: "GET" });
  const response = requestJson(`${WEB}/api/integrity`, "POST", {});
  const token = asString(response["token"]);
  if (token.length === 0) {
    throw new ScraperError("PARSING_ERROR", "integrity response carried no token");
  }
  const exp = Number(response["exp"] ?? 0);
  const expiresAt = exp > 1e12 ? exp : exp * 1000;
  storageSet(INTEGRITY_KEY, JSON.stringify({ token, expiresAt: expiresAt > 0 ? expiresAt : Date.now() + 600000 }));
  return token;
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

function coverUrl(imageId: unknown): string | undefined {
  const id = asString(imageId);
  return id.length === 0 ? undefined : `${API}/image/${id}`;
}

// A series locator is a bare catalogue id, an absolute page, or a root
// relative page. Every shape resolves to the id the catalogue uses.
function seriesId(input: string): string {
  const value = input.trim();
  if (value.length === 0) return "";
  const path = value.startsWith("http") ? new URL(value).pathname : value;
  const segments = path.split("/").filter((segment) => segment.length > 0);
  const index = segments.indexOf("series");
  if (index >= 0 && index + 1 < segments.length) return segments[index + 1];
  return segments[segments.length - 1] ?? value;
}

// A chapter locator is a book id, or a reader page whose trailing segment is
// the book id.
function bookId(input: string): string {
  const value = input.trim();
  const path = value.startsWith("http") ? new URL(value).pathname : value;
  const segments = path.split("/").filter((segment) => segment.length > 0);
  return segments[segments.length - 1] ?? value;
}

function createMangaItem(book: RecordObject): MangaItem {
  const item: MangaItem = {
    id: asString(book["series_id"]),
    title: asString(book["title"]).trim(),
  };
  const cover = coverUrl(book["cover_image_id"]);
  if (cover) item.coverUrl = cover;
  item.url = `${WEB}/series/${item.id}`;
  return item;
}

function chapterNumber(book: RecordObject): number | null {
  const raw = asString(book["chapter_no"]).trim();
  if (raw.length > 0) {
    const parsed = parseChapterNumber(raw);
    if (parsed !== null) return parsed;
  }
  const sortNo = Number(book["sort_no"]);
  return Number.isFinite(sortNo) ? sortNo : null;
}

function createChapterItem(book: RecordObject, seriesIdentifier: string): ChapterItem {
  const id = asString(book["book_id"]);
  const item: ChapterItem = { id, number: chapterNumber(book) };
  const volume = asString(book["volume_no"]).trim();
  if (volume.length > 0) {
    const parsed = parseChapterNumber(volume);
    if (parsed !== null) item.volume = Math.trunc(parsed);
  }
  const title = asString(book["title"]).trim();
  if (title.length > 0) item.title = title;
  const language = asString(book["content_lang"]).trim();
  if (language.length > 0) item.language = language;
  const uploaded = Date.parse(asString(book["created_at"]));
  if (Number.isFinite(uploaded)) item.uploadedAt = uploaded;
  const scanlator = asArray(book["groups"])
    .map((group) => asString(asRecord(group)["title"]).trim())
    .filter((name) => name.length > 0)
    .join(", ");
  if (scanlator.length > 0) item.scanlator = scanlator;
  item.url = `${WEB}/series/${seriesIdentifier}/reader/${id}`;
  return item;
}

function statusOf(value: unknown): MangaDetails["status"] {
  switch (asString(value).toUpperCase()) {
    case "ONGOING":
      return "Ongoing";
    case "COMPLETED":
      return "Completed";
    case "HIATUS":
      return "Hiatus";
    case "ABANDONED":
    case "CANCELLED":
    case "CANCELED":
      return "Cancelled";
    default:
      return "Unknown";
  }
}

function searchBody(query: string, filters: RecordObject): RecordObject {
  const body: RecordObject = {
    content_rating: CONTENT_RATINGS,
    source_type: filters["source_type"] === "official" ? ["Official"] : ["Official", "Unofficial", "Mixed"],
  };
  const trimmed = query.trim();
  if (trimmed.length > 0) body["title"] = trimmed;
  const language = asString(filters["language"]).trim();
  if (language.length > 0) {
    body["content_lang"] = language === "zh-Hans" || language === "zh-Hant" ? ["zh-Hans", "zh-Hant"] : [language];
  }
  return body;
}

function sortParam(filters: RecordObject): string {
  const base = asString(filters["sort"]).trim();
  if (base.length === 0) return "";
  return filters["sort_descending"] === false ? base : `${base},desc`;
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
      const url = new URL(`${API}/search/series`);
      url.searchParams.set("page", String(page - 1));
      url.searchParams.set("size", String(PER_PAGE));
      const sort = sortParam(filters);
      if (sort.length > 0) url.searchParams.set("sort", sort);
      const response = requestJson(url.toString(), "POST", searchBody(input.query ?? "", filters));
      const items = asArray(response["content"]).map((entry) => createMangaItem(asRecord(entry)));
      const totalPages = Number(response["total_pages"] ?? 0);
      const result: PageResult<MangaItem> = {
        page,
        hasNextPage: response["last"] === true ? false : totalPages > page,
        items,
      };
      return result;
    }),
  );
  return 0;
}

export function get_details(): I32 {
  const input = JSON.parse(Host.inputString()) as string;
  Host.outputString(
    runExport(() => {
      const id = seriesId(input);
      if (id.length === 0) {
        throw new ScraperError("NOT_FOUND", "empty series locator");
      }
      const data = requestJson(`${API}/series/${id}`, "GET", null);
      const details: MangaDetails = {
        id,
        title: asString(data["title"]).trim(),
        status: statusOf(data["upload_status"]),
        chapters: [],
      };
      const description = asString(data["description"]).trim();
      if (description.length > 0) details.description = description;
      const altTitles = asArray(data["series_alternate_titles"])
        .map((entry) => asString(asRecord(entry)["title"]).trim())
        .filter((title) => title.length > 0);
      if (altTitles.length > 0) details.altTitles = altTitles;
      const staff = asArray(data["series_staff"]).map((entry) => asRecord(entry));
      const namesByRole = (role: string): string[] =>
        staff
          .filter((member) => asString(member["role"]).toLowerCase() === role)
          .map((member) => asString(member["name"]).trim())
          .filter((name, index, all) => name.length > 0 && all.indexOf(name) === index);
      const authors = namesByRole("author");
      if (authors.length > 0) details.authors = authors;
      const artists = namesByRole("artist");
      if (artists.length > 0) details.artists = artists;
      const genres = asArray(data["genres"])
        .map((entry) => asString(asRecord(entry)["genre_name"]).trim())
        .filter((name, index, all) => name.length > 0 && all.indexOf(name) === index);
      const format = asString(data["format"]).trim();
      if (format.length > 0) genres.unshift(format);
      if (genres.length > 0) details.genres = genres;
      const covers = asArray(data["series_covers"])
        .map((entry) => coverUrl(asRecord(entry)["image_id"]))
        .filter((url): url is string => typeof url === "string");
      if (covers.length > 0) {
        details.coverUrl = covers[0];
        if (covers.length > 1) details.covers = covers.slice(1).map((url) => ({ url }));
      }
      details.chapters = asArray(data["series_books"]).map((entry) => createChapterItem(asRecord(entry), id));
      return details;
    }),
  );
  return 0;
}

export function get_pages(): I32 {
  const input = JSON.parse(Host.inputString()) as string;
  Host.outputString(
    runExport(() => {
      const id = bookId(input);
      if (id.length === 0) {
        throw new ScraperError("NOT_FOUND", "empty chapter locator");
      }
      const challenge = requestJson(`${API}/books/${id}?is_datasaver=false`, "POST", {}, {
        "x-integrity-token": integrityToken(),
      });
      const token = asString(challenge["access_token"]);
      const cacheUrl = asString(challenge["cache_url"]).replace(/\/+$/, "");
      const pages = asArray(asRecord(challenge["manifest"])["pages"]);
      if (token.length === 0 || cacheUrl.length === 0 || pages.length === 0) {
        throw new ScraperError("PARSING_ERROR", "chapter manifest is incomplete");
      }
      return pages.map((entry, index): PageItem => {
        const page = asRecord(entry);
        const pageId = asString(page["page_id"]);
        const ext = asString(page["ext"]) || "jxl";
        if (pageId.length === 0) {
          throw new ScraperError("PARSING_ERROR", "chapter page missing id");
        }
        return {
          index,
          url: `${cacheUrl}/api/v2/books/page/${id}/${pageId}.${ext}?token=${encodeURIComponent(token)}`,
          isScrambled: false,
        };
      });
    }),
  );
  return 0;
}