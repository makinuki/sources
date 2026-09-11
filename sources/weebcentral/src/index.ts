/// <reference path="./index.d.ts" />

import {
  cleanText,
  fail,
  fetch,
  ok,
  parseChapterNumber,
  parseHTML,
  resolveUrl,
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

const WEB = "https://weebcentral.com";
const FETCH_LIMIT = 32;
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
  id: "weebcentral",
  name: "Weeb Central",
  version: "1.0.0",
  abiVersion: 1,
  lang: "en",
  baseUrl: WEB,
  iconUrl: `${WEB}/static/images/brand.png`,
  nsfw: false,
  allowedHosts: ["weebcentral.com", "temp.compsci88.com", "hot.planeptune.us", "compsci88.com"],
};

const STATUSES = ["Ongoing", "Complete", "Hiatus", "Canceled"];
const TYPES = ["Manga", "Manhwa", "Manhua", "OEL"];
const TAGS = [
  "Action",
  "Adult",
  "Adventure",
  "Comedy",
  "Doujinshi",
  "Drama",
  "Ecchi",
  "Fantasy",
  "Gender Bender",
  "Harem",
  "Hentai",
  "Historical",
  "Horror",
  "Isekai",
  "Josei",
  "Lolicon",
  "Martial Arts",
  "Mature",
  "Mecha",
  "Mystery",
  "Psychological",
  "Romance",
  "School Life",
  "Sci-fi",
  "Seinen",
  "Shotacon",
  "Shoujo",
  "Shoujo Ai",
  "Shounen",
  "Shounen Ai",
  "Slice of Life",
  "Smut",
  "Sports",
  "Supernatural",
  "Tragedy",
  "Yaoi",
  "Yuri",
  "Other",
];

const FILTERS: FilterSchema[] = [
  {
    id: "sort",
    title: "Sort",
    type: "select",
    options: [
      { label: "Best match", value: "Best Match" },
      { label: "Alphabet", value: "Alphabet" },
      { label: "Popularity", value: "Popularity" },
      { label: "Subscribers", value: "Subscribers" },
      { label: "Recently added", value: "Recently Added" },
      { label: "Latest updates", value: "Latest Updates" },
    ],
    default: "Best Match",
  },
  {
    id: "order",
    title: "Sort order",
    type: "select",
    options: [
      { label: "Descending", value: "Descending" },
      { label: "Ascending", value: "Ascending" },
    ],
    default: "Descending",
  },
  {
    id: "official",
    title: "Official translation",
    type: "select",
    options: [
      { label: "Any", value: "Any" },
      { label: "Yes", value: "True" },
      { label: "No", value: "False" },
    ],
    default: "Any",
  },
  {
    id: "anime",
    title: "Anime adaptation",
    type: "select",
    options: [
      { label: "Any", value: "Any" },
      { label: "Yes", value: "True" },
      { label: "No", value: "False" },
    ],
    default: "Any",
  },
  {
    id: "adult",
    title: "Adult content",
    type: "select",
    options: [
      { label: "Any", value: "Any" },
      { label: "Only", value: "True" },
      { label: "Exclude", value: "False" },
    ],
    default: "Any",
  },
  { id: "author", title: "Author", type: "text", placeholder: "Case sensitive", default: "" },
  {
    id: "status",
    title: "Series status",
    type: "select",
    options: [{ label: "Any", value: "" }, ...STATUSES.map((status) => ({ label: status, value: status }))],
    default: "",
  },
  {
    id: "type",
    title: "Series type",
    type: "select",
    options: [{ label: "Any", value: "" }, ...TYPES.map((type) => ({ label: type, value: type }))],
    default: "",
  },
  {
    id: "tags",
    title: "Tags",
    type: "tri_state",
    options: TAGS.map((tag) => ({ label: tag, value: tag })),
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
  const response = fetch({ url, method: "GET", headers: { Accept: "*/*" } });
  if (response.status < 200 || response.status >= 300) {
    throw new ScraperError(mapHttpStatus(response.status), `HTTP ${response.status}`);
  }
  return response.body;
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

// Cover art is announced as a picture source; the widest variant is the first
// srcset candidate. The fallback image is used when no source is present.
function coverFrom(scope: ReturnType<ReturnType<typeof parseHTML>>): string | undefined {
  const source = scope.find("source").first();
  const srcset = source.attr("srcset");
  if (typeof srcset === "string" && srcset.trim().length > 0) {
    const candidate = srcset.split(",")[0]?.trim().split(/\s+/)[0];
    if (candidate && candidate.length > 0) return candidate.replace("/small/", "/normal/");
  }
  const image = scope.find("img").first().attr("src");
  if (typeof image === "string" && image.length > 0) return image;
  return undefined;
}


// A series locator is the path segment pair that follows the site's series
// prefix, which is what the pages of a series are keyed by.
function seriesLocator(input: string): string {
  const value = input.trim();
  const path = value.startsWith("http") ? new URL(value).pathname : value;
  const segments = path.split("/").filter((segment) => segment.length > 0);
  const index = segments.indexOf("series");
  const parts = index >= 0 ? segments.slice(index + 1, index + 3) : segments.slice(0, 2);
  return parts.join("/");
}

function statusOf(value: string): MangaDetails["status"] {
  switch (value.toLowerCase().trim()) {
    case "ongoing":
      return "Ongoing";
    case "complete":
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
  const url = new URL(`${WEB}/search/data`);
  url.searchParams.set("text", query.replace(/[!#:(),-]/g, " ").trim());
  url.searchParams.set("sort", asString(filters["sort"]) || "Best Match");
  url.searchParams.set("order", asString(filters["order"]) || "Descending");
  url.searchParams.set("official", asString(filters["official"]) || "Any");
  url.searchParams.set("anime", asString(filters["anime"]) || "Any");
  url.searchParams.set("adult", asString(filters["adult"]) || "Any");
  const author = asString(filters["author"]).trim();
  if (author.length > 0) url.searchParams.set("author", author);
  const status = asString(filters["status"]).trim();
  if (status.length > 0) url.searchParams.set("included_status", status);
  const type = asString(filters["type"]).trim();
  if (type.length > 0) url.searchParams.set("included_type", type);
  const tags = asRecord(filters["tags"]);
  for (const tag of TAGS) {
    const state = asString(tags[tag]);
    if (state === "+") url.searchParams.append("included_tag", tag);
    if (state === "-") url.searchParams.append("excluded_tag", tag);
  }
  url.searchParams.set("limit", String(FETCH_LIMIT));
  url.searchParams.set("offset", String((page - 1) * FETCH_LIMIT));
  url.searchParams.set("display_mode", "Full Display");
  return url.toString();
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
      const $ = parseHTML(request(searchUrl(input.query ?? "", page, asRecord(input.filters))));
      const items: MangaItem[] = [];
      $("article > section > a").each((_, element) => {
        const anchor = $(element);
        const href = anchor.attr("href");
        const title = cleanText(anchor.find("div:not([class]):last-child").last().text());
        if (!href || title.length === 0) return;
        const item: MangaItem = { id: seriesLocator(href), title, url: href.startsWith("http") ? href : resolveUrl(WEB, href) };
        const cover = coverFrom(anchor);
        if (cover) item.coverUrl = cover;
        items.push(item);
      });
      const result: PageResult<MangaItem> = {
        page,
        hasNextPage: $("button").length > 0,
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
      const locator = seriesLocator(input);
      if (locator.length === 0) {
        throw new ScraperError("NOT_FOUND", "empty series locator");
      }
      const $ = parseHTML(request(`${WEB}/series/${locator}`));
      const sections = $("section[x-data] > section");
      const head = sections.eq(0);
      const body = sections.eq(1);
      const title = cleanText(body.find("h1").first().text());
      if (title.length === 0) {
        throw new ScraperError("NOT_FOUND", `no title for ${locator}`);
      }
      const details: MangaDetails = {
        id: locator,
        title,
        status: statusOf(head.find("ul > li:has(strong:contains(Status)) > a").first().text()),
        chapters: [],
      };
      const description = cleanText(body.find("li:has(strong:contains(Description)) > p").first().text());
      if (description.length > 0) details.description = description;
      const authors = head
        .find("ul > li:has(strong:contains(Author)) > span > a")
        .map((_, element) => cleanText($(element).text()))
        .get()
        .filter((name) => name.length > 0);
      if (authors.length > 0) details.authors = authors;
      const genres = head
        .find("ul > li:has(strong:contains(Tag), strong:contains(Type)) a")
        .map((_, element) => cleanText($(element).text()))
        .get()
        .filter((name) => name.length > 0);
      if (genres.length > 0) details.genres = genres;
      const altTitles = body
        .find("li:has(strong:contains(Associated Name)) li")
        .map((_, element) => cleanText($(element).text()))
        .get()
        .filter((name) => name.length > 0);
      if (altTitles.length > 0) details.altTitles = altTitles;
      const cover = coverFrom(head);
      if (cover) details.coverUrl = cover;

      const seriesCode = locator.split("/")[0];
      const chapterPage = parseHTML(request(`${WEB}/series/${seriesCode}/full-chapter-list`));
      const anchors = chapterPage("div[x-data] > a");
      const total = anchors.length;
      let indexed = false;
      const chapters: ChapterItem[] = [];
      anchors.each((index, element) => {
        const anchor = chapterPage(element);
        const href = anchor.attr("href");
        const name = cleanText(anchor.find("span.flex > span").first().text());
        if (!href || name.length === 0) return;
        if (/season\s*\d+|^s\d+/i.test(name)) indexed = true;
        const chapterId = href.split("/").filter((segment) => segment.length > 0).pop() ?? name;
        const item: ChapterItem = { id: chapterId, number: null, language: "en" };
        const number = parseChapterNumber(name);
        item.number = indexed ? total - index : number;
        item.title = name;
        const datetime = anchor.find("time[datetime]").first().attr("datetime");
        if (typeof datetime === "string") {
          const parsed = Date.parse(datetime);
          if (Number.isFinite(parsed)) item.uploadedAt = parsed;
        }
        const official = anchor
          .find("img")
          .map((_, image) => (chapterPage(image).attr("src") ?? "").toLowerCase().includes("official"))
          .get()
          .some((value) => value === true);
        item.scanlator = official ? "Official" : "Unknown";
        item.url = href.startsWith("http") ? href : resolveUrl(WEB, href);
        chapters.push(item);
      });
      details.chapters = chapters;
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
      const chapterUrl = value.startsWith("http")
        ? value
        : value.includes("/")
          ? resolveUrl(WEB, value)
          : `${WEB}/chapters/${value}`;
      const $ = parseHTML(request(`${chapterUrl}/images?is_prev=False&reading_style=long_strip`));
      const images = $("#chapter-images img");
      if (images.length === 0) {
        throw new ScraperError("PARSING_ERROR", "chapter carries no pages");
      }
      return images
        .map((index, element): PageItem => {
          const src = $(element).attr("src");
          if (!src || src.length === 0) {
            throw new ScraperError("PARSING_ERROR", "chapter page missing an image source");
          }
          return { index, url: src.startsWith("http") ? src : resolveUrl(chapterUrl, src), isScrambled: false };
        })
        .get();
    }),
  );
  return 0;
}
