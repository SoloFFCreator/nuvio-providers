import { isClientFetchableMedia } from "./megaPlay.js";
import type { DirectStream, MediaMetadata, StreamHeaders, StreamRequest } from "./types.js";

const BLAKITE_BASE = "https://blakiteapi.xyz";
const BLAKITE_CATALOG_URL = `${BLAKITE_BASE}/api/getAllAnime.php`;
const RUMBLE_MEDIA_BASE = "https://hugh.cdn.rumble.cloud/video";
const USER_AGENT =
  "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Mobile Safari/537.36";
const API_HEADERS: StreamHeaders = {
  "User-Agent": USER_AGENT,
  Accept: "application/json, text/plain, */*",
  Referer: `${BLAKITE_BASE}/`,
  Origin: BLAKITE_BASE,
};
const PLAYBACK_HEADERS: StreamHeaders = {
  "User-Agent": USER_AGENT,
  Accept: "*/*",
  Referer: `${BLAKITE_BASE}/`,
  Origin: BLAKITE_BASE,
};
const QUALITY_SUFFIX: Record<string, string> = {
  "240p": "oaa",
  "360p": "baa",
  "480p": "caa",
  "720p": "gaa",
  "1080p": "haa",
};

type CatalogEntry = {
  catalogId?: string;
  tmdbId?: string | number;
  originalTmdbId?: string | number;
  title?: string;
  language?: string;
  audio?: string;
  audioLanguage?: string;
  category?: string;
  dubType?: string;
  type?: string;
  seasons?: Record<string, { totalEpisodes?: number }>;
};
type CatalogResponse = {
  success?: boolean;
  data?: {
    movies?: Record<string, CatalogEntry>;
    series?: Record<string, CatalogEntry>;
    dramas?: Record<string, CatalogEntry>;
  };
};
type BlakiteSource = {
  animeTitle?: string;
  dataId?: string;
  format?: string;
  quality?: string;
  ranges?: string;
};
type BlakiteResponse = { success?: boolean; data?: BlakiteSource };

let catalogCache: { expiresAt: number; entries: CatalogEntry[] } | null = null;

async function fetchWithTimeout(url: string, init: RequestInit = {}): Promise<Response | null> {
  try {
    return await fetch(url, { ...init, signal: AbortSignal.timeout(20_000) });
  } catch {
    return null;
  }
}

function normaliseTitle(value: string): string {
  return value
    .toLocaleLowerCase()
    .replace(/\b(hindi|dubbed|dub|fan dub|fandub|org|multi audio|dual audio)\b/gi, " ")
    .replace(/[^a-z0-9\s]/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function titleScore(candidate: string, requested: string): number {
  const left = normaliseTitle(candidate);
  const right = normaliseTitle(requested);
  if (!left || !right) return 0;
  if (left === right) return 100;
  if (left.includes(right) || right.includes(left)) return 75;
  const leftWords = new Set(left.split(" "));
  const matched = right.split(" ").filter(word => leftWords.has(word)).length;
  return matched >= 2 ? Math.round((matched / right.split(" ").length) * 60) : 0;
}

async function getCatalogEntries(forceRefresh = false): Promise<CatalogEntry[]> {
  if (forceRefresh) catalogCache = null;
  if (catalogCache && catalogCache.expiresAt > Date.now()) return catalogCache.entries;
  const response = await fetchWithTimeout(BLAKITE_CATALOG_URL, { headers: API_HEADERS });
  if (!response?.ok) return [];
  try {
    const payload = (await response.json()) as CatalogResponse;
    const collections = [payload.data?.movies, payload.data?.series, payload.data?.dramas];
    const entries = collections.flatMap(collection =>
      Object.entries(collection ?? {}).flatMap(([catalogId, value]) =>
        value && typeof value === "object" ? [{ ...(value as CatalogEntry), catalogId }] : []
      )
    );
    catalogCache = { entries, expiresAt: Date.now() + 15 * 60 * 1000 };
    return entries;
  } catch {
    return [];
  }
}

function matchesRequestType(entry: CatalogEntry, request: StreamRequest): boolean {
  const type = entry.type?.toLowerCase().replace(/[^a-z]/g, "") ?? "";
  if (request.type === "movie") return type === "movie" || type === "film";
  return type === "series" || type === "tv" || type === "show" || type === "anime" || type === "drama";
}

function matchesTmdbId(value: string | number | undefined, requestedId: number): boolean {
  if (value === undefined) return false;
  return String(value).replace(/^0+(?=\d)/, "") === String(requestedId);
}

function isHindiEntry(entry: CatalogEntry): boolean {
  return /hindi|fan.?dub|fandub/i.test([
    entry.title,
    entry.language,
    entry.audio,
    entry.audioLanguage,
    entry.category,
    entry.dubType,
  ].filter(Boolean).join(" "));
}

async function findCatalogEntry(metadata: MediaMetadata, request: StreamRequest): Promise<CatalogEntry | null> {
  const findInEntries = (entries: CatalogEntry[]): CatalogEntry | null => {
    const requestedTmdbId = request.tmdbId;
    if (requestedTmdbId !== undefined) {
      const exactTmdbEntry = entries.find(entry =>
        (matchesTmdbId(entry.tmdbId, requestedTmdbId) || matchesTmdbId(entry.originalTmdbId, requestedTmdbId) || matchesTmdbId(entry.catalogId, requestedTmdbId)) &&
        matchesRequestType(entry, request) &&
        isHindiEntry(entry)
      );
      if (exactTmdbEntry) return exactTmdbEntry;
    }

    const titles = [metadata.primaryTitle, ...metadata.titles].filter(Boolean).slice(0, 8);
    let best: { entry: CatalogEntry; score: number } | null = null;
    for (const entry of entries) {
      if (!entry.tmdbId && !entry.catalogId || !entry.title || !matchesRequestType(entry, request) || !isHindiEntry(entry)) continue;
      const score = Math.max(...titles.map(title => titleScore(entry.title!, title)));
      if (score > (best?.score ?? 0)) best = { entry, score };
    }
    return best && best.score >= 60 ? best.entry : null;
  };

  const entries = await getCatalogEntries();
  const match = findInEntries(entries);
  if (match) return match;
  return findInEntries(await getCatalogEntries(true));
}

function selectRange(ranges: string, quality: string): { quality: string; range: string; suffix: string } | null {
  const parsed = ranges
    .split(/\r?\n/)
    .map(line => line.match(/^\s*(\d+-\d+)\s*\((\d+p)\)\s*$/i))
    .filter((match): match is RegExpMatchArray => Boolean(match))
    .map(match => ({ quality: match[2].toLowerCase(), range: match[1] }));
  const preferred = parsed.find(item => item.quality === quality.toLowerCase()) ?? parsed.find(item => item.quality === "480p") ?? parsed[0];
  if (!preferred || !QUALITY_SUFFIX[preferred.quality]) return null;
  return { ...preferred, suffix: QUALITY_SUFFIX[preferred.quality] };
}

function buildHlsUrl(dataId: string, range: string, suffix: string): string {
  return `${RUMBLE_MEDIA_BASE}/${dataId}.${suffix}.tar?r_file=chunklist.m3u8&r_type=application%2Fvnd.apple.mpegurl&r_range=${range}`;
}

export function buildBlakiteHlsUrl(dataId: string, ranges: string, preferredQuality = "480p"): { url: string; quality: string } | null {
  const selected = selectRange(ranges, preferredQuality);
  if (!selected || !/^[A-Za-z0-9/_-]+$/.test(dataId)) return null;
  return {
    quality: selected.quality,
    url: buildHlsUrl(dataId, selected.range, selected.suffix),
  };
}
export function buildBlakiteMp4Url(dataId: string, preferredQuality = "480p"): { url: string; quality: string } | null {
  const quality = preferredQuality.toLowerCase();
  const suffix = QUALITY_SUFFIX[quality];
  if (!suffix || !/^[A-Za-z0-9/_-]+$/.test(dataId)) return null;
  return { quality, url: `${RUMBLE_MEDIA_BASE}/${dataId}.${suffix}.mp4` };
}


export async function resolveBlakiteStreams(metadata: MediaMetadata, request: StreamRequest): Promise<DirectStream[]> {
  const entry = await findCatalogEntry(metadata, request);
  if (!entry?.tmdbId) return [];
  const uniqueId = request.type === "movie" ? null : `${request.season}-${request.episode}`;
  if (request.type === "tv" && (!request.season || !request.episode)) return [];

  const apiUrl = uniqueId
    ? `${BLAKITE_BASE}/api/get.php?id=${encodeURIComponent(uniqueId)}&tmdbId=${encodeURIComponent(String(entry.tmdbId))}`
    : `${BLAKITE_BASE}/api/get.php?tmdbId=${encodeURIComponent(String(entry.tmdbId))}`;
  const response = await fetchWithTimeout(apiUrl, { headers: { ...API_HEADERS, Referer: `${BLAKITE_BASE}/embed/${entry.tmdbId}${uniqueId ? `/${uniqueId}` : ""}` } });
  if (!response?.ok) return [];

  try {
    const payload = (await response.json()) as BlakiteResponse;
    const source = payload.data;
    if (!payload.success || !source?.dataId) return [];
    const format = source.format?.toUpperCase();
    let direct = format === "MP4"
      ? buildBlakiteMp4Url(source.dataId, source.quality ?? "480p")
      : null;
    if (format === "M3U8" && source.ranges) {
      const selected = selectRange(source.ranges, source.quality ?? "480p");
      if (selected && /^[A-Za-z0-9/_-]+$/.test(source.dataId)) {
        const suffixes = [selected.suffix, ...Object.values(QUALITY_SUFFIX)].filter((suffix, index, all) => all.indexOf(suffix) === index);
        for (const suffix of suffixes) {
          const candidate = { quality: selected.quality, url: buildHlsUrl(source.dataId, selected.range, suffix) };
          if (await isClientFetchableMedia(candidate.url, PLAYBACK_HEADERS)) {
            direct = candidate;
            break;
          }
        }
      }
    }
    if (!direct) return [];
    return [{
      name: "BlakiteAPI",
      url: direct.url,
      title: `BlakiteAPI — Hindi — ${direct.quality}`,
      quality: direct.quality.toUpperCase(),
      headers: PLAYBACK_HEADERS,
    }];
  } catch {
    return [];
  }
}

export function resetBlakiteCacheForTests(): void {
  catalogCache = null;
}
