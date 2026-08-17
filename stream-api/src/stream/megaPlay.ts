import * as cheerio from "cheerio";
import { StreamApiError } from "./errors.js";
import { isDirectPlaybackUrl } from "./watchAnimeWorld.js";
import type { DirectStream, MediaMetadata, StreamRequest, StreamHeaders } from "./types.js";

const MEGAPLAY_BASE = "https://megaplay.buzz";
const ANIKOTO_SITE = "https://anikototv.to";
const ANIKOTO_API = "https://anikotoapi.site";
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";
const PLAYER_HEADERS = {
  "User-Agent": USER_AGENT,
  Accept: "*/*",
  "X-Requested-With": "XMLHttpRequest",
  Referer: `${MEGAPLAY_BASE}/`,
};
const MEDIA_HEADERS: StreamHeaders = {
  "User-Agent": USER_AGENT,
  Referer: `${MEGAPLAY_BASE}/`,
};

type SourceResponse = {
  sources?: { file?: string };
};

async function fetchWithTimeout(url: string, init: RequestInit = {}): Promise<Response | null> {
  try {
    return await fetch(url, {
      ...init,
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    return null;
  }
}

function extractPlayerId(html: string): string | null {
  const player = html.match(/<[^>]*id=["']megaplay-player["'][^>]*>/i)?.[0] ?? "";
  return player.match(/data-id=["']([^"']+)["']/i)?.[1] ?? null;
}

async function resolvePlayerId(playerUrl: string): Promise<string | null> {
  const response = await fetchWithTimeout(playerUrl, { headers: PLAYER_HEADERS });
  if (!response?.ok) return null;
  return extractPlayerId(await response.text());
}

function normaliseTitle(value: string): string {
  return value
    .toLocaleLowerCase()
    .replace(/[^a-z0-9\s]/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function titleScore(candidate: string, requested: string): number {
  const left = normaliseTitle(candidate);
  const right = normaliseTitle(requested);
  if (!left || !right) return 0;
  if (left === right) return 100;
  if (left.startsWith(`${right} `) || right.startsWith(`${left} `)) return 80;
  if (left.includes(right) || right.includes(left)) return 60;
  return 0;
}

type JikanSearchResponse = {
  data?: Array<{
    mal_id?: number;
    title?: string;
    title_english?: string | null;
    title_japanese?: string | null;
    titles?: Array<{ title?: string }>;
  }>;
};

async function resolveInternalMalId(metadata: MediaMetadata, request: StreamRequest): Promise<number | null> {
  let best: { id: number; score: number } | null = null;
  const baseTitles = [metadata.primaryTitle, ...metadata.titles].filter(Boolean).slice(0, 4);
  const seasonTitles = request.type === "tv" && request.season !== undefined && request.season > 1
    ? baseTitles.map(title => `${title} Season ${request.season}`)
    : [];
  const titles = [...seasonTitles, ...baseTitles];
  for (const title of titles) {
    const response = await fetchWithTimeout(
      `https://api.jikan.moe/v4/anime?q=${encodeURIComponent(title)}&limit=8`,
      { headers: { Accept: "application/json", "User-Agent": USER_AGENT } }
    );
    if (!response?.ok) continue;

    try {
      const payload = (await response.json()) as JikanSearchResponse;
      for (const anime of payload.data ?? []) {
        if (!anime.mal_id) continue;
        const candidateTitles = [
          anime.title_english,
          anime.title,
          anime.title_japanese,
          ...(anime.titles?.map(entry => entry.title) ?? []),
        ].filter(Boolean) as string[];
        const score = Math.max(0, ...candidateTitles.flatMap(candidate => titles.map(requested => titleScore(candidate, requested))));
        if (score > (best?.score ?? 0)) best = { id: anime.mal_id, score };
      }
    } catch {
      // Continue to the next title or use the Anikoto fallback below.
    }
    if (best?.score !== undefined && best.score >= 80) break;
  }

  return best && best.score >= 80 ? best.id : null;
}

async function resolveAnikotoEpisodeId(
  metadata: MediaMetadata,
  request: StreamRequest
): Promise<string | null> {
  let best: { title: string; url: string; score: number } | null = null;
  const titles = [metadata.primaryTitle, ...metadata.titles].filter(Boolean).slice(0, 5);

  for (const title of titles) {
    const response = await fetchWithTimeout(
      `${ANIKOTO_SITE}/search?keyword=${encodeURIComponent(title)}`,
      { headers: { "User-Agent": USER_AGENT, Accept: "text/html", Referer: `${ANIKOTO_SITE}/` } }
    );
    if (!response?.ok) continue;

    const $ = cheerio.load(await response.text());
    for (const element of $("a[href*='/watch/']").toArray()) {
      const href = $(element).attr("href");
      if (!href) continue;
      const candidateTitle = ($(element).attr("data-jp") || $(element).text()).trim();
      const score = titleScore(candidateTitle, title);
      if (score > (best?.score ?? 0)) best = { title: candidateTitle, url: new URL(href, ANIKOTO_SITE).toString(), score };
    }
    if (best?.score !== undefined && best.score >= 80) break;
  }

  if (!best || best.score < 80) return null;
  const watchResponse = await fetchWithTimeout(best.url, {
    headers: { "User-Agent": USER_AGENT, Accept: "text/html", Referer: `${ANIKOTO_SITE}/` },
  });
  if (!watchResponse?.ok) return null;

  const watchId = cheerio.load(await watchResponse.text())("#watch-main").attr("data-id");
  if (!watchId) return null;
  const seriesResponse = await fetchWithTimeout(`${ANIKOTO_API}/series/${encodeURIComponent(watchId)}`, {
    headers: { "User-Agent": USER_AGENT, Accept: "application/json", Referer: `${ANIKOTO_SITE}/` },
  });
  if (!seriesResponse?.ok) return null;

  try {
    const payload = (await seriesResponse.json()) as { data?: { episodes?: Array<Record<string, unknown>> } };
    const episodes = payload.data?.episodes ?? [];
    const targetEpisode = request.type === "movie" ? 1 : request.episode;
    const chosen = episodes.find(episode => {
      const number = episode.number ?? episode.episode_number ?? episode.ep_num;
      return Number(number) === targetEpisode;
    }) ?? (targetEpisode && targetEpisode > 0 ? episodes[targetEpisode - 1] : undefined);
    const embedId = chosen?.episode_embed_id ?? chosen?.embed_id ?? chosen?.id;
    return embedId ? String(embedId) : null;
  } catch {
    return null;
  }
}

async function resolveSourceFile(playerId: string): Promise<string | null> {
  for (const endpoint of ["getSourcesNew", "getSources"]) {
    const url = `${MEGAPLAY_BASE}/stream/${endpoint}?id=${encodeURIComponent(playerId)}&id=${encodeURIComponent(playerId)}`;
    const response = await fetchWithTimeout(url, { headers: PLAYER_HEADERS });
    if (!response?.ok) continue;

    try {
      const payload = (await response.json()) as SourceResponse;
      const file = payload.sources?.file;
      if (file && isDirectPlaybackUrl(file)) return file;
    } catch {
      // Try the legacy source endpoint if the first response is not JSON.
    }
  }

  return null;
}

async function fetchFirstHlsResource(
  playlistUrl: string,
  playlistText: string,
  headers: StreamHeaders
): Promise<boolean> {
  const resource = playlistText
    .split(/\r?\n/)
    .map(line => line.trim())
    .find(line => line && !line.startsWith("#"));
  if (!resource) return true;

  const resourceUrl = new URL(resource, playlistUrl).toString();
  if (/\.m3u8(?:$|\?)/i.test(resourceUrl)) {
    const childResponse = await fetchWithTimeout(resourceUrl, { headers: { ...headers, Accept: "*/*" } });
    if (!childResponse?.ok) return false;
    const childText = await childResponse.text();
    if (!childText.includes("#EXTM3U")) return false;
    return fetchFirstHlsResource(resourceUrl, childText, headers);
  }

  const segmentResponse = await fetchWithTimeout(resourceUrl, {
    headers: { ...headers, Accept: "*/*", Range: "bytes=0-2047" },
  });
  if (!segmentResponse?.ok) return false;
  const reader = segmentResponse.body?.getReader();
  if (!reader) return false;
  const firstChunk = await reader.read();
  await reader.cancel();
  return Boolean(firstChunk.value?.byteLength);
}

export async function isClientFetchableMedia(url: string, headers: StreamHeaders): Promise<boolean> {
  if (!isDirectPlaybackUrl(url)) return false;
  const response = await fetchWithTimeout(url, {
    headers: {
      ...headers,
      Accept: "*/*",
      Range: "bytes=0-4095",
    },
  });
  if (!response?.ok) return false;

  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
  if (/mpegurl|m3u8/.test(contentType) || /\.m3u8(?:$|\?)/i.test(url)) {
    const text = await response.text();
    return text.includes("#EXTM3U") && fetchFirstHlsResource(url, text, headers);
  }

  try {
    const reader = response.body?.getReader();
    if (!reader) return false;
    const firstChunk = await reader.read();
    await reader.cancel();
    return Boolean(firstChunk.value?.byteLength);
  } catch {
    return false;
  }
}

async function resolvePlayerStream(
  playerUrl: string,
  language: "sub" | "dub"
): Promise<DirectStream | null> {
  const playerId = await resolvePlayerId(playerUrl);
  if (!playerId) return null;
  return resolvePlayerIdStream(playerId, language);
}

async function resolvePlayerIdStream(
  playerId: string,
  language: "sub" | "dub"
): Promise<DirectStream | null> {
  const file = await resolveSourceFile(playerId);
  if (!file || !(await isClientFetchableMedia(file, MEDIA_HEADERS))) return null;

  return {
    name: "MegaPlay",
    url: file,
    title: `MegaPlay — ${language}`,
    quality: "AUTO",
    headers: MEDIA_HEADERS,
  };
}

export async function resolveMegaPlayStreams(
  metadata: MediaMetadata,
  request: StreamRequest
): Promise<DirectStream[]> {
  const episode = request.type === "movie" ? 1 : request.episode;
  if (!episode) {
    throw new StreamApiError(400, "missing_episode", "TV requests require a positive episode value.");
  }

  const language: "sub" | "dub" = request.audio === "dub" ? "dub" : "sub";
  const malIdToUse = request.malId ?? (await resolveInternalMalId(metadata, request));
  if (malIdToUse) {
    const directPlayerUrl = `${MEGAPLAY_BASE}/stream/mal/${malIdToUse}/${episode}/${language}`;
    const directStream = await resolvePlayerStream(directPlayerUrl, language);
    if (directStream) return [directStream];
  }
  const anikotoEpisodeId = await resolveAnikotoEpisodeId(metadata, request);
  if (!anikotoEpisodeId) return [];

  const stream = await resolvePlayerIdStream(anikotoEpisodeId, language);
  return stream ? [stream] : [];
}
