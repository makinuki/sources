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

const WEB = "https://www.mangakakalove.com";
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
  id: "mangakakalot",
  name: "Mangakakalot",
  version: "1.0.0",
  abiVersion: 1,
  lang: "en",
  baseUrl: WEB,
  iconUrl: `${WEB}/images/logo.png`,
  nsfw: false,
  allowedHosts: [
    "mangakakalove.com",
    "mangakakalot.gg",
    "2xstorage.com",
    "img-r1.2xstorage.com",
    "img-r2.2xstorage.com",
    "bu2cdn.net",
    "cmcdn.org",
  ],
};

const SORTS = [
  { label: "Latest", value: "latest" },
  { label: "Newest", value: "newest" },
  { label: "Top read", value: "topview" },
];

const STATUSES = [
  { label: "All", value: "all" },
  { label: "Completed", value: "completed" },
  { label: "Ongoing", value: "ongoing" },
];

const GENRES = [
  { label: "ALL", value: "all" },
  { label: "4-Koma", value: "4-koma" },
  { label: "Action", value: "action" },
  { label: "Adaptation", value: "adaptation" },
  { label: "Adult", value: "adult" },
  { label: "Adventure", value: "adventure" },
  { label: "Age gap", value: "age-gap" },
  { label: "Ai art", value: "ai-art" },
  { label: "Aliens", value: "aliens" },
  { label: "Animals", value: "animals" },
  { label: "Anthology", value: "anthology" },
  { label: "Artbook", value: "artbook" },
  { label: "Avant garde", value: "avant-garde" },
  { label: "Award winning", value: "award-winning" },
  { label: "Beasts", value: "beasts" },
  { label: "Boys love", value: "boys-love" },
  { label: "Blackmail", value: "blackmail" },
  { label: "Bloody", value: "bloody" },
  { label: "Bodyswap", value: "bodyswap" },
  { label: "Brocon/Siscon", value: "brocon-siscon" },
  { label: "Cars", value: "cars" },
  { label: "Cartoon", value: "cartoon" },
  { label: "Cheating infidelity", value: "cheating-infidelity" },
  { label: "Childhood friends", value: "childhood-friends" },
  { label: "College life", value: "college-life" },
  { label: "Comedy", value: "comedy" },
  { label: "Comic", value: "comic" },
  { label: "Contest winning", value: "contest-winning" },
  { label: "Cooking", value: "cooking" },
  { label: "Creators", value: "creators" },
  { label: "Crime", value: "crime" },
  { label: "Crossdressing", value: "crossdressing" },
  { label: "Cultivation", value: "cultivation" },
  { label: "Death game", value: "death-game" },
  { label: "Degeneratemc", value: "degeneratemc" },
  { label: "Delinquents", value: "delinquents" },
  { label: "Dementia", value: "dementia" },
  { label: "Demons", value: "demons" },
  { label: "Doujinshi", value: "doujinshi" },
  { label: "Drama", value: "drama" },
  { label: "Ecchi", value: "ecchi" },
  { label: "Employee", value: "employee" },
  { label: "Erotica", value: "erotica" },
  { label: "Fan colored", value: "fan-colored" },
  { label: "Fantasy", value: "fantasy" },
  { label: "Female protagonists", value: "female-protagonists" },
  { label: "Fetish", value: "fetish" },
  { label: "Full color", value: "full-color" },
  { label: "Game", value: "game" },
  { label: "Gender bender", value: "gender-bender" },
  { label: "Genderswap", value: "genderswap" },
  { label: "Ghosts", value: "ghosts" },
  { label: "Girls love", value: "girls-love" },
  { label: "Gore", value: "gore" },
  { label: "Gourmet", value: "gourmet" },
  { label: "Graphic novel", value: "graphic-novel" },
  { label: "Gyaru", value: "gyaru" },
  { label: "Harem", value: "harem" },
  { label: "Heartwarming", value: "heartwarming" },
  { label: "Hentai", value: "hentai" },
  { label: "Historical", value: "historical" },
  { label: "Horror", value: "horror" },
  { label: "Imageset", value: "imageset" },
  { label: "Incest", value: "incest" },
  { label: "Informative", value: "informative" },
  { label: "Isekai", value: "isekai" },
  { label: "Iyashikei", value: "iyashikei" },
  { label: "Josei", value: "josei" },
  { label: "Kids", value: "kids" },
  { label: "Korean", value: "korean" },
  { label: "Liexing", value: "liexing" },
  { label: "Loli", value: "loli" },
  { label: "Long strip", value: "long-strip" },
  { label: "Mafia", value: "mafia" },
  { label: "Magic", value: "magic" },
  { label: "Magical girls", value: "magical-girls" },
  { label: "Mahou shoujo", value: "mahou-shoujo" },
  { label: "Male protagonists", value: "male-protagonists" },
  { label: "Manga", value: "manga" },
  { label: "Mangatoon", value: "mangatoon" },
  { label: "Manhua", value: "manhua" },
  { label: "Manhwa", value: "manhwa" },
  { label: "Martial arts", value: "martial-arts" },
  { label: "Master servant", value: "master-servant" },
  { label: "Mature", value: "mature" },
  { label: "Mecha", value: "mecha" },
  { label: "Medical", value: "medical" },
  { label: "Military", value: "military" },
  { label: "Monsters", value: "monsters" },
  { label: "Monster girls", value: "monster-girls" },
  { label: "Murim", value: "murim" },
  { label: "Music", value: "music" },
  { label: "Mystery", value: "mystery" },
  { label: "Netorare", value: "netorare" },
  { label: "Netori", value: "netori" },
  { label: "Ninja", value: "ninja" },
  { label: "Non human", value: "non-human" },
  { label: "Office", value: "office" },
  { label: "Office workers", value: "office-workers" },
  { label: "Official colored", value: "official-colored" },
  { label: "Old people", value: "old-people" },
  { label: "Omegaverse", value: "omegaverse" },
  { label: "One shot", value: "one-shot" },
  { label: "Others", value: "others" },
  { label: "Overpowered", value: "overpowered" },
  { label: "Parody", value: "parody" },
  { label: "Philosophical", value: "philosophical" },
  { label: "Ping ping jun", value: "ping-ping-jun" },
  { label: "Police", value: "police" },
  { label: "Pornographic", value: "pornographic" },
  { label: "Post apocalyptic", value: "post-apocalyptic" },
  { label: "Psychological", value: "psychological" },
  { label: "Reincarnation", value: "reincarnation" },
  { label: "Revenge", value: "revenge" },
  { label: "Reverse", value: "reverse" },
  { label: "Reverse harem", value: "reverse-harem" },
  { label: "Romance", value: "romance" },
  { label: "Royal family", value: "royal-family" },
  { label: "Royalty", value: "royalty" },
  { label: "Samurai", value: "samurai" },
  { label: "School", value: "school" },
  { label: "School life", value: "school-life" },
  { label: "Sci fi", value: "sci-fi" },
  { label: "Science fiction", value: "science-fiction" },
  { label: "Seinen", value: "seinen" },
  { label: "Self published", value: "self-published" },
  { label: "Sexual violence", value: "sexual-violence" },
  { label: "Shota", value: "shota" },
  { label: "Shoujo", value: "shoujo" },
  { label: "Shoujo ai", value: "shoujo-ai" },
  { label: "Shounen", value: "shounen" },
  { label: "Shounen ai", value: "shounen-ai" },
  { label: "Showbiz", value: "showbiz" },
  { label: "Slice of life", value: "slice-of-life" },
  { label: "Smut", value: "smut" },
  { label: "Sm bdsm", value: "sm-bdsm" },
  { label: "Soft yaoi", value: "soft-yaoi" },
  { label: "Space", value: "space" },
  { label: "Sports", value: "sports" },
  { label: "Spy", value: "spy" },
  { label: "Step family", value: "step-family" },
  { label: "Super power", value: "super-power" },
  { label: "Superhero", value: "superhero" },
  { label: "Supernatural", value: "supernatural" },
  { label: "Survival", value: "survival" },
  { label: "Suspense", value: "suspense" },
  { label: "System", value: "system" },
  { label: "Teacher student", value: "teacher-student" },
  { label: "Thriller", value: "thriller" },
  { label: "Time travel", value: "time-travel" },
  { label: "Traditional games", value: "traditional-games" },
  { label: "Tragedy", value: "tragedy" },
  { label: "Vampires", value: "vampires" },
  { label: "Video games", value: "video-games" },
  { label: "Villainess", value: "villainess" },
  { label: "Violence", value: "violence" },
  { label: "Virtual reality", value: "virtual-reality" },
  { label: "Web comic", value: "web-comic" },
  { label: "Webtoons", value: "webtoons" },
  { label: "Western", value: "western" },
  { label: "Wuxia", value: "wuxia" },
  { label: "Xianxia", value: "xianxia" },
  { label: "Yaoi", value: "yaoi" },
  { label: "Yuri", value: "yuri" },
  { label: "Zombies", value: "zombies" },
];

// The site encodes an ordering choice as a single numeric filter id built
// from the selected sort and status.
const FILTER_IDS: Record<string, string> = {
  "newest:all": "1",
  "newest:completed": "2",
  "newest:ongoing": "3",
  "latest:all": "4",
  "latest:completed": "5",
  "latest:ongoing": "6",
  "topview:all": "7",
  "topview:completed": "8",
  "topview:ongoing": "9",
};

const FILTERS: FilterSchema[] = [
  { id: "sort", title: "Order by", type: "select", options: SORTS, default: "latest" },
  { id: "status", title: "Status", type: "select", options: STATUSES, default: "all" },
  { id: "genre", title: "Category", type: "select", options: GENRES, default: "all" },
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

function mapHttpStatus(status: number): ErrorCode {
  if (status === 401) return "SESSION_REQUIRED";
  if (status === 403) return "CLOUDFLARE_BLOCKED";
  if (status === 404) return "NOT_FOUND";
  if (status === 429) return "RATE_LIMITED";
  if (status >= 500) return "SOURCE_OFFLINE";
  return "NETWORK_TIMEOUT";
}

// The site answers with a bot challenge unless the request carries the
// navigation headers a browser sends, so every request repeats them.
function request(url: string): string {
  const response = fetch({
    url,
    method: "GET",
    headers: {
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
      Referer: `${WEB}/`,
      "Sec-Fetch-Dest": "document",
      "Sec-Fetch-Mode": "navigate",
      "Sec-Fetch-Site": "same-origin",
      "Upgrade-Insecure-Requests": "1",
    },
  });
  if (response.status < 200 || response.status >= 300) {
    throw new ScraperError(mapHttpStatus(response.status), `HTTP ${response.status}`);
  }
  return response.body;
}

function requestJson(url: string): Json {
  const body = request(url);
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
  return `${WEB}${value.startsWith("/") ? "" : "/"}${value}`;
}

function attrOf(element: { attr(name: string): string | undefined }, name: string): string {
  const value = element.attr(name);
  return typeof value === "string" ? value.trim() : "";
}

// A series locator is the slug that follows the site's manga prefix.
function seriesLocator(input: string): string {
  const value = input.trim();
  const path = value.startsWith("http") ? new URL(value).pathname : value;
  const segments = path.split("/").filter((segment) => segment.length > 0);
  const index = segments.indexOf("manga");
  if (index >= 0 && index + 1 < segments.length) return segments[index + 1];
  return segments.length > 0 ? segments[segments.length - 1] : "";
}

function statusOf(value: string): MangaDetails["status"] {
  if (value.includes("Ongoing")) return "Ongoing";
  if (value.includes("Completed")) return "Completed";
  if (value.includes("Hiatus")) return "Hiatus";
  if (value.includes("Cancel") || value.includes("Dropped")) return "Cancelled";
  return "Unknown";
}

// Mirrors the site's own search-term normalisation: lowercase, strip
// accents, then collapse every separator into a single underscore.
function normalizeSearchQuery(input: string): string {
  let value = input.toLowerCase();
  value = value.replace(/[àáạảãâầấậẩẫăằắặẳẵ]/g, "a");
  value = value.replace(/[èéẹẻẽêềếệểễ]/g, "e");
  value = value.replace(/[ìíịỉĩ]/g, "i");
  value = value.replace(/[òóọỏõôồốộổỗơờớợởỡ]/g, "o");
  value = value.replace(/[ùúụủũưừứựửữ]/g, "u");
  value = value.replace(/[ỳýỵỷỹ]/g, "y");
  value = value.replace(/đ/g, "d");
  value = value.replace(/[^a-z0-9]+/g, "_");
  return value.replace(/^_+|_+$/g, "");
}

function searchUrl(query: string, page: number, filters: Json): string {
  const trimmed = query.trim();
  if (trimmed.length > 0) {
    return `${WEB}/search/story/${encodeURIComponent(normalizeSearchQuery(trimmed))}?page=${page}`;
  }
  const sort = asString(filters["sort"]) || "latest";
  const status = asString(filters["status"]) || "all";
  const genre = asString(filters["genre"]) || "all";
  const id = FILTER_IDS[`${sort}:${status}`];
  const url = new URL(`${WEB}/genre/${encodeURIComponent(genre)}`);
  if (id !== undefined) url.searchParams.set("filter", id);
  url.searchParams.set("page", String(page));
  return url.toString();
}

function hasNextPage($: ReturnType<typeof parseHTML>): boolean {
  return $("a.page_select + a:not(.page_last), a.page-select + a:not(.page-last)").length > 0;
}

function mangaFromAnchor(scope: ReturnType<ReturnType<typeof parseHTML>>, href: string, title: string): MangaItem {
  const item: MangaItem = { id: seriesLocator(href), title, url: href.startsWith("http") ? href : resolveUrl(WEB, href) };
  const cover = scope.find("img").first().attr("src");
  if (typeof cover === "string" && cover.length > 0) item.coverUrl = absoluteUrl(cover);
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
      const $ = parseHTML(request(searchUrl(input.query ?? "", page, asRecord(input.filters))));
      const items: MangaItem[] = [];
      $(".panel_story_list .story_item, div.list-truyen-item-wrap, div.list-comic-item-wrap").each((_, element) => {
        const scope = $(element);
        const anchor = scope.find("h3 a").first();
        const href = attrOf(anchor, "href");
        const title = cleanText(anchor.text());
        if (href.length === 0 || title.length === 0) return;
        items.push(mangaFromAnchor(scope, href, title));
      });
      const result: PageResult<MangaItem> = { page, hasNextPage: hasNextPage($), items };
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
      const $ = parseHTML(request(`${WEB}/manga/${locator}`));
      const info = $("div.manga-info-top, div.panel-story-info").first();
      const title = cleanText(info.find("h1, h2").first().text());
      if (title.length === 0) {
        throw new ScraperError("NOT_FOUND", `no title for ${locator}`);
      }
      const details: MangaDetails = { id: locator, title, status: statusOf(info.text()), chapters: [] };
      const cover = $("div.manga-info-pic img, span.info-image img").first().attr("src");
      if (typeof cover === "string" && cover.length > 0) details.coverUrl = absoluteUrl(cover);
      const authors = info
        .find("li:contains(author) a")
        .map((_, element) => cleanText($(element).text()))
        .get()
        .filter((name) => name.length > 0);
      if (authors.length > 0) details.authors = authors;
      const genres = info
        .find("div.manga-info-top li:contains(genres) a")
        .map((_, element) => cleanText($(element).text()))
        .get()
        .filter((name) => name.length > 0);
      if (genres.length > 0) details.genres = genres;
      const description = cleanText($("div#noidungm, div#panel-story-info-description, div#contentBox").first().text());
      if (description.length > 0) details.description = description;
      const altName = cleanText($(".story-alternative, tr:has(.info-alternative) h2").first().text());
      if (altName.length > 0) {
        details.altTitles = [altName];
      }

      const chapterBody = requestJson(`${WEB}/api/manga/${locator}/chapters?limit=-1`);
      if (chapterBody["success"] !== true) {
        throw new ScraperError("PARSING_ERROR", "chapter list request was rejected");
      }
      const chapters = asArray(asRecord(chapterBody["data"])["chapters"]);
      const collected: ChapterItem[] = [];
      for (const raw of chapters) {
        const chapter = asRecord(raw);
        const slug = asString(chapter["chapter_slug"]);
        const name = cleanText(asString(chapter["chapter_name"]));
        if (slug.length === 0) continue;
        const item: ChapterItem = {
          id: `/manga/${locator}/${slug}`,
          number: parseChapterNumber(name) ?? Number(asString(chapter["chapter_num"])) ?? null,
          language: "en",
        };
        if (name.length > 0) item.title = name;
        item.scanlator = WEB.replace("https://", "").replace(/^www\./, "");
        const uploadedAt = Date.parse(asString(chapter["updated_at"]));
        if (Number.isFinite(uploadedAt)) item.uploadedAt = uploadedAt;
        item.url = `${WEB}/manga/${locator}/${slug}`;
        collected.push(item);
      }
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
      const chapterUrl = value.startsWith("http") ? value : resolveUrl(WEB, value);
      const html = request(chapterUrl);
      const script = /(?:var|const|let)\s+cdns\s*=\s*(\[[\s\S]*?\]);[\s\S]*?(?:var|const|let)\s+backupImage\s*=\s*(\[[\s\S]*?\]);[\s\S]*?(?:var|const|let)\s+chapterImages\s*=\s*(\[[\s\S]*?\]);/.exec(
        html,
      );
      if (script) {
        const cdns = JSON.parse(script[1]) as unknown[];
        const backups = JSON.parse(script[2]) as unknown[];
        const images = JSON.parse(script[3]) as unknown[];
        const sources = [...cdns, ...backups].map((entry) => asString(entry));
        const base = sources.find((entry) => entry.length > 0);
        if (base !== undefined && images.length > 0) {
          const origin = base.endsWith("/") ? base : `${base}/`;
          return images.map((entry, index): PageItem => {
            const path = asString(entry).replace(/^\/+/, "").replace(/\/{2,}/g, "/");
            if (path.length === 0) {
              throw new ScraperError("PARSING_ERROR", "chapter page missing an image path");
            }
            return { index, url: `${origin}${path}`, isScrambled: false };
          });
        }
      }
      const $ = parseHTML(html);
      const images = $("div.container-chapter-reader > img");
      if (images.length === 0) {
        throw new ScraperError("PARSING_ERROR", "chapter carries no pages");
      }
      return images
        .map((index, element): PageItem => {
          const src = attrOf($(element), "src");
          if (src.length === 0) {
            throw new ScraperError("PARSING_ERROR", "chapter page missing an image source");
          }
          return { index, url: src.startsWith("http") ? src : resolveUrl(chapterUrl, src), isScrambled: false };
        })
        .get();
    }),
  );
  return 0;
}