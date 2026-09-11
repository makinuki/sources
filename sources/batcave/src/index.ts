/// <reference path="./index.d.ts" />

import {
  cleanText,
  fail,
  fetch,
  ok,
  parseHTML,
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

const WEB = "https://batcave.biz";
const READER_API = `${WEB}/engine/ajax/controller.php?mod=api&action=reader/getChapterData`;
const MIN_YEAR = 1929;
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
  id: "batcave",
  name: "BatCave",
  version: "1.0.0",
  abiVersion: 1,
  lang: "en",
  baseUrl: WEB,
  iconUrl: `${WEB}/favicon.ico`,
  nsfw: false,
  allowedHosts: ["batcave.biz"],
};

const SORTS: Array<{ label: string; value: string }> = [
  { label: "Date", value: "date" },
  { label: "Date of change", value: "editdate" },
  { label: "Rating", value: "rating" },
  { label: "Read", value: "news_read" },
  { label: "Comments", value: "comm_num" },
  { label: "Title", value: "title" },
];

const FILTERS: FilterSchema[] = [
  { id: "sort", title: "Sort by", type: "select", options: SORTS, default: "rating" },
  {
    id: "direction",
    title: "Sort direction",
    type: "select",
    options: [
      { label: "Descending", value: "desc" },
      { label: "Ascending", value: "asc" },
    ],
    default: "desc",
  },
  { id: "yearFrom", title: "Year from", type: "text", placeholder: String(MIN_YEAR), default: "" },
  { id: "yearTo", title: "Year to", type: "text", placeholder: "current year", default: "" },
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

interface Page {
  status: number;
  body: string;
}

function request(url: string, init?: { method?: string; headers?: Record<string, string>; body?: string }): Page {
  const response = fetch({
    url,
    method: init?.method ?? "GET",
    headers: {
      Accept: "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8",
      "Sec-Fetch-Dest": "document",
      "Sec-Fetch-Mode": "navigate",
      "Sec-Fetch-Site": "none",
      "Sec-Fetch-User": "?1",
      ...(init?.headers ?? {}),
    },
    body: init?.body ?? null,
  });
  if (response.status < 200 || response.status >= 300) {
    throw new ScraperError(mapHttpStatus(response.status), `HTTP ${response.status} for ${url}`);
  }
  return { status: response.status, body: response.body };
}

function encodeSegment(segment: string): string {
  return segment.replace(/\[/g, "%5B").replace(/\]/g, "%5D");
}

const FORM_HEADERS: Record<string, string> = {
  "Content-Type": "application/x-www-form-urlencoded",
};

function listPath(page: number): string {
  return page > 1 ? `page/${page}/` : "";
}

function formBody(entries: Array<[string, string]>): string {
  return entries.map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`).join("&");
}

function currentYear(): number {
  return new Date().getUTCFullYear();
}

function year(value: string, label: string): number {
  const trimmed = value.trim();
  if (trimmed.length === 0) return 0;
  const parsed = Number(trimmed);
  if (!Number.isInteger(parsed) || parsed < MIN_YEAR || parsed > currentYear()) {
    throw new ScraperError("PARSING_ERROR", `${label} must be a whole year between ${MIN_YEAR} and ${currentYear()}`);
  }
  return parsed;
}

// Empty queries use the catalogue listing, which takes its narrowing through
// path segments and its ordering through a form body. Text queries use the
// site's search route instead, where filters are ignored.
function catalogueUrl(query: string, page: number, filters: Json): { url: string; body: string } {
  const sort = asString(filters["sort"]) || "rating";
  const direction = asString(filters["direction"]) === "asc" ? "asc" : "desc";
  const sortKey = SORTS.some((entry) => entry.value === sort) ? sort : "rating";
  const tail = listPath(page);

  if (query.trim().length > 0) {
    return {
      url: `${WEB}/search/${encodeURIComponent(query.trim())}/${tail}`,
      body: "",
    };
  }

  const from = year(asString(filters["yearFrom"]), "Year from");
  const to = year(asString(filters["yearTo"]), "Year to");
  const segments: string[] = [];
  if (from > 0) segments.push(`y%5Bfrom%5D=${from}/`);
  if (to > 0) segments.push(`y%5Bto%5D=${to}/`);
  if (segments.length === 0) {
    segments.push(`y%5Bfrom%5D=${MIN_YEAR}/`, `y%5Bto%5D=${currentYear()}/`);
  }

  return {
    url: `${WEB}/ComicList/${segments.join("")}${tail}`,
    body: formBody([
      ["dlenewssortby", sortKey],
      ["dledirection", direction],
      ["set_new_sort", "dle_sort_xfilter"],
      ["set_direction_sort", "dle_direction_xfilter"],
    ]),
  };
}

function mangaFrom($: ReturnType<typeof parseHTML>, element: unknown): MangaItem | null {
  const row = $(element as never);
  const anchor = row.find(".readed__title > a").first();
  const title = cleanText(anchor.text());
  const href = anchor.attr("href") ?? "";
  if (title.length === 0 || href.length === 0) return null;
  const item: MangaItem = { id: href, title, url: absolute(href) };
  const cover = row.find(".readed__img img").first().attr("data-src");
  if (cover !== undefined && cover.length > 0) item.coverUrl = absolute(cover);
  return item;
}

function absolute(value: string): string {
  if (value.startsWith("http://") || value.startsWith("https://")) return value;
  return `${WEB}${value.startsWith("/") ? "" : "/"}${value}`;
}

function parseList(html: string, page: number): PageResult<MangaItem> {
  const $ = parseHTML(html);
  const items: MangaItem[] = [];
  $("#dle-content > .readed").each((_index, element) => {
    const item = mangaFrom($, element);
    if (item) items.push(item);
  });
  const pages = $("div.pagination__pages");
  const last = pages.children().last();
  const hasNextPage = last.length > 0 && last.get(0)?.tagName === "a";
  return { page, hasNextPage, items };
}

function locatorPath(input: string): string {
  const value = input.trim();
  if (value.length === 0) throw new ScraperError("NOT_FOUND", "empty manga locator");
  if (!value.startsWith("http")) return value.startsWith("/") ? value : `/${value}`;
  try {
    const parsed = new URL(value);
    return `${parsed.pathname}${parsed.search}`;
  } catch {
    throw new ScraperError("NOT_FOUND", `malformed manga locator ${value}`);
  }
}

function pageListItem($: ReturnType<typeof parseHTML>, label: string): string {
  const entry = $(".page__list > li").filter((_index, element) => $(element).children("div").first().text().includes(label));
  return cleanText(entry.first().children("a").first().text());
}

function parseDate(value: string): number | undefined {
  const match = value.trim().match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (!match) return undefined;
  const stamp = Date.UTC(Number(match[3]), Number(match[2]) - 1, Number(match[1]));
  return Number.isFinite(stamp) ? stamp : undefined;
}

interface ChapterData {
  comicId: number | null;
  xhash: string;
  chapters: Json[];
}

function chapterData(html: string): ChapterData {
  const match = html.match(/window\.__DATA__\s*=\s*([\s\S]*?);\s*(?:<\/script>|$)/);
  if (!match) throw new ScraperError("PARSING_ERROR", "chapter data script not found");
  let parsed: unknown;
  try {
    parsed = JSON.parse(match[1].trim());
  } catch {
    throw new ScraperError("PARSING_ERROR", "chapter data script is not JSON");
  }
  const data = asRecord(parsed);
  return {
    comicId: asNumber(data["news_id"]),
    xhash: asString(data["xhash"]),
    chapters: asArray(data["chapters"]).map(asRecord),
  };
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
      const { url, body } = catalogueUrl(input.query ?? "", page, asRecord(input.filters));
      const result = body.length > 0
        ? request(url, { method: "POST", headers: FORM_HEADERS, body })
        : request(url);
      return parseList(result.body, page);
    }),
  );
  return 0;
}

export function get_details(): I32 {
  const input = JSON.parse(Host.inputString()) as string;
  Host.outputString(
    runExport(() => {
      const path = locatorPath(input);
      const html = request(`${WEB}${path}`).body;
      const $ = parseHTML(html);
      const title = cleanText($("header.page__header h1").first().text());
      if (title.length === 0) {
        throw new ScraperError("NOT_FOUND", `no series page for ${input}`);
      }

      const descriptionParts: string[] = [];
      const publisher = pageListItem($, "Publisher");
      const issueYear = pageListItem($, "Year");
      if (publisher.length > 0 || issueYear.length > 0) {
        descriptionParts.push(`${publisher}${issueYear.length > 0 ? ` - ${issueYear}` : ""}`);
      }
      const summary = cleanText($("div.page__text").first().text());
      if (summary.length > 0) descriptionParts.push(summary);

      const details: MangaDetails = {
        id: path,
        title,
        status: "Unknown",
        chapters: [],
      };
      const cover = $("div.page__poster img").first().attr("src");
      if (cover !== undefined && cover.length > 0) details.coverUrl = absolute(cover);
      if (descriptionParts.length > 0) details.description = descriptionParts.join("\n\n");

      const author = pageListItem($, "Writer");
      if (author.length > 0) details.authors = [author];
      const artist = pageListItem($, "Artist");
      if (artist.length > 0) details.artists = [artist];

      const genres: string[] = [];
      $("div.page__tags a").each((_index, element) => {
        const name = cleanText($(element).text());
        if (name.length > 0 && !genres.includes(name)) genres.push(name);
      });
      genres.push("Comic");
      details.genres = genres;

      const releaseEntry = $(".page__list > li")
        .filter((_index, element) => $(element).children("div").first().text().includes("Release type"))
        .first();
      const releaseLabel = releaseEntry.children("div").first().text();
      const releaseType = cleanText(releaseEntry.text().replace(releaseLabel, "")).toLowerCase();
      if (releaseType === "ongoing") details.status = "Ongoing";
      else if (releaseType === "completed") details.status = "Completed";

      const data = chapterData(html);
      for (const chapter of data.chapters) {
        const number = asNumber(chapter["posi"]);
        const chapterID = asNumber(chapter["id"]);
        if (chapterID === null || data.comicId === null) continue;
        const item: ChapterItem = {
          id: `reader/${data.comicId}/${chapterID}${data.xhash}`,
          number,
        };
        const name = cleanText(asString(chapter["title"]));
        if (name.length > 0) item.title = name;
        const uploadedAt = parseDate(asString(chapter["date"]));
        if (uploadedAt !== undefined) item.uploadedAt = uploadedAt;
        item.url = `${WEB}/reader/${data.comicId}/${chapterID}${data.xhash}`;
        details.chapters.push(item);
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
      const marker = locator.indexOf("reader/");
      if (marker < 0) {
        throw new ScraperError("NOT_FOUND", "chapter locator is not a reader path");
      }
      const [newsID, rawID] = locator.slice(marker + "reader/".length).split("/");
      const chapterID = (rawID ?? "").match(/^\d+/)?.[0];
      if (!newsID || !chapterID) {
        throw new ScraperError("NOT_FOUND", "chapter locator is missing its series or chapter id");
      }
      const payload = request(READER_API, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json, text/plain, */*" },
        body: JSON.stringify({ news_id: newsID, chapter_id: chapterID }),
      }).body;
      let parsed: unknown;
      try {
        parsed = JSON.parse(payload);
      } catch {
        throw new ScraperError("PARSING_ERROR", "chapter data response is not JSON");
      }
      const images = asArray(asRecord(asRecord(parsed)["data"])["images"]);
      if (images.length === 0) {
        throw new ScraperError("PARSING_ERROR", "chapter carries no pages");
      }
      return images.map((entry, index): PageItem => {
        const url = absolute(asString(entry).trim());
        return { index, url, isScrambled: false };
      });
    }),
  );
  return 0;
}