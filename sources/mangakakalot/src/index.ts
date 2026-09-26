/// <reference path="./index.d.ts" />

import {
  cleanText,
  fail,
  fetch,
  ok,
  parseChapterNumber,
  parseHTML,
  resolveUrl,
  storageGet,
  type ChapterItem,
  type ErrorCode,
  type FilterSchema,
  type MangaDetails,
  type MangaItem,
  type PageItem,
  type PageResult,
  type SearchQuery,
  type SettingSchema,
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
  version: "1.1.0",
  abiVersion: 1,
  lang: "en",
  baseUrl: WEB,
  iconUrl: `${WEB}/images/logo.png`,
  nsfw: false,
  // The worker proxy and the browser runtime match an allowlist entry on the
  // exact host or on any subdomain of it, so the bare image domain already
  // covers its img-r1, img-r2 and imgs-2 hosts.
  allowedHosts: [
    "mangakakalove.com",
    "mangakakalot.gg",
    "2xstorage.com",
    "storage.waitst.com",
    "storage4.waitst.com",
  ],
  // Measured against the site: a 5 s gap between requests sustained 24
  // consecutive replies, while 3 s tripped the burst filter after 13 and 1 s
  // after 4. The filter is burst-triggered rather than a timed ban, since the
  // next request after a pause succeeds immediately.
  rateLimit: { intervalMs: 5000, burst: 1 },
  retry: { maxAttempts: 2, backoffMs: 30000 },
};

// The image hosts refuse any request without a site referer, so the canonical
// site origin travels with every page entry.
const IMAGE_REFERER = `${WEB}/`;

const SETTINGS: SettingSchema[] = [
  {
    id: "base_url",
    title: "Site address",
    description: "Custom site origin. Empty means the built-in address.",
    type: "text",
    placeholder: WEB,
    default: WEB,
  },
];

// A missing key means the built-in origin; an unparsable value falls back to
// it so a bad saved value cannot break every request.
function siteBase(): string {
  const override = storageGet("base_url");
  if (override && override.length > 0) {
    try {
      const url = new URL(override);
      if (url.protocol === "http:" || url.protocol === "https:") return url.origin;
    } catch {
      // fall through to the built-in origin
    }
  }
  return WEB;
}

// The medium is a separate classification on the site, not a genre, so the
// series page's medium entries are dropped from the genre list.
function isMediumGenre(value: string): boolean {
  return ["manga", "manhwa", "manhua"].includes(value.toLowerCase());
}

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
  { label: "$h0ta", value: "h0ta" },
  { label: "2019", value: "2019" },
  { label: "3", value: "3" },
  { label: "4-Koma", value: "4-koma" },
  { label: "ACADEMY", value: "academy" },
  { label: "ACTING", value: "acting" },
  { label: "Action", value: "action" },
  { label: "acton", value: "acton" },
  { label: "Adaptation", value: "adaptation" },
  { label: "Adult", value: "adult" },
  { label: "Adventure", value: "adventure" },
  { label: "adventurer", value: "adventurer" },
  { label: "Age gap", value: "age-gap" },
  { label: "Ai", value: "ai" },
  { label: "Ai art", value: "ai-art" },
  { label: "Aliens", value: "aliens" },
  { label: "Animals", value: "animals" },
  { label: "ANOTHERCHANCE", value: "anotherchance" },
  { label: "Anthology", value: "anthology" },
  { label: "APOCALYPSE", value: "apocalypse" },
  { label: "Artbook", value: "artbook" },
  { label: "Arts", value: "arts" },
  { label: "Avant Garde", value: "avant-garde" },
  { label: "Award Winning", value: "award-winning" },
  { label: "BASED ON A NOVEL", value: "based-on-a-novel" },
  { label: "Beasts", value: "beasts" },
  { label: "Blackmail", value: "blackmail" },
  { label: "BLOOD", value: "blood" },
  { label: "Bloody", value: "bloody" },
  { label: "Bodyswap", value: "bodyswap" },
  { label: "Boys Love", value: "boys-love" },
  { label: "Brocon siscon", value: "brocon-siscon" },
  { label: "BULLY", value: "bully" },
  { label: "BUSINESS", value: "business" },
  { label: "CALM PROTAGONIST", value: "calm-protagonist" },
  { label: "Cars", value: "cars" },
  { label: "Cartoon", value: "cartoon" },
  { label: "CEO", value: "ceo" },
  { label: "CHEAT", value: "cheat" },
  { label: "CHEAT SYSTEM", value: "cheat-system" },
  { label: "CHEAT SYSTEMS", value: "cheat-systems" },
  { label: "Cheating infidelity", value: "cheating-infidelity" },
  { label: "Childhood friends", value: "childhood-friends" },
  { label: "Chinese", value: "chinese" },
  { label: "College life", value: "college-life" },
  { label: "Comedy", value: "comedy" },
  { label: "COMEDYRETURNER", value: "comedyreturner" },
  { label: "Comic", value: "comic" },
  { label: "conspiracy", value: "conspiracy" },
  { label: "Contest winning", value: "contest-winning" },
  { label: "Cooking", value: "cooking" },
  { label: "CRAZY MC", value: "crazy-mc" },
  { label: "Creators", value: "creators" },
  { label: "Crime", value: "crime" },
  { label: "Crossdressing", value: "crossdressing" },
  { label: "Cultivation", value: "cultivation" },
  { label: "DARK LORD", value: "dark-lord" },
  { label: "DEATH FLAG", value: "death-flag" },
  { label: "Death game", value: "death-game" },
  { label: "Degeneratemc", value: "degeneratemc" },
  { label: "delinquent", value: "delinquent" },
  { label: "Delinquents", value: "delinquents" },
  { label: "Dementia", value: "dementia" },
  { label: "Demons", value: "demons" },
  { label: "Detective", value: "detective" },
  { label: "Doujinshi", value: "doujinshi" },
  { label: "DRAGON", value: "dragon" },
  { label: "Drama", value: "drama" },
  { label: "Dungeons", value: "dungeons" },
  { label: "Ecchi", value: "ecchi" },
  { label: "EINEN", value: "einen" },
  { label: "EMPLOYEE", value: "employee" },
  { label: "Erotica", value: "erotica" },
  { label: "evolution", value: "evolution" },
  { label: "FAMILY", value: "family" },
  { label: "Fan Colored", value: "fan-colored" },
  { label: "Fantasy", value: "fantasy" },
  { label: "Female protagonists", value: "female-protagonists" },
  { label: "Fetish", value: "fetish" },
  { label: "FIGHT", value: "fight" },
  { label: "FIGHTING", value: "fighting" },
  { label: "Food", value: "food" },
  { label: "Full Color", value: "full-color" },
  { label: "future era", value: "future-era" },
  { label: "g0re", value: "g0re" },
  { label: "Game", value: "game" },
  { label: "GAMING", value: "gaming" },
  { label: "GANG", value: "gang" },
  { label: "GANGSTER", value: "gangster" },
  { label: "Gender bender", value: "gender-bender" },
  { label: "Genderswap", value: "genderswap" },
  { label: "GENIUS MC", value: "genius-mc" },
  { label: "Ghosts", value: "ghosts" },
  { label: "Girls Love", value: "girls-love" },
  { label: "GISAENG", value: "gisaeng" },
  { label: "Gore", value: "gore" },
  { label: "GORE GUNS", value: "gore-guns" },
  { label: "Gourmet", value: "gourmet" },
  { label: "Graphic Novel", value: "graphic-novel" },
  { label: "Gyaru", value: "gyaru" },
  { label: "Harem", value: "harem" },
  { label: "harem isekai", value: "harem-isekai" },
  { label: "Heartwarming", value: "heartwarming" },
  { label: "Hentai", value: "hentai" },
  { label: "Historical", value: "historical" },
  { label: "Horror", value: "horror" },
  { label: "Hot", value: "hot" },
  { label: "HUNTER", value: "hunter" },
  { label: "HUNTERS", value: "hunters" },
  { label: "Imageset", value: "imageset" },
  { label: "Incest", value: "incest" },
  { label: "Informative", value: "informative" },
  { label: "Isekai", value: "isekai" },
  { label: "Iyashikei", value: "iyashikei" },
  { label: "Japanese", value: "japanese" },
  { label: "Josei", value: "josei" },
  { label: "Kids", value: "kids" },
  { label: "Korean", value: "korean" },
  { label: "LADIES", value: "ladies" },
  { label: "LICE OF LIFE", value: "lice-of-life" },
  { label: "Liexing", value: "liexing" },
  { label: "Life", value: "life" },
  { label: "Live action", value: "live-action" },
  { label: "Loli", value: "loli" },
  { label: "Lolicon", value: "lolicon" },
  { label: "Long Strip", value: "long-strip" },
  { label: "Mafia", value: "mafia" },
  { label: "Magic", value: "magic" },
  { label: "Magical Girls", value: "magical-girls" },
  { label: "Mahou Shoujo", value: "mahou-shoujo" },
  { label: "Male protagonists", value: "male-protagonists" },
  { label: "Manga", value: "manga" },
  { label: "MANGA ADAPTATION", value: "manga-adaptation" },
  { label: "mangaa", value: "mangaa" },
  { label: "MANGATOON", value: "mangatoon" },
  { label: "Manhua", value: "manhua" },
  { label: "Manhwa", value: "manhwa" },
  { label: "manwha", value: "manwha" },
  { label: "Martial", value: "martial" },
  { label: "Martial arts", value: "martial-arts" },
  { label: "Master servant", value: "master-servant" },
  { label: "Mature", value: "mature" },
  { label: "MC", value: "mc" },
  { label: "Mecha", value: "mecha" },
  { label: "Medical", value: "medical" },
  { label: "MEDICAL SYSTEM", value: "medical-system" },
  { label: "MEDICALDRAMA", value: "medicaldrama" },
  { label: "MERCENARY", value: "mercenary" },
  { label: "Military", value: "military" },
  { label: "MMORPG", value: "mmorpg" },
  { label: "Moder", value: "moder" },
  { label: "Monster Girls", value: "monster-girls" },
  { label: "monster tamer", value: "monster-tamer" },
  { label: "Monsters", value: "monsters" },
  { label: "monsters action", value: "monsters-action" },
  { label: "MURIM", value: "murim" },
  { label: "Music", value: "music" },
  { label: "Mystery", value: "mystery" },
  { label: "NECROMANCER", value: "necromancer" },
  { label: "Netorare", value: "netorare" },
  { label: "Netori", value: "netori" },
  { label: "Ninja", value: "ninja" },
  { label: "Non human", value: "non-human" },
  { label: "of", value: "of" },
  { label: "Office", value: "office" },
  { label: "office politics", value: "office-politics" },
  { label: "Office Workers", value: "office-workers" },
  { label: "Official Colored", value: "official-colored" },
  { label: "Old people", value: "old-people" },
  { label: "Omegaverse", value: "omegaverse" },
  { label: "One shot", value: "one-shot" },
  { label: "OP", value: "op" },
  { label: "OP-MC", value: "op-mc" },
  { label: "Others", value: "others" },
  { label: "OTHERWORLD", value: "otherworld" },
  { label: "Overpowered", value: "overpowered" },
  { label: "Parody", value: "parody" },
  { label: "Philosophical", value: "philosophical" },
  { label: "Ping Ping Jun", value: "ping-ping-jun" },
  { label: "PLAYER", value: "player" },
  { label: "Police", value: "police" },
  { label: "POLITICAL", value: "political" },
  { label: "politics", value: "politics" },
  { label: "Pornographic", value: "pornographic" },
  { label: "Possessive", value: "possessive" },
  { label: "Post-Apocalyptic", value: "post-apocalyptic" },
  { label: "Psychological", value: "psychological" },
  { label: "R-18", value: "r-18" },
  { label: "REBIRTH", value: "rebirth" },
  { label: "REGRESSION", value: "regression" },
  { label: "reincarnated in the future", value: "reincarnated-in-the-future" },
  { label: "Reincarnation", value: "reincarnation" },
  { label: "RETURN", value: "return" },
  { label: "RETURNER", value: "returner" },
  { label: "Revenge", value: "revenge" },
  { label: "Reverse", value: "reverse" },
  { label: "Reverse Harem", value: "reverse-harem" },
  { label: "ROMA", value: "roma" },
  { label: "Romance", value: "romance" },
  { label: "Royal family", value: "royal-family" },
  { label: "Royalty", value: "royalty" },
  { label: "RUTHLESS PROTAGONIST", value: "ruthless-protagonist" },
  { label: "Safe", value: "safe" },
  { label: "sage", value: "sage" },
  { label: "Samurai", value: "samurai" },
  { label: "School", value: "school" },
  { label: "School life", value: "school-life" },
  { label: "Sci fi", value: "sci-fi" },
  { label: "Science fiction", value: "science-fiction" },
  { label: "Seinen", value: "seinen" },
  { label: "Self-Published", value: "self-published" },
  { label: "Sexual Violence", value: "sexual-violence" },
  { label: "Shota", value: "shota" },
  { label: "Shoujo", value: "shoujo" },
  { label: "Shoujo ai", value: "shoujo-ai" },
  { label: "Shounen", value: "shounen" },
  { label: "Shounen ai", value: "shounen-ai" },
  { label: "Showbiz", value: "showbiz" },
  { label: "SI-FI", value: "si-fi" },
  { label: "SINGER", value: "singer" },
  { label: "SLAVES", value: "slaves" },
  { label: "Slice", value: "slice" },
  { label: "SLICE OF LIF", value: "slice-of-lif" },
  { label: "Slice of life", value: "slice-of-life" },
  { label: "Sm bdsm", value: "sm-bdsm" },
  { label: "SMART MC", value: "smart-mc" },
  { label: "Smut", value: "smut" },
  { label: "Soft Yaoi", value: "soft-yaoi" },
  { label: "Space", value: "space" },
  { label: "Sports", value: "sports" },
  { label: "Spy", value: "spy" },
  { label: "Step family", value: "step-family" },
  { label: "SUGGESTIVE", value: "suggestive" },
  { label: "Super Power", value: "super-power" },
  { label: "Superhero", value: "superhero" },
  { label: "SUPERNATURA", value: "supernatura" },
  { label: "Supernatural", value: "supernatural" },
  { label: "superpower", value: "superpower" },
  { label: "SUPERPOWERS", value: "superpowers" },
  { label: "SUPERPOWERS SYSTEM", value: "superpowers-system" },
  { label: "Survival", value: "survival" },
  { label: "Suspense", value: "suspense" },
  { label: "SWORD AND MAGIC", value: "sword-and-magic" },
  { label: "SWORDS", value: "swords" },
  { label: "System", value: "system" },
  { label: "SYSTEMS", value: "systems" },
  { label: "TAMER", value: "tamer" },
  { label: "Teacher student", value: "teacher-student" },
  { label: "TERROR", value: "terror" },
  { label: "Thriller", value: "thriller" },
  { label: "Time Travel", value: "time-travel" },
  { label: "TOWER", value: "tower" },
  { label: "Traditional Games", value: "traditional-games" },
  { label: "Tragedy", value: "tragedy" },
  { label: "Tragic", value: "tragic" },
  { label: "TRANSMIGRATING", value: "transmigrating" },
  { label: "Transmigration", value: "transmigration" },
  { label: "traverse", value: "traverse" },
  { label: "UNPARALLELED", value: "unparalleled" },
  { label: "urban fantasy", value: "urban-fantasy" },
  { label: "User Created", value: "user-created" },
  { label: "Vampires", value: "vampires" },
  { label: "vi0lence", value: "vi0lence" },
  { label: "video game", value: "video-game" },
  { label: "Video Games", value: "video-games" },
  { label: "villain", value: "villain" },
  { label: "Villainess", value: "villainess" },
  { label: "Violence", value: "violence" },
  { label: "VIRTUAL", value: "virtual" },
  { label: "Virtual Reality", value: "virtual-reality" },
  { label: "Voilence", value: "voilence" },
  { label: "vrmmo", value: "vrmmo" },
  { label: "WEAK TO STRONG", value: "weak-to-strong" },
  { label: "Web Comic", value: "web-comic" },
  { label: "Webtoons", value: "webtoons" },
  { label: "Western", value: "western" },
  { label: "WORK-LIFE", value: "work-life" },
  { label: "Wuxia", value: "wuxia" },
  { label: "Xianxia", value: "xianxia" },
  { label: "Yaoi", value: "yaoi" },
  { label: "Yaoi(BL)", value: "yaoi-bl" },
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
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Json)
    : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

// The chapter API sends chapter_num as a JSON number and omits it on records
// the site has not numbered, so the chapter name is the fallback.
function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

// The site answers an over-fast client with a bot challenge, and reports it as
// HTTP 429 carrying a cf-mitigated header. A plain 429 means the request
// budget was spent without an interstitial, so the two cases map to different
// error codes: a challenge needs a browser to clear, a rate limit only needs
// the caller to slow down. Hosts lower-case response header names.
function isChallenge(status: number, headers: Record<string, string>, body: string): boolean {
  if (status !== 429 && status !== 403) return false;
  if ((headers["cf-mitigated"] ?? "").toLowerCase() === "challenge") return true;
  if (headers["cf-chl-bypass"] !== undefined) return true;
  return /just a moment|cf-challenge|challenge-platform|__cf_chl/i.test(body);
}

function mapHttpStatus(status: number, headers?: Record<string, string>, body?: string): ErrorCode {
  if (headers && body !== undefined && isChallenge(status, headers, body)) {
    return "CLOUDFLARE_BLOCKED";
  }
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
      Accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
      Referer: `${siteBase()}/`,
      "Sec-Fetch-Dest": "document",
      "Sec-Fetch-Mode": "navigate",
      "Sec-Fetch-Site": "same-origin",
      "Upgrade-Insecure-Requests": "1",
    },
  });
  if (response.status < 200 || response.status >= 300) {
    throw new ScraperError(
      mapHttpStatus(response.status, response.headers, response.body),
      `HTTP ${response.status}`,
    );
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
    return JSON.stringify(
      fail("PARSING_ERROR", error instanceof Error ? error.message : String(error)),
    );
  }
}

function absoluteUrl(value: string): string | undefined {
  if (value.length === 0) return undefined;
  if (value.startsWith("http://") || value.startsWith("https://")) return value;
  return `${siteBase()}${value.startsWith("/") ? "" : "/"}${value}`;
}

function attrOf(element: { attr(name: string): string | undefined }, name: string): string {
  const value = element.attr(name);
  return typeof value === "string" ? value.trim() : "";
}

// A series locator is the slug that follows the site's manga prefix, or a
// chapter path's segments when a full URL is given.
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
    return `${siteBase()}/search/story/${encodeURIComponent(normalizeSearchQuery(trimmed))}?page=${page}`;
  }
  const sort = asString(filters["sort"]) || "latest";
  const status = asString(filters["status"]) || "all";
  const genre = asString(filters["genre"]) || "all";
  const id = FILTER_IDS[`${sort}:${status}`];
  const url = new URL(`${siteBase()}/genre/${encodeURIComponent(genre)}`);
  if (id !== undefined) url.searchParams.set("filter", id);
  url.searchParams.set("page", String(page));
  return url.toString();
}

// Search results paginate through a Next/Previous widget, unlike the numbered
// genre listings: an enabled Next link means another page follows. The path
// decides the widget, not the markup alone, so the numbered rule stays for
// listings and the link rule handles search pages.
function listingHasNextPage(path: string, $: ReturnType<typeof parseHTML>): boolean {
  if (path.includes("/search/story/")) {
    // The widget renders both walk links on every page and marks the
    // unavailable one, so only an enabled Next link means another page.
    const enabled = $("a.page_blue:not(.page_disabled)");
    return (
      enabled.filter((_, element) => cleanText($(element).text()).toLowerCase() === "next").length >
      0
    );
  }
  return hasNextPage($);
}

function hasNextPage($: ReturnType<typeof parseHTML>): boolean {
  return $("a.page_select + a:not(.page_last), a.page-select + a:not(.page-last)").length > 0;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// The info block names a field and its value on one line, after a colon. The
// value is the anchor text when the site links it and the remaining text
// otherwise.
function labeledText(info: ReturnType<ReturnType<typeof parseHTML>>, label: string): string {
  const prefix = new RegExp(`^${escapeRegExp(label)}\\s*:`, "i");
  const rows = info.find("li");
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows.eq(index);
    const text = cleanText(row.text());
    if (!prefix.test(text)) continue;
    const linked = cleanText(row.find("a").first().text());
    return linked.length > 0 ? linked : text.replace(prefix, "").trim();
  }
  return "";
}

function mangaFromAnchor(
  scope: ReturnType<ReturnType<typeof parseHTML>>,
  href: string,
  title: string,
): MangaItem {
  const item: MangaItem = {
    id: seriesLocator(href),
    title,
    url: href.startsWith("http") ? href : resolveUrl(siteBase(), href),
  };
  const cover = scope.find("img").first().attr("src");
  if (typeof cover === "string" && cover.length > 0) item.coverUrl = absoluteUrl(cover);
  return item;
}

// The info block carries the authors as one comma-separated line and cuts the
// tail off with an ellipsis, so each name becomes its own entry.
function authorList(info: ReturnType<ReturnType<typeof parseHTML>>): string[] {
  return labeledText(info, "author(s)")
    .split(",")
    .map((name) => cleanText(name.replace(/\.{3}$/, "")))
    .filter((name) => name.length > 0);
}

// Genres are the anchors inside the genres row only, so the query stays on
// the row instead of re-scoping to the page. The row mixes medium entries
// into the genres, and those are dropped.
function infoGenres(info: ReturnType<ReturnType<typeof parseHTML>>): string[] {
  return info
    .find("li.genres a")
    .map((_, element) => cleanText(info.find(element).text()))
    .get()
    .filter((name) => name.length > 0 && !isMediumGenre(name));
}

// The details page keeps a legacy alternate-title row on some titles while the
// current markup drops it entirely, so the check probes both before giving up.
function infoAltTitle(info: ReturnType<ReturnType<typeof parseHTML>>): string {
  const legacy = cleanText(
    info.find(".story-alternative, tr:has(.info-alternative) h2").first().text(),
  );
  if (legacy.length > 0) return legacy;
  const heading = info
    .find("h2, h3")
    .get()
    .map((element) => cleanText(info.find(element).text()));
  const title = info.find("h1").first().text();
  if (title.length > 0) {
    const other = heading.find((entry) => entry.length > 0 && entry !== cleanText(title));
    if (other !== undefined) return other;
  }
  return "";
}

export function get_metadata(): I32 {
  Host.outputString(JSON.stringify(metadata));
  return 0;
}

export function get_filters(): I32 {
  Host.outputString(JSON.stringify(FILTERS));
  return 0;
}

export function get_settings(): I32 {
  Host.outputString(JSON.stringify(SETTINGS));
  return 0;
}

export function search(): I32 {
  const input = JSON.parse(Host.inputString()) as SearchQuery;
  const page = typeof input.page === "number" && input.page >= 1 ? input.page : 1;
  const url = searchUrl(input.query ?? "", page, asRecord(input.filters));
  Host.outputString(
    runExport(() => {
      const $ = parseHTML(request(url));
      const items: MangaItem[] = [];
      $(".panel_story_list .story_item, div.list-truyen-item-wrap, div.list-comic-item-wrap").each(
        (_, element) => {
          const scope = $(element);
          const anchor = scope.find("h3 a").first();
          const href = attrOf(anchor, "href");
          const title = cleanText(anchor.text());
          if (href.length === 0 || title.length === 0) return;
          items.push(mangaFromAnchor(scope, href, title));
        },
      );
      const result: PageResult<MangaItem> = {
        page,
        hasNextPage: listingHasNextPage(url, $),
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
      const $ = parseHTML(request(`${siteBase()}/manga/${locator}`));
      const info = $("div.manga-info-top, div.panel-story-info").first();
      const title = cleanText(info.find("h1, h2").first().text());
      if (title.length === 0) {
        throw new ScraperError("NOT_FOUND", `no title for ${locator}`);
      }
      const details: MangaDetails = {
        id: locator,
        title,
        status: statusOf(info.text()),
        chapters: [],
      };
      const cover = $("div.manga-info-pic img, span.info-image img").first().attr("src");
      if (typeof cover === "string" && cover.length > 0) details.coverUrl = absoluteUrl(cover);
      const authors = authorList(info);
      if (authors.length > 0) details.authors = authors;
      const genres = infoGenres(info);
      if (genres.length > 0) details.genres = genres;
      const description = cleanText(
        $("div#noidungm, div#panel-story-info-description, div#contentBox").first().text(),
      ).replace(new RegExp(`^${escapeRegExp(title)}\\s+summary:\\s*`, "i"), "");
      if (description.length > 0) details.description = description;
      const altName = infoAltTitle(info);
      if (altName.length > 0) {
        details.altTitles = [altName];
      }

      const chapterBody = requestJson(`${siteBase()}/api/manga/${locator}/chapters?limit=-1`);
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
          number: asNumber(chapter["chapter_num"]) ?? parseChapterNumber(name) ?? null,
          language: "en",
        };
        if (name.length > 0) item.title = name;
        item.scanlator = siteBase()
          .replace("https://", "")
          .replace(/^www\./, "");
        const uploadedAt = Date.parse(asString(chapter["updated_at"]));
        if (Number.isFinite(uploadedAt)) item.uploadedAt = uploadedAt;
        item.url = `${siteBase()}/manga/${locator}/${slug}`;
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
      const chapterUrl = value.startsWith("http") ? value : resolveUrl(siteBase(), value);
      const html = request(chapterUrl);
      const script =
        /(?:var|const|let)\s+cdns\s*=\s*(\[[\s\S]*?\]);[\s\S]*?(?:var|const|let)\s+backupImage\s*=\s*(\[[\s\S]*?\]);[\s\S]*?(?:var|const|let)\s+chapterImages\s*=\s*(\[[\s\S]*?\]);/.exec(
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
            const path = asString(entry)
              .replace(/^\/+/, "")
              .replace(/\/{2,}/g, "/");
            if (path.length === 0) {
              throw new ScraperError("PARSING_ERROR", "chapter page missing an image path");
            }
            return {
              index,
              url: `${origin}${path}`,
              headers: { Referer: IMAGE_REFERER },
              isScrambled: false,
            };
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
          return {
            index,
            url: src.startsWith("http") ? src : resolveUrl(chapterUrl, src),
            headers: { Referer: IMAGE_REFERER },
            isScrambled: false,
          };
        })
        .get();
    }),
  );
  return 0;
}
