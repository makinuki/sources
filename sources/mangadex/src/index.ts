/// <reference path="./index.d.ts" />

import type { FilterSchema, SourceMetadata } from "@makinuki/pdk";

const metadata: SourceMetadata = {
  id: "mangadex",
  name: "MangaDex",
  version: "0.1.0",
  abiVersion: 1,
  lang: "en",
  baseUrl: "https://mangadex.org",
  iconUrl: "https://mangadex.org/favicon.ico",
  nsfw: false,
};

export function get_metadata(): I32 {
  Host.outputString(JSON.stringify(metadata));
  return 0;
}

export function get_filters(): I32 {
  const filters: FilterSchema[] = [];
  Host.outputString(JSON.stringify(filters));
  return 0;
}