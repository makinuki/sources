/// <reference path="./index.d.ts" />

import {
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

const WEB = "https://atsu.moe";
const PER_PAGE = 40;
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
  id: "atsumaru",
  name: "Atsumaru",
  version: "1.0.0",
  abiVersion: 1,
  lang: "en",
  baseUrl: WEB,
  iconUrl: `${WEB}/favicon.ico`,
  nsfw: false,
  allowedHosts: ["atsu.moe"],
};

const GENRES: Array<{ id: string; name: string }> = [
  { id: "39", name: "Action" },
  { id: "46", name: "Adult" },
  { id: "37", name: "Adventure" },
  { id: "180", name: "Boys Love" },
  { id: "6", name: "Comedy" },
  { id: "31", name: "Drama" },
  { id: "36", name: "Fantasy" },
  { id: "4", name: "Girls Love" },
  { id: "10", name: "Hentai" },
  { id: "45", name: "Historical" },
  { id: "44", name: "Horror" },
  { id: "29", name: "Martial Arts" },
  { id: "32", name: "Mystery" },
  { id: "18", name: "Psychological" },
  { id: "9", name: "Romance" },
  { id: "1", name: "Sci-Fi" },
  { id: "7", name: "Slice of Life" },
  { id: "41", name: "Smut" },
  { id: "22", name: "Supernatural" },
  { id: "19", name: "Thriller" },
  { id: "5", name: "Tragedy" },
];

const TYPES: Array<{ id: string; name: string }> = [
  { id: "Manga", name: "Manga" },
  { id: "Manwha", name: "Manhwa" },
  { id: "Manhua", name: "Manhua" },
  { id: "OEL", name: "OEL" },
  { id: "Other", name: "Other" },
];

const STATUSES: Array<{ id: string; name: string }> = [
  { id: "Ongoing", name: "Ongoing" },
  { id: "Completed", name: "Completed" },
  { id: "Hiatus", name: "Hiatus" },
  { id: "Canceled", name: "Canceled" },
];

const SORTS = [
  { label: "Popularity", value: "views" },
  { label: "Trending", value: "trending" },
  { label: "Date added", value: "dateAdded" },
  { label: "Release date", value: "released" },
  { label: "Top rated", value: "mbRating" },
  { label: "Title", value: "title" },
];

const FILTERS: FilterSchema[] = [
  {
    id: "genres",
    title: "Genres",
    type: "tri_state",
    options: GENRES.map((genre) => ({ label: genre.name, value: genre.id })),
  },
  {
    id: "type",
    title: "Manga type",
    type: "select",
    options: [{ label: "Any", value: "" }, ...TYPES.map((type) => ({ label: type.name, value: type.id }))],
    default: "",
  },
  {
    id: "status",
    title: "Publishing status",
    type: "select",
    options: [{ label: "Any", value: "" }, ...STATUSES.map((status) => ({ label: status.name, value: status.id }))],
    default: "",
  },
  {
    id: "sort",
    title: "Sort by",
    type: "select",
    options: SORTS,
    default: "views",
  },
  { id: "year", title: "Year", type: "text", placeholder: "e.g. 2024", default: "" },
  { id: "min_chapters", title: "Minimum chapters", type: "text", placeholder: "e.g. 50", default: "" },
  { id: "adult", title: "Include adult content", type: "checkbox", default: false },
  { id: "official", title: "Official translations only", type: "checkbox", default: false },
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
  if (status >= 500) return "SOURCE_OFFLINE";
  return "NETWORK_TIMEOUT";
}

function request(url: string): string {
  const response = fetch({ url, method: "GET", headers: { Accept: "application/json" } });
  if (response.status < 200 || response.status >= 300) {
    throw new ScraperError(mapHttpStatus(response.status), `HTTP ${response.status}`);
  }
  return response.body;
}

function requestJson(url: string): RecordObject {
  return asRecord(JSON.parse(request(url)));
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

// Artwork paths are served from the site's static prefix and may arrive as an
// absolute URL, a protocol relative URL, or a bare path.
function imageUrl(raw: unknown): string | undefined {
  const value = asString(raw).trim();
  if (value.length === 0) return undefined;
  if (value.startsWith("http")) return value.replace(/^http:\/\//, "https://");
  if (value.startsWith("//")) return `https:${value}`;
  return `${WEB}/static/${value.replace(/^\/+/, "").replace(/^static\//, "")}`;
}

function posterOf(entry: RecordObject): string | undefined {
  const large = asString(entry["largeImage"]).trim();
  if (large.length > 0) return imageUrl(large);
  const image = entry["image"];
  if (typeof image === "string") return imageUrl(image);
  const nested = asRecord(image);
  return imageUrl(nested["largeImage"] ?? nested["image"]);
}

function namesOf(value: unknown): string[] {
  return asArray(value)
    .map((item) => (typeof item === "string" ? item : asString(asRecord(item)["name"]).trim()))
    .filter((name, index, all) => name.length > 0 && all.indexOf(name) === index);
}

function mangaId(input: string): string {
  const value = input.trim();
  if (value.length === 0) return "";
  const path = value.startsWith("http") ? new URL(value).pathname : value;
  const segments = path.split("/").filter((segment) => segment.length > 0);
  const index = segments.indexOf("manga");
  if (index >= 0 && index + 1 < segments.length) return segments[index + 1];
  return segments[segments.length - 1] ?? value;
}

function createMangaItem(entry: RecordObject): MangaItem {
  const item: MangaItem = { id: asString(entry["id"]), title: asString(entry["title"]).trim() };
  const cover = posterOf(entry);
  if (cover) item.coverUrl = cover;
  item.url = `${WEB}/manga/${item.id}`;
  return item;
}

function statusOf(value: unknown): MangaDetails["status"] {
  switch (asString(value).toLowerCase().trim()) {
    case "ongoing":
      return "Ongoing";
    case "completed":
      return "Completed";
    case "hiatus":
      return "Hiatus";
    case "canceled":
    case "cancelled":
      return "Cancelled";
    default:
      return "Unknown";
  }
}

function searchUrl(query: string, page: number, filters: RecordObject): string {
  const url = new URL(`${WEB}/collections/manga/documents/search`);
  const trimmed = query.trim();
  url.searchParams.set("q", trimmed.length > 0 ? trimmed : "*");

  const clauses: string[] = ["hidden:!=true"];
  const include: string[] = [];
  const exclude: string[] = [];
  const genreStates = asRecord(filters["genres"]);
  for (const genre of GENRES) {
    const state = asString(genreStates[genre.id]);
    if (state === "+") include.push(`genreIds:=\`${genre.id}\``);
    if (state === "-") exclude.push(genre.id);
  }
  if (include.length > 0) clauses.push(include.join(" && "));
  if (exclude.length > 0) clauses.push(`genreIds:!=[${exclude.join(",")}]`);

  const type = asString(filters["type"]).trim();
  if (type.length > 0) clauses.push(`type:=[${type}]`);
  const status = asString(filters["status"]).trim();
  if (status.length > 0) clauses.push(`status:=[${status}]`);
  const year = Number(asString(filters["year"]).trim());
  if (Number.isInteger(year) && year > 0) clauses.push(`releaseYear:=[${year}]`);
  const minChapters = Number(asString(filters["min_chapters"]).trim());
  if (Number.isInteger(minChapters) && minChapters > 0) clauses.push(`chapterCount:>=${minChapters}`);
  if (filters["adult"] === true) clauses.push("isAdult:=true");
  if (filters["official"] === true) clauses.push("officialTranslation:=true");

  clauses.push("(mbContentRating:=[`Safe`,`Suggestive`,`Erotica`] || mbContentRating:!=*)");
  clauses.push("medium:!=[`Novel`]");
  clauses.push("views:>0");
  url.searchParams.set("filter_by", clauses.join(" && "));

  const sort = asString(filters["sort"]).trim();
  if (sort.length > 0) url.searchParams.set("sort_by", `${sort}:desc`);

  if (trimmed.length > 0) {
    url.searchParams.set("query_by", "title,englishTitle,otherNames,authors");
    url.searchParams.set("query_by_weights", "4,3,2,1");
    url.searchParams.set("num_typos", "4,3,2,1");
  }
  url.searchParams.set("page", String(page));
  url.searchParams.set("per_page", String(PER_PAGE));
  return url.toString();
}

function scanlatorMap(details: RecordObject): Map<string, string> {
  const map = new Map<string, string>();
  for (const entry of asArray(details["scanlators"])) {
    const record = asRecord(entry);
    map.set(asString(record["id"]), asString(record["name"]));
  }
  return map;
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
      const data = requestJson(searchUrl(input.query ?? "", page, asRecord(input.filters)));
      const hits = asArray(data["hits"]);
      if (hits.length > 0 || typeof data["found"] === "number") {
        const items = hits.map((hit) => createMangaItem(asRecord(asRecord(hit)["document"])));
        const found = Number(data["found"] ?? 0);
        const perPage = Number(asRecord(data["request_params"])["per_page"] ?? PER_PAGE);
        const result: PageResult<MangaItem> = {
          page,
          hasNextPage: perPage > 0 && page * perPage < found,
          items,
        };
        return result;
      }
      const items = asArray(data["items"]).map((entry) => createMangaItem(asRecord(entry)));
      const result: PageResult<MangaItem> = { page, hasNextPage: items.length >= PER_PAGE, items };
      return result;
    }),
  );
  return 0;
}

export function get_details(): I32 {
  const input = JSON.parse(Host.inputString()) as string;
  Host.outputString(
    runExport(() => {
      const id = mangaId(input);
      if (id.length === 0) {
        throw new ScraperError("NOT_FOUND", "empty manga locator");
      }
      const page = asRecord(requestJson(`${WEB}/api/manga/page?id=${encodeURIComponent(id)}`)["mangaPage"]);
      if (asString(page["id"]).length === 0) {
        throw new ScraperError("NOT_FOUND", `no title for ${id}`);
      }
      const details: MangaDetails = {
        id,
        title: asString(page["title"]).trim(),
        status: statusOf(page["status"]),
        chapters: [],
      };
      const synopsis = asString(page["synopsis"]).trim();
      if (synopsis.length > 0) details.description = synopsis;
      const otherNames = asArray(page["otherNames"])
        .map((name) => asString(name).trim())
        .filter((name, index, all) => name.length > 0 && name !== details.title && all.indexOf(name) === index);
      if (otherNames.length > 0) details.altTitles = otherNames;
      const authors = asArray(page["authors"]).map((entry) => asRecord(entry));
      const byType = (type: string): string[] =>
        authors
          .filter((author) => asString(author["type"]).toLowerCase() === type)
          .map((author) => asString(author["name"]).trim())
          .filter((name, index, all) => name.length > 0 && all.indexOf(name) === index);
      const authorNames = byType("author");
      if (authorNames.length > 0) details.authors = authorNames;
      const artistNames = byType("artist");
      if (artistNames.length > 0) details.artists = artistNames;
      const genres = namesOf(page["genres"]);
      const type = asString(page["type"]).trim();
      if (type.length > 0) genres.unshift(type);
      if (genres.length > 0) details.genres = genres;
      const cover = posterOf(page);
      if (cover) details.coverUrl = cover;

      const chapters = asRecord(requestJson(`${WEB}/api/manga/allChapters?mangaId=${encodeURIComponent(id)}`));
      const scanlators = scanlatorMap(page);
      details.chapters = asArray(chapters["chapters"])
        .map((entry): ChapterItem | null => {
          const chapter = asRecord(entry);
          const chapterId = asString(chapter["id"]);
          const number = Number(chapter["number"]);
          if (chapterId.length === 0) return null;
          const item: ChapterItem = {
            id: `${id}/${chapterId}`,
            number: Number.isFinite(number) ? number : parseChapterNumber(asString(chapter["title"])),
            language: "en",
          };
          const title = asString(chapter["title"]).trim();
          if (title.length > 0) item.title = title;
          const createdAt = Number(chapter["createdAt"]);
          if (Number.isFinite(createdAt) && createdAt > 0) item.uploadedAt = createdAt;
          const scanlator = scanlators.get(asString(chapter["scanlationMangaId"]));
          if (scanlator && scanlator.length > 0) item.scanlator = scanlator;
          item.url = `${WEB}/read/${id}/${chapterId}`;
          return item;
        })
        .filter((chapter): chapter is ChapterItem => chapter !== null);
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
      const path = value.startsWith("http") ? new URL(value).pathname : value;
      const segments = path.split("/").filter((segment) => segment.length > 0);
      const index = segments.indexOf("read");
      const manga = index >= 0 ? segments[index + 1] : segments[segments.length - 2];
      const chapter = segments[segments.length - 1];
      if (!manga || !chapter) {
        throw new ScraperError("NOT_FOUND", "chapter locator does not name a manga and a chapter");
      }
      const data = asRecord(
        requestJson(
          `${WEB}/api/read/chapter?mangaId=${encodeURIComponent(manga)}&chapterId=${encodeURIComponent(chapter)}`,
        )["readChapter"],
      );
      const pages = asArray(data["pages"]);
      if (pages.length === 0) {
        throw new ScraperError("PARSING_ERROR", "chapter carries no pages");
      }
      return pages.map((entry, pageIndex): PageItem => {
        const url = imageUrl(asRecord(entry)["image"]);
        if (!url) {
          throw new ScraperError("PARSING_ERROR", "chapter page missing an image path");
        }
        return { index: pageIndex, url, isScrambled: false };
      });
    }),
  );
  return 0;
}
