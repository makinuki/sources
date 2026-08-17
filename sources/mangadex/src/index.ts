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

const API = "https://api.mangadex.org";
const CDN = "https://uploads.mangadex.org";
const WEB = "https://mangadex.org";
const LANG = "en";
const MANGA_LIMIT = 20;
const CHAPTER_LIMIT = 500;
const BLOCKED_GROUPS = [
  "5fed0576-8b94-4f9a-b6a7-08eecd69800d",
  "06a9fecb-b608-4f19-b93c-7caab06b7f44",
  "8d8ecf83-8d42-4f8c-add8-60963f9f28d9",
  "caa63201-4a17-4b7f-95ff-ed884a2b7e60",
  "319c1b10-cbd0-4f55-a46e-c4ee17e65139",
  "4f1de6a2-f0c5-4ac5-bce5-02c7dbb67deb",
];
const LEGACY_NO_GROUP = "00e03853-1b96-4f41-9542-c71b8692033b";
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
  if (status === 404) return "NOT_FOUND";
  if (status === 429) return "RATE_LIMITED";
  if (status >= 500) return "SOURCE_OFFLINE";
  return "NETWORK_TIMEOUT";
}

function requestJson(url: string): RecordObject {
  const response = fetch({ url, method: "GET", headers: { Accept: "application/json" } });
  if (response.status < 200 || response.status >= 300) {
    let detail = "";
    try {
      const parsed = asRecord(JSON.parse(response.body));
      const errors = asArray(parsed["errors"]);
      const firstDetail = errors.length > 0 ? asRecord(errors[0])["detail"] : undefined;
      if (typeof firstDetail === "string") detail = firstDetail;
    } catch {
      // ignore malformed error bodies
    }
    throw new ScraperError(mapHttpStatus(response.status), detail || `HTTP ${response.status}`);
  }
  return asRecord(JSON.parse(response.body));
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

function pickTitle(attrs: RecordObject): string {
  const candidates: string[] = [];
  const title = asRecord(attrs["title"]);
  const direct = title[LANG];
  if (typeof direct === "string" && direct.length > 0) candidates.push(direct);
  for (const lang of ["en", "ko", "ja", "zh", "es", "pt-br"]) {
    const value = title[lang];
    if (typeof value === "string" && value.length > 0 && !candidates.includes(value)) candidates.push(value);
  }
  for (const value of Object.values(title)) {
    if (typeof value === "string" && value.length > 0 && !candidates.includes(value)) candidates.push(value);
  }
  for (const alt of asArray(attrs["altTitles"])) {
    for (const value of Object.values(asRecord(alt))) {
      if (typeof value === "string" && value.length > 0 && !candidates.includes(value)) candidates.push(value);
    }
  }
  return candidates[0] ?? "";
}

function unescapeHtml(input: string): string {
  return input
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, " ");
}

function cleanDescription(input: string): string {
  return unescapeHtml(
    cleanText(
      input
        .split("\n---")[0]
        .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
        .replace(/\*+\s*([^*]*)\s*\*+/g, "$1")
        .replace(/_+\s*([^_]*)\s*_+/g, "$1"),
    ),
  );
}

function relationshipAll(record: RecordObject, type: string): RecordObject[] {
  return asArray(record["relationships"])
    .map((rel) => asRecord(rel))
    .filter((entry) => entry["type"] === type);
}

function relationship(record: RecordObject, type: string): RecordObject {
  const found = relationshipAll(record, type);
  return found.length > 0 ? found[0] : {};
}

const metadata: SourceMetadata = {
  id: "mangadex",
  name: "MangaDex",
  version: "1.0.0",
  abiVersion: 1,
  lang: "multi",
  baseUrl: WEB,
  iconUrl: "https://mangadex.org/favicon.ico",
  nsfw: false,
};

const SORT_OPTIONS: Array<{ label: string; value: string }> = [
  { label: "Relevance", value: "relevance_desc" },
  { label: "Title A-Z", value: "title_asc" },
  { label: "Title Z-A", value: "title_desc" },
  { label: "Latest upload", value: "latestUploadedChapter_desc" },
  { label: "Oldest upload", value: "latestUploadedChapter_asc" },
  { label: "Most follows", value: "followedCount_desc" },
  { label: "Created at", value: "createdAt_desc" },
  { label: "Updated at", value: "updatedAt_desc" },
  { label: "Year (newest)", value: "year_desc" },
  { label: "Year (oldest)", value: "year_asc" },
  { label: "Rating", value: "rating_desc" },
];

function sortToQuery(value: string | undefined): { field: string; direction: string } {
  const parts = value?.split("_") ?? [];
  const direction = parts[parts.length - 1];
  if ((direction === "asc" || direction === "desc") && parts.length > 1) {
    return { field: parts.slice(0, -1).join("_"), direction };
  }
  return { field: "relevance", direction: "desc" };
}

const TAGS: Array<{ id: string; name: string }> = [
  { id: "391b0423-d847-456f-aff0-8b0cfc03066b", name: "Action" },
  { id: "87cc87cd-a395-47af-b27a-93258283bbc6", name: "Adventure" },
  { id: "5920b825-4181-4a17-beeb-9918b0ff7a30", name: "Boys' Love" },
  { id: "4d32cc48-9f00-4cca-9b5a-a839f0764984", name: "Comedy" },
  { id: "5ca48985-9a9d-4bd8-be29-80dc0303db72", name: "Crime" },
  { id: "b9af3a63-f058-46de-a9a0-e0c13906197a", name: "Drama" },
  { id: "cdc58593-87dd-415e-bbc0-2ec27bf404cc", name: "Fantasy" },
  { id: "a3c67850-4684-404e-9b7f-c69850ee5da6", name: "Girls' Love" },
  { id: "33771934-028e-4cb3-8744-691e866a923e", name: "Historical" },
  { id: "cdad7e68-1419-41dd-bdce-27753074a640", name: "Horror" },
  { id: "ace04997-f6bd-436e-b261-779182193d3d", name: "Isekai" },
  { id: "81c836c9-914a-4eca-981a-560dad663e73", name: "Magical Girls" },
  { id: "50880a9d-5440-4732-9afb-8f457127e836", name: "Mecha" },
  { id: "c8cbe35b-1b2b-4a3f-9c37-db84c4514856", name: "Medical" },
  { id: "ee968100-4191-4968-93d3-f82d72be7e46", name: "Mystery" },
  { id: "b1e97889-25b4-4258-b28b-cd7f4d28ea9b", name: "Philosophical" },
  { id: "423e2eae-a7a2-4a8b-ac03-a8351462d71d", name: "Romance" },
  { id: "256c8bd9-4904-4360-bf4f-508a76d67183", name: "Sci-Fi" },
  { id: "e5301a23-ebd9-49dd-a0cb-2add944c7fe9", name: "Slice of Life" },
  { id: "69964a64-2f90-4d33-beeb-f3ed2875eb4c", name: "Sports" },
  { id: "7064a261-a137-4d3a-8848-2d385de3a99c", name: "Superhero" },
  { id: "07251805-a27e-4d59-b488-f0bfbec15168", name: "Thriller" },
  { id: "f8f62932-27da-4fe4-8ee1-6779a8c5edba", name: "Tragedy" },
  { id: "acc803a4-c95a-4c22-86fc-eb6b582d82a2", name: "Wuxia" },
  { id: "b29d6a3d-1569-4e7a-8caf-7557bc92cd5d", name: "Gore" },
  { id: "97893a4c-12af-4dac-b6be-0dffb353568e", name: "Sexual Violence" },
  { id: "b11fda93-8f1d-4bef-b2ed-8803d3733170", name: "Yonkoma" },
  { id: "f4122d1c-3b44-44d0-9936-ff7502c39ad3", name: "Adaptation" },
  { id: "51d83883-4103-437c-b4b1-731cb73d786c", name: "Anthology" },
  { id: "0a39b5a1-b235-4886-a747-1d05d216532d", name: "Award Winning" },
  { id: "b13b2a48-c720-44a9-9c77-39c9979373fb", name: "Doujinshi" },
  { id: "7b2ce280-79ef-4c09-9b58-12b7c23a9b78", name: "Fan Colored" },
  { id: "f5ba408b-0e7a-484d-8d49-4e9125ac96de", name: "Full Color" },
  { id: "3e2b8dae-350e-4ab8-a8ce-016e844b9f0d", name: "Long Strip" },
  { id: "320831a8-4026-470b-94f6-8353740e6f04", name: "Official Colored" },
  { id: "0234a31e-a729-4e28-9d6a-3f87c4966b9e", name: "Oneshot" },
  { id: "891cf039-b895-47f0-9229-bef4c96eccd4", name: "User Created" },
  { id: "e197df38-d0e7-43b5-9b09-2842d0c326dd", name: "Web Comic" },
  { id: "e64f6742-c834-471d-8d72-dd51fc02b835", name: "Aliens" },
  { id: "3de8c75d-8ee3-48ff-98ee-e20a65c86451", name: "Animals" },
  { id: "ea2bc92d-1c26-4930-9b7c-d5c0dc1b6869", name: "Cooking" },
  { id: "9ab53f92-3eed-4e9b-903a-917c86035ee3", name: "Crossdressing" },
  { id: "da2d50ca-3018-4cc0-ac7a-6b7d472a29ea", name: "Delinquents" },
  { id: "39730448-9a5f-48a2-85b0-a70db87b1233", name: "Demons" },
  { id: "2bd2e8d0-f146-434a-9b51-fc9ff2c5fe6a", name: "Gender Swap" },
  { id: "3bb26d85-09d5-4d2e-880c-c34b974339e9", name: "Ghosts" },
  { id: "fad12b5e-68ba-460e-b933-9ae8318f5b65", name: "Gyaru" },
  { id: "aafb99c1-7f60-43fa-b75f-fc9502ce29c7", name: "Harem" },
  { id: "5bd0e105-4481-44ca-b6e7-7544da56b1a3", name: "Incest" },
  { id: "2d1f5d56-a1e5-4d0d-a961-2193588b08ec", name: "Loli" },
  { id: "85daba54-a71c-4554-8a28-9901a8b0afad", name: "Mafia" },
  { id: "a1f53773-c69a-4ce5-8cab-fffcd90b1565", name: "Magic" },
  { id: "799c202e-7daa-44eb-9cf7-8a3c0441531e", name: "Martial Arts" },
  { id: "ac72833b-c4e9-4878-b9db-6c8a4a99444a", name: "Military" },
  { id: "dd1f77c5-dea9-4e2b-97ae-224af09caf99", name: "Monster Girls" },
  { id: "36fd93ea-e8b8-445e-b836-358f02b3d33d", name: "Monsters" },
  { id: "f42fbf9e-188a-447b-9fdc-f19dc1e4d685", name: "Music" },
  { id: "489dd859-9b61-4c37-af75-5b18e88daafc", name: "Ninja" },
  { id: "92d6d951-ca5e-429c-ac78-451071cbf064", name: "Office Workers" },
  { id: "df33b754-73a3-4c54-80e6-1a74a8058539", name: "Police" },
  { id: "9467335a-1b83-4497-9231-765337a00b96", name: "Post-Apocalyptic" },
  { id: "3b60b75c-a2d7-4860-ab56-05f391bb889c", name: "Psychological" },
  { id: "0bc90acb-ccc1-44ca-a34a-b9f3a73259d0", name: "Reincarnation" },
  { id: "65761a2a-415e-47f3-bef2-a9dababba7a6", name: "Reverse Harem" },
  { id: "81183756-1453-4c81-aa9e-f6e1b63be016", name: "Samurai" },
  { id: "caaa44eb-cd40-4177-b930-79d3ef2afe87", name: "School Life" },
  { id: "ddefd648-5140-4e5f-ba18-4eca4071d19b", name: "Shota" },
  { id: "eabc5b4c-6aff-42f3-b657-3e90cbd00b75", name: "Supernatural" },
  { id: "5fff9cde-849c-4d78-aab0-0d52b2ee1d25", name: "Survival" },
  { id: "292e862b-2d17-4062-90a2-0356caa4ae27", name: "Time Travel" },
  { id: "31932a7e-5b8e-49a6-9f12-2afa39dc544c", name: "Traditional Games" },
  { id: "d7d1730f-6eb0-4ba6-9437-602cac38664c", name: "Vampires" },
  { id: "9438db5a-7e2a-4ac0-b39e-e0d95a34b8a8", name: "Video Games" },
  { id: "d14322ac-4d6f-4e9b-afd9-629d5f4d8a41", name: "Villainess" },
  { id: "8c86611e-fab7-4986-9dec-d1a2f44acdd5", name: "Virtual Reality" },
  { id: "631ef465-9aba-4afb-b0fc-ea10efe274a8", name: "Zombies" },
];

const FILTERS: FilterSchema[] = (() => {
  const checkboxes: Array<{ id: string; label: string; default: boolean }> = [
    { id: "hasAvailableChapters", label: "Has available chapters", default: false },
    { id: "originalLanguage.ja", label: "Original: Japanese", default: false },
    { id: "originalLanguage.zh", label: "Original: Chinese", default: false },
    { id: "originalLanguage.ko", label: "Original: Korean", default: false },
    { id: "contentRating.safe", label: "Content: Safe", default: true },
    { id: "contentRating.suggestive", label: "Content: Suggestive", default: true },
    { id: "contentRating.erotica", label: "Content: Erotica", default: true },
    { id: "contentRating.pornographic", label: "Content: Pornographic", default: true },
    { id: "demographic.none", label: "Demographic: None", default: false },
    { id: "demographic.shounen", label: "Demographic: Shounen", default: false },
    { id: "demographic.shoujo", label: "Demographic: Shoujo", default: false },
    { id: "demographic.seinen", label: "Demographic: Seinen", default: false },
    { id: "demographic.josei", label: "Demographic: Josei", default: false },
    { id: "status.ongoing", label: "Status: Ongoing", default: false },
    { id: "status.completed", label: "Status: Completed", default: false },
    { id: "status.hiatus", label: "Status: On hiatus", default: false },
    { id: "status.cancelled", label: "Status: Cancelled", default: false },
  ];

  const result: FilterSchema[] = [];
  for (const box of checkboxes) {
    result.push({ id: box.id, title: box.label, type: "checkbox", default: box.default });
  }
  result.push({ id: "sort", title: "Sort", type: "select", options: SORT_OPTIONS, default: "relevance_desc" });
  result.push({
    id: "includedTagsMode",
    title: "Included tags mode",
    type: "select",
    options: [
      { label: "AND", value: "AND" },
      { label: "OR", value: "OR" },
    ],
    default: "AND",
  });
  result.push({
    id: "excludedTagsMode",
    title: "Excluded tags mode",
    type: "select",
    options: [
      { label: "AND", value: "AND" },
      { label: "OR", value: "OR" },
    ],
    default: "OR",
  });
  for (const tag of TAGS) {
    result.push({
      id: tag.id,
      title: tag.name,
      type: "tri_state",
      options: [{ label: tag.name, value: tag.id }],
    });
  }
  return result;
})();

interface NormalizedFilters {
  hasAvailableChapters: boolean;
  originalLanguages: string[];
  contentRatings: string[];
  demographics: string[];
  statuses: string[];
  sort: { field: string; direction: string };
  includedTagsMode: string;
  excludedTagsMode: string;
  includedTags: string[];
  excludedTags: string[];
}

function normalizeFilters(raw: RecordObject | undefined): NormalizedFilters {
  const asBool = (key: string, fallback: boolean): boolean => {
    const value = raw?.[key];
    return typeof value === "boolean" ? value : fallback;
  };
  const asString = (key: string, fallback: string): string => {
    const value = raw?.[key];
    return typeof value === "string" ? value : fallback;
  };
  const checkedValues = (prefix: string, defaults: string[]): string[] => {
    const checked: string[] = [];
    for (const key of Object.keys(raw ?? {})) {
      if (key.startsWith(prefix + ".") && asBool(key, false)) checked.push(key.slice(prefix.length + 1));
    }
    return checked.length > 0 ? checked : defaults;
  };

  const includedTags: string[] = [];
  const excludedTags: string[] = [];
  for (const [key, value] of Object.entries(raw ?? {})) {
    if (typeof value !== "object" || value === null || Array.isArray(value)) continue;
    for (const [tagId, sign] of Object.entries(value as Record<string, "+" | "-">)) {
      if (sign === "+") includedTags.push(tagId);
      if (sign === "-") excludedTags.push(tagId);
    }
  }

  return {
    hasAvailableChapters: asBool("hasAvailableChapters", false),
    originalLanguages: checkedValues("originalLanguage", []),
    contentRatings: checkedValues("contentRating", ["safe", "suggestive", "erotica", "pornographic"]),
    demographics: checkedValues("demographic", []),
    statuses: checkedValues("status", []),
    sort: sortToQuery(asString("sort", "relevance_desc")),
    includedTagsMode: asString("includedTagsMode", "AND"),
    excludedTagsMode: asString("excludedTagsMode", "OR"),
    includedTags,
    excludedTags,
  };
}

function addParams(url: URL, params: Record<string, string | string[] | undefined>) {
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      for (const item of value) url.searchParams.append(key, item);
    } else {
      url.searchParams.append(key, value);
    }
  }
}

function searchUrl(query: string, page: number, filters: NormalizedFilters): string {
  const url = new URL(`${API}/manga`);
  addParams(url, {
    limit: String(MANGA_LIMIT),
    offset: String(MANGA_LIMIT * (page - 1)),
    "includes[]": "cover_art",
    "contentRating[]": filters.contentRatings,
    "originalLanguage[]": filters.originalLanguages,
    "publicationDemographic[]": filters.demographics,
    "status[]": filters.statuses,
    "includedTags[]": filters.includedTags,
    "excludedTags[]": filters.excludedTags,
    includedTagsMode: filters.includedTagsMode,
    excludedTagsMode: filters.excludedTagsMode,
    [`order[${filters.sort.field}]`]: filters.sort.direction,
  });
  if (filters.hasAvailableChapters) {
    url.searchParams.append("hasAvailableChapters", "true");
  }
  const trimmed = query.trim();
  if (trimmed.startsWith("id:")) {
    const id = trimmed.slice(3).trim();
    if (!id) throw new ScraperError("PARSING_ERROR", "missing id after the id: prefix");
    url.searchParams.append("ids[]", id);
  } else if (trimmed.startsWith("grp:")) {
    const id = trimmed.slice(4).trim();
    if (!id) throw new ScraperError("PARSING_ERROR", "missing id after the grp: prefix");
    url.searchParams.append("group", id);
  } else if (trimmed.startsWith("author:")) {
    const id = trimmed.slice(7).trim();
    if (!id) throw new ScraperError("PARSING_ERROR", "missing id after the author: prefix");
    url.searchParams.append("authorOrArtist", id);
  } else if (trimmed.length > 0) {
    url.searchParams.append("title", trimmed.replace(/\s+/g, " "));
  }
  return url.toString();
}

function coverUrl(data: RecordObject): string {
  const id = String(data["id"]);
  const file = asRecord(relationship(data, "cover_art")["attributes"])["fileName"];
  return typeof file === "string" && file.length > 0 ? `${CDN}/covers/${id}/${file}` : `${WEB}/favicon.ico`;
}

function createMangaItem(data: RecordObject): MangaItem {
  const item: MangaItem = {
    id: String(data["id"]),
    title: cleanText(pickTitle(asRecord(data["attributes"]))) || "Untitled",
    coverUrl: coverUrl(data),
    url: `${WEB}/title/${String(data["id"])}`,
  };
  const latest = asRecord(data["attributes"])["latestChapter"];
  if (typeof latest === "string" && latest.length > 0) item.latestChapter = "Ch. " + latest;
  return item;
}

function chapterNumber(attrs: RecordObject): number | null {
  const chapter = attrs["chapter"];
  if (typeof chapter !== "string") return null;
  return parseChapterNumber(chapter);
}

function createChapterItem(data: RecordObject): ChapterItem {
  const id = String(data["id"]);
  const attrs = asRecord(data["attributes"]);
  const groups = relationshipAll(data, "scanlation_group")
    .filter((group) => group["id"] !== LEGACY_NO_GROUP)
    .map((group) => asRecord(group["attributes"])["name"])
    .filter((name): name is string => typeof name === "string" && name.length > 0)
    .filter((name, index, all) => all.indexOf(name) === index);
  const users = relationshipAll(data, "user")
    .map((user) => asRecord(user["attributes"])["username"])
    .filter((name): name is string => typeof name === "string" && name.length > 0);

  const item: ChapterItem = { id, number: chapterNumber(attrs) };
  const language = attrs["translatedLanguage"];
  if (typeof language === "string" && language.length > 0) item.language = language;
  const title = typeof attrs["title"] === "string" ? unescapeHtml(cleanText(attrs["title"])) : "";
  if (title.length > 0) item.title = title;
  const publishAt = typeof attrs["publishAt"] === "string" ? Date.parse(attrs["publishAt"]) : NaN;
  if (!Number.isNaN(publishAt) && publishAt >= 0) item.uploadedAt = publishAt;
  const scanlator = groups.length > 0 ? groups.join(" & ") : users.length > 0 ? users.join(" & ") : undefined;
  if (scanlator) item.scanlator = scanlator;
  item.url = `${WEB}/chapter/${id}`;
  return item;
}

function createMangaDetails(data: RecordObject): MangaDetails {
  const id = String(data["id"]);
  const attrs = asRecord(data["attributes"]);
  const details: MangaDetails = {
    id,
    title: cleanText(pickTitle(attrs)) || "Untitled",
    status: "Unknown",
    coverUrl: coverUrl(data),
    chapters: [],
  };

  const altTitles: string[] = [];
  for (const alt of asArray(attrs["altTitles"])) {
    for (const value of Object.values(asRecord(alt))) {
      if (typeof value === "string" && value.length > 0 && !altTitles.includes(value)) altTitles.push(value);
    }
  }
  if (altTitles.length > 0) details.altTitles = altTitles;

  const descriptionMap = asRecord(attrs["description"]);
  const description = descriptionMap[LANG] ?? descriptionMap["en"];
  if (typeof description === "string" && description.length > 0) {
    const cleaned = cleanDescription(description);
    if (cleaned.length > 0) details.description = cleaned;
  }

  const names = (type: string): string[] =>
    relationshipAll(data, type)
      .map((entry) => asRecord(entry["attributes"])["name"])
      .filter((name): name is string => typeof name === "string")
      .filter((name, index, all) => all.indexOf(name) === index);
  const authors = names("author");
  if (authors.length > 0) details.authors = authors;
  const artists = names("artist");
  if (artists.length > 0) details.artists = artists;

  const genres = asArray(attrs["tags"])
    .map((tag) => asRecord(asRecord(tag)["attributes"])["name"])
    .filter((name): name is string => typeof name === "string" && name.length > 0)
    .filter((name, index, all) => all.indexOf(name) === index);
  if (genres.length > 0) details.genres = genres;

  switch (attrs["status"]) {
    case "ongoing":
      details.status = "Ongoing";
      break;
    case "completed":
      details.status = "Completed";
      break;
    case "hiatus":
      details.status = "Hiatus";
      break;
    case "cancelled":
      details.status = "Cancelled";
      break;
    default:
      details.status = "Unknown";
  }

  return details;
}

function feedParams(): Record<string, string | string[]> {
  return {
    limit: String(CHAPTER_LIMIT),
    "includes[]": ["scanlation_group", "user"],
    "order[volume]": "desc",
    "order[chapter]": "desc",
    includeFuturePublishAt: "0",
    includeEmptyPages: "0",
    includeUnavailable: "0",
    "contentRating[]": ["safe", "suggestive", "erotica", "pornographic"],
    "excludedGroups[]": BLOCKED_GROUPS,
  };
}

function chaptersFor(mangaId: string): ChapterItem[] {
  const fetchPage = (offset: number): RecordObject => {
    const url = new URL(`${API}/manga/${mangaId}/feed`);
    addParams(url, feedParams());
    url.searchParams.append("offset", String(offset));
    return requestJson(url.toString());
  };
  const first = fetchPage(0);
  const chapters = asArray(first["data"]).map((entry) => createChapterItem(asRecord(entry)));
  let offset = Number(first["offset"] ?? 0) + Number(first["limit"] ?? 0);
  while (first["hasNextPage"] === true) {
    const page = fetchPage(offset);
    chapters.push(...asArray(page["data"]).map((entry) => createChapterItem(asRecord(entry))));
    offset = Number(page["offset"] ?? offset) + Number(page["limit"] ?? 0);
    if (page["hasNextPage"] !== true) break;
  }
  return chapters;
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
      const total = Number(response["total"] ?? 0);
      const limit = Number(response["limit"] ?? MANGA_LIMIT);
      const offset = Number(response["offset"] ?? 0);
      const result: PageResult<MangaItem> = {
        page,
        hasNextPage: offset + items.length < total && items.length === limit,
        items,
      };
      return result;
    }),
  );
  return 0;
}

export function get_details(): I32 {
  const mangaId = JSON.parse(Host.inputString()) as string;
  Host.outputString(
    runExport(() => {
      const url = new URL(`${API}/manga/${mangaId}`);
      addParams(url, { "includes[]": ["cover_art", "author", "artist"] });
      const response = requestJson(url.toString());
      const details = createMangaDetails(asRecord(response["data"]));
      details.chapters = chaptersFor(mangaId);
      return details;
    }),
  );
  return 0;
}

export function get_pages(): I32 {
  const chapterId = JSON.parse(Host.inputString()) as string;
  Host.outputString(
    runExport(() => {
      const response = requestJson(`${API}/at-home/server/${chapterId}`);
      const base = response["baseUrl"];
      const chapter = asRecord(response["chapter"]);
      const hash = chapter["hash"];
      const files = asArray(chapter["data"]);
      if (typeof base !== "string" || typeof hash !== "string" || base.length === 0 || hash.length === 0) {
        throw new ScraperError("PARSING_ERROR", "at-home response missing baseUrl or chapter hash");
      }
      return files.map((file, index): PageItem => ({
        index,
        url: `${base}/data/${hash}/${String(file)}`,
        isScrambled: false,
      }));
    }),
  );
  return 0;
}