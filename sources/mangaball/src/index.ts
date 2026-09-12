/// <reference path="./index.d.ts" />

import {
  cleanText,
  fail,
  fetch,
  ok,
  parseChapterNumber,
  parseHTML,
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

const WEB = "https://mangaball.net";
const API = `${WEB}/api/v1`;
const CSRF_KEY = "mangaball.csrf";
const PAGE_LIMIT = 24;
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
  id: "mangaball",
  name: "Manga Ball",
  version: "1.0.1",
  abiVersion: 1,
  lang: "multi",
  baseUrl: WEB,
  iconUrl: `${WEB}/favicon.ico`,
  nsfw: true,
  allowedHosts: ["mangaball.net", "poke-black-and-white.net", "bulbasaur.poke-black-and-white.net"],
};

const CONTENT = [
  { label: "Gore", value: "685148d115e8b86aae68e4f3" },
  { label: "Sexual Violence", value: "685146c5f3ed681c80f257e7" },
];

const FORMAT = [
  { label: "4-Koma", value: "685148d115e8b86aae68e4ec" },
  { label: "Adaptation", value: "685148cf15e8b86aae68e4de" },
  { label: "Anthology", value: "685148e915e8b86aae68e558" },
  { label: "Award Winning", value: "685148fe15e8b86aae68e5a7" },
  { label: "Doujinshi", value: "6851490e15e8b86aae68e5da" },
  { label: "Fan Colored", value: "6851498215e8b86aae68e704" },
  { label: "Full Color", value: "685148d615e8b86aae68e502" },
  { label: "Long Strip", value: "685148d915e8b86aae68e517" },
  { label: "Official Colored", value: "6851493515e8b86aae68e64a" },
  { label: "Oneshot", value: "685148eb15e8b86aae68e56c" },
  { label: "Self-Published", value: "6851492e15e8b86aae68e633" },
  { label: "Web Comic", value: "685148d715e8b86aae68e50d" },
];

const GENRE = [
  { label: "Action", value: "685146c5f3ed681c80f257e3" },
  { label: "Adult", value: "689371f0a943baf927094f03" },
  { label: "Adventure", value: "685146c5f3ed681c80f257e6" },
  { label: "Boys' Love", value: "685148ef15e8b86aae68e573" },
  { label: "Comedy", value: "685146c5f3ed681c80f257e5" },
  { label: "Crime", value: "685148da15e8b86aae68e51f" },
  { label: "Drama", value: "685148cf15e8b86aae68e4dd" },
  { label: "Ecchi", value: "6892a73ba943baf927094e37" },
  { label: "Fantasy", value: "685146c5f3ed681c80f257ea" },
  { label: "Girls' Love", value: "685148da15e8b86aae68e524" },
  { label: "Historical", value: "685148db15e8b86aae68e527" },
  { label: "Horror", value: "685148da15e8b86aae68e520" },
  { label: "Isekai", value: "685146c5f3ed681c80f257e9" },
  { label: "Magical Girls", value: "6851490d15e8b86aae68e5d4" },
  { label: "Mature", value: "68932d11a943baf927094e7b" },
  { label: "Mecha", value: "6851490c15e8b86aae68e5d2" },
  { label: "Medical", value: "6851494e15e8b86aae68e66e" },
  { label: "Mystery", value: "685148d215e8b86aae68e4f4" },
  { label: "Philosophical", value: "685148e215e8b86aae68e544" },
  { label: "Psychological", value: "685148d715e8b86aae68e507" },
  { label: "Romance", value: "685148cf15e8b86aae68e4db" },
  { label: "Sci-Fi", value: "685148cf15e8b86aae68e4da" },
  { label: "Shounen Ai", value: "689f0ab1f2e66744c6091524" },
  { label: "Slice of Life", value: "685148d015e8b86aae68e4e3" },
  { label: "Smut", value: "689371f2a943baf927094f04" },
  { label: "Sports", value: "685148f515e8b86aae68e588" },
  { label: "Superhero", value: "6851492915e8b86aae68e61c" },
  { label: "Thriller", value: "685148d915e8b86aae68e51e" },
  { label: "Tragedy", value: "685148db15e8b86aae68e529" },
  { label: "User Created", value: "68932c3ea943baf927094e77" },
  { label: "Wuxia", value: "6851490715e8b86aae68e5c3" },
  { label: "Yaoi", value: "68932f68a943baf927094eaa" },
  { label: "Yuri", value: "6896a885a943baf927094f66" },
];

const ORIGIN = [
  { label: "Comic", value: "68ecab8507ec62d87e62780f" },
  { label: "Manga", value: "68ecab1e07ec62d87e627806" },
  { label: "Manhua", value: "68ecab4807ec62d87e62780b" },
  { label: "Manhwa", value: "68ecab3b07ec62d87e627809" },
];

const THEME = [
  { label: "Aliens", value: "6851490d15e8b86aae68e5d5" },
  { label: "Animals", value: "685148e715e8b86aae68e54b" },
  { label: "Comics", value: "68bf09ff8fdeab0b6a9bc2b7" },
  { label: "Cooking", value: "685148d215e8b86aae68e4f8" },
  { label: "Crossdressing", value: "685148df15e8b86aae68e534" },
  { label: "Delinquents", value: "685148d915e8b86aae68e519" },
  { label: "Demons", value: "685146c5f3ed681c80f257e4" },
  { label: "Genderswap", value: "685148d715e8b86aae68e505" },
  { label: "Ghosts", value: "685148d615e8b86aae68e501" },
  { label: "Gyaru", value: "685148d015e8b86aae68e4e8" },
  { label: "Harem", value: "685146c5f3ed681c80f257e8" },
  { label: "Hentai", value: "68bfceaf4dbc442a26519889" },
  { label: "Incest", value: "685148f215e8b86aae68e584" },
  { label: "Loli", value: "685148d715e8b86aae68e506" },
  { label: "Mafia", value: "685148d915e8b86aae68e518" },
  { label: "Magic", value: "685148d715e8b86aae68e509" },
  { label: "Manhwa 18+", value: "68f5f5ce5f29d3c1863dec3a" },
  { label: "Martial Arts", value: "6851490615e8b86aae68e5c2" },
  { label: "Military", value: "685148e215e8b86aae68e541" },
  { label: "Monster Girls", value: "685148db15e8b86aae68e52c" },
  { label: "Monsters", value: "685146c5f3ed681c80f257e2" },
  { label: "Music", value: "685148d015e8b86aae68e4e4" },
  { label: "Ninja", value: "685148d715e8b86aae68e508" },
  { label: "Office Workers", value: "685148d315e8b86aae68e4fd" },
  { label: "Police", value: "6851498815e8b86aae68e714" },
  { label: "Post-Apocalyptic", value: "685148e215e8b86aae68e540" },
  { label: "Reincarnation", value: "685146c5f3ed681c80f257e1" },
  { label: "Reverse Harem", value: "685148df15e8b86aae68e533" },
  { label: "Samurai", value: "6851490415e8b86aae68e5b9" },
  { label: "School Life", value: "685148d015e8b86aae68e4e7" },
  { label: "Shota", value: "685148d115e8b86aae68e4ed" },
  { label: "Supernatural", value: "685148db15e8b86aae68e528" },
  { label: "Survival", value: "685148cf15e8b86aae68e4dc" },
  { label: "Time Travel", value: "6851490c15e8b86aae68e5d1" },
  { label: "Traditional Games", value: "6851493515e8b86aae68e645" },
  { label: "Vampires", value: "685148f915e8b86aae68e597" },
  { label: "Video Games", value: "685148e115e8b86aae68e53c" },
  { label: "Villainess", value: "6851492115e8b86aae68e602" },
  { label: "Virtual Reality", value: "68514a1115e8b86aae68e83e" },
  { label: "Zombies", value: "6851490c15e8b86aae68e5d3" },
];

const FILTERS: FilterSchema[] = [
  {
    id: "sort",
    title: "Sort by",
    type: "select",
    options: [
      { label: "Latest updated chapters", value: "updated_chapters_desc" },
      { label: "Oldest updated chapters", value: "updated_chapters_asc" },
      { label: "Latest created", value: "created_at_desc" },
      { label: "Oldest created", value: "created_at_asc" },
      { label: "Title A-Z", value: "name_asc" },
      { label: "Title Z-A", value: "name_desc" },
      { label: "Views high to low", value: "views_desc" },
      { label: "Views low to high", value: "views_asc" },
    ],
    default: "updated_chapters_desc",
  },
  {
    id: "demographic",
    title: "Magazine demographic",
    type: "select",
    options: [
      { label: "Any", value: "any" },
      { label: "Shounen", value: "shounen" },
      { label: "Shoujo", value: "shoujo" },
      { label: "Seinen", value: "seinen" },
      { label: "Josei", value: "josei" },
      { label: "Yuri", value: "yuri" },
      { label: "Yaoi", value: "yaoi" },
    ],
    default: "any",
  },
  {
    id: "status",
    title: "Publication status",
    type: "select",
    options: [
      { label: "Any", value: "any" },
      { label: "Ongoing", value: "ongoing" },
      { label: "Completed", value: "completed" },
      { label: "Hiatus", value: "hiatus" },
      { label: "Cancelled", value: "cancelled" },
    ],
    default: "any",
  },
  { id: "content", title: "Content", type: "tri_state", options: CONTENT },
  { id: "format", title: "Format", type: "tri_state", options: FORMAT },
  { id: "genre", title: "Genre", type: "tri_state", options: GENRE },
  { id: "origin", title: "Origin", type: "tri_state", options: ORIGIN },
  { id: "theme", title: "Theme", type: "tri_state", options: THEME },
  {
    id: "include_mode",
    title: "Tag include mode",
    type: "select",
    options: [
      { label: "AND", value: "and" },
      { label: "OR", value: "or" },
    ],
    default: "and",
  },
  {
    id: "exclude_mode",
    title: "Tag exclude mode",
    type: "select",
    options: [
      { label: "AND", value: "and" },
      { label: "OR", value: "or" },
    ],
    default: "and",
  },
];

type Json = Record<string, unknown>;
type Param = [string, string];

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

function encodeForm(params: Param[]): string {
  return params.map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`).join("&");
}

// The site rejects its own API calls without the session token it embeds in
// every page, so the token is fetched once and cached in plugin storage.
function csrfToken(force: boolean): string {
  if (!force) {
    const cached = storageGet(CSRF_KEY);
    if (cached !== null && cached.length > 0) return cached;
  }
  const response = fetch({
    url: `${WEB}/`,
    method: "GET",
    headers: { Accept: "text/html,application/xhtml+xml", Cookie: "show18PlusContent=true" },
  });
  if (response.status < 200 || response.status >= 300) {
    throw new ScraperError(mapHttpStatus(response.status), `HTTP ${response.status}`);
  }
  const match = /name="csrf-token"\s+content="([^"]+)"/.exec(response.body);
  const token = match ? match[1] : "";
  if (token.length === 0) {
    throw new ScraperError("PARSING_ERROR", "session token is absent from the site root");
  }
  storageSet(CSRF_KEY, token);
  return token;
}

function postForm(path: string, params: Param[]): Json {
  const body = encodeForm(params);
  let token = csrfToken(false);
  for (let attempt = 0; attempt < 2; attempt++) {
    const response = fetch({
      url: `${API}${path}`,
      method: "POST",
      headers: {
        Accept: "application/json, text/plain, */*",
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        "X-Requested-With": "XMLHttpRequest",
        "X-CSRF-TOKEN": token,
        Referer: `${WEB}/`,
        Cookie: "show18PlusContent=true",
      },
      body,
    });
    if (response.status >= 200 && response.status < 300) {
      try {
        return asRecord(JSON.parse(response.body));
      } catch {
        throw new ScraperError("PARSING_ERROR", `response from ${path} is not JSON`);
      }
    }
    if (response.status === 419 || response.status === 403) {
      token = csrfToken(true);
      continue;
    }
    throw new ScraperError(mapHttpStatus(response.status), `HTTP ${response.status}`);
  }
  throw new ScraperError("SESSION_REQUIRED", "session token was rejected twice");
}

function getHtmlResponse(url: string): string {
  const response = fetch({
    url,
    method: "GET",
    headers: {
      Accept: "text/html,application/xhtml+xml",
      Referer: `${WEB}/`,
      Cookie: "show18PlusContent=true",
    },
  });
  if (response.status < 200 || response.status >= 300) {
    throw new ScraperError(mapHttpStatus(response.status), `HTTP ${response.status}`);
  }
  return response.body;
}

function slugFromUrl(value: string): string {
  const path = value.startsWith("http") ? new URL(value).pathname : value;
  const segments = path.split("/").filter((segment) => segment.length > 0);
  return segments.length > 0 ? segments[segments.length - 1] : "";
}

function seriesLocator(input: string): string {
  const value = input.trim();
  if (value.startsWith("http")) return slugFromUrl(value);
  return value.replace(/^\/?(title-detail\/)?/, "").split("/")[0];
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
      const params: Param[] = [
        ["search_input", (input.query ?? "").trim()],
        ["filters[sort]", asString(filters["sort"]) || "updated_chapters_desc"],
        ["filters[page]", String(page)],
        ["filters[tag_included_mode]", asString(filters["include_mode"]) === "or" ? "or" : "and"],
        ["filters[tag_excluded_mode]", asString(filters["exclude_mode"]) === "or" ? "or" : "and"],
        ["filters[contentRating]", "any"],
        ["filters[demographic]", asString(filters["demographic"]) || "any"],
        ["filters[person]", "any"],
        ["filters[publicationYear]", ""],
        ["filters[publicationStatus]", asString(filters["status"]) || "any"],
      ];
      for (const group of ["content", "format", "genre", "origin", "theme"]) {
        const state = stateMap(filters, group);
        for (const value of state.include) params.push(["filters[tag_included_ids][]", value]);
        for (const value of state.exclude) params.push(["filters[tag_excluded_ids][]", value]);
      }

      const body = postForm("/title/search-advanced/", params);
      const items: MangaItem[] = [];
      for (const entry of asArray(body["data"])) {
        const record = asRecord(entry);
        const slug = slugFromUrl(asString(record["url"]));
        const title = cleanText(asString(record["name"]));
        if (slug.length === 0 || title.length === 0) continue;
        const item: MangaItem = { id: slug, title, url: `${WEB}/title-detail/${slug}/` };
        const cover = asString(record["cover"]);
        if (cover.length > 0) item.coverUrl = cover;
        items.push(item);
      }
      const pagination = asRecord(body["pagination"]);
      const current = asNumber(pagination["current_page"]) ?? page;
      const last = asNumber(pagination["last_page"]) ?? page;
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
      const locator = seriesLocator(input);
      if (locator.length === 0) {
        throw new ScraperError("NOT_FOUND", "empty series locator");
      }
      const html = getHtmlResponse(`${WEB}/title-detail/${locator}/`);
      const $ = parseHTML(html);
      const title = cleanText($("#comicDetail h6").first().text());
      if (title.length === 0) {
        throw new ScraperError("NOT_FOUND", `no title for ${locator}`);
      }
      const details: MangaDetails = { id: locator, title, status: "Unknown", chapters: [] };
      const cover = $("#comicDetail img.featured-cover").first().attr("src");
      if (typeof cover === "string" && cover.length > 0) details.coverUrl = cover;

      const statusText = cleanText($("span.badge-status").first().text());
      switch (statusText) {
        case "Ongoing":
          details.status = "Ongoing";
          break;
        case "Completed":
          details.status = "Completed";
          break;
        case "Hiatus":
          details.status = "Hiatus";
          break;
        case "Cancelled":
          details.status = "Cancelled";
          break;
        default:
          details.status = "Unknown";
      }

      const authors = $("#comicDetail span[data-person-id]")
        .map((_, element) => cleanText($(element).text()))
        .get()
        .filter((name) => name.length > 0);
      if (authors.length > 0) details.authors = authors;

      const genres: string[] = [];
      const flag = $("img[src*='/flags/']").first().attr("src") ?? "";
      if (flag.includes("jp")) genres.push("Manga");
      if (flag.includes("kr")) genres.push("Manhwa");
      if (flag.includes("cn")) genres.push("Manhua");
      $("#comicDetail span[data-tag-id]").each((_, element) => {
        const name = cleanText($(element).text());
        if (name.length > 0 && !genres.includes(name)) genres.push(name);
      });
      if (genres.length > 0) details.genres = genres;

      const summary = cleanText($("#descriptionContent").text());
      const altNames = cleanText($("div.alternate-name-container").text())
        .split("/")
        .map((name) => name.trim())
        .filter((name) => name.length > 0);
      const description = [summary, altNames.length > 0 ? `Alternative names:\n${altNames.join("\n")}` : ""]
        .filter((part) => part.length > 0)
        .join("\n\n");
      if (description.length > 0) details.description = description;

      const titleId = locator.split("-").pop() ?? "";
      if (titleId.length > 0) {
        const body = postForm("/chapter/chapter-listing-by-title-id/", [["title_id", titleId]]);
        const collected: ChapterItem[] = [];
        for (const raw of asArray(body["ALL_CHAPTERS"])) {
          const chapter = asRecord(raw);
          const number = asNumber(chapter["number_float"]);
          for (const translationRaw of asArray(chapter["translations"])) {
            const translation = asRecord(translationRaw);
            const id = asString(translation["id"]);
            if (id.length === 0) continue;
            const item: ChapterItem = { id, number, language: asString(translation["language"]) };
            const volumeValue = asNumber(translation["volume"]);
            const volume = volumeValue === null ? null : Math.trunc(volumeValue);
            if (volume !== null && volume > 0) item.volume = volume;
            const name = cleanText(asString(translation["name"]));
            const volumeLabel = volume !== null && volume > 0 ? `Vol. ${volume} ` : "";
            if (name.length > 0) {
              item.title = name.includes(String(number ?? "")) ? name : `${volumeLabel}Ch. ${number ?? ""} ${name}`.trim();
            }
            const group = asRecord(translation["group"]);
            const groupName = cleanText(asString(group["name"]));
            if (groupName.length > 0) item.scanlator = groupName;
            const uploadedAt = Date.parse(asString(translation["date"]).replace(" ", "T"));
            if (Number.isFinite(uploadedAt)) item.uploadedAt = uploadedAt;
            item.url = `${WEB}/chapter-detail/${id}/`;
            collected.push(item);
          }
        }
        details.chapters = collected;
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
      const locator = input.trim();
      if (locator.length === 0) {
        throw new ScraperError("NOT_FOUND", "empty chapter locator");
      }
      const id = seriesLocator(locator);
      const html = getHtmlResponse(`${WEB}/chapter-detail/${id}/`);
      const tokenMatch = /name="csrf-token"\s+content="([^"]+)"/.exec(html);
      if (tokenMatch) storageSet(CSRF_KEY, tokenMatch[1]);
      const images = /const\s+chapterImages\s*=\s*JSON\.parse\(`([^`]+)`\)/.exec(html);
      if (!images) {
        throw new ScraperError("PARSING_ERROR", "chapter carries no page list");
      }
      let payload: unknown;
      try {
        payload = JSON.parse(images[1]);
      } catch {
        throw new ScraperError("PARSING_ERROR", "chapter page list is not JSON");
      }
      const pages = asArray(payload);
      if (pages.length === 0) {
        throw new ScraperError("PARSING_ERROR", "chapter carries no pages");
      }
      return pages.map((entry, index): PageItem => {
        const url = asString(entry);
        if (url.length === 0) {
          throw new ScraperError("PARSING_ERROR", "chapter page missing an image source");
        }
        return { index, url, isScrambled: false };
      });
    }),
  );
  return 0;
}