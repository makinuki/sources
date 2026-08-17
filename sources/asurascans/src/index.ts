/// <reference path="./index.d.ts" />

import type { FilterSchema, SourceMetadata } from "@makinuki/pdk";

const metadata: SourceMetadata = {
  id: "asurascans",
  name: "Asura Scans",
  version: "0.1.0",
  abiVersion: 1,
  lang: "en",
  baseUrl: "https://asurascans.com",
  iconUrl: "https://asurascans.com/favicon.ico",
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