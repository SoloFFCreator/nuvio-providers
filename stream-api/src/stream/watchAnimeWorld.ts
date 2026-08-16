import * as cheerio from "cheerio";
import { StreamApiError } from "./errors.js";
import type { DirectStream, MediaMetadata, StreamHeaders, StreamRequest } from "./types.js";

const BASE_URL = "https://watchanimeworld.top";
const BROWSER_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";
const SITE_HEADERS = {
  "User-Agent": BROWSER_USER_AGENT,
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
  Referer: `${BASE_URL}/`,
};
const PLAYBACK_HEADERS = {
  "User-Agent": BROWSER_USER_AGENT,
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
  "X-Requested-With": "XMLHttpRequest",
};

type SearchResult = { title: string; url: string; slug: string };
type LanguageLink = { language: string; link: string };
type ZephyrixResponse = { videoSource?: string; securedLink?: string };

function normaliseTitle(value: string): string {
  return value
    .toLocaleLowerCase()
    .replace(/[^a-z0-9\s]/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function hlsHeaders(referer: string): StreamHeaders {
  return { ...PLAYBACK_HEADERS, Referer: referer };
}

export function isDirectPlaybackUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    const isBlakiteManifest =
      parsed.hostname === "hugh.cdn.rumble.cloud" &&
      parsed.searchParams.get("r_file") === "chunklist.m3u8";
    return (
      !parsed.hostname.endsWith("short.icu") &&
      (/\.(m3u8|mp4|mkv)$/i.test(parsed.pathname) || isBlakiteManifest)
    );
  } catch {
    return false;
  }
}

function absoluteUrl(value: string): string {
  return new URL(value, BASE_URL).toString();
}

async function fetchText(url: string, init?: RequestInit): Promise<string> {
  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      headers: { ...SITE_HEADERS, ...(init?.headers ?? {}) },
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new StreamApiError(502, "provider_unavailable", "WatchAnimeWorld could not be reached.");
  }

  if (!response.ok) {
    throw new StreamApiError(502, "provider_unavailable", "WatchAnimeWorld returned an unexpected response.");
  }

  return response.text();
}

function scoreSearchCandidate(candidate: string, title: string): number {
  const candidateTitle = normaliseTitle(candidate);
  const requestedTitle = normaliseTitle(title);
  if (candidateTitle === requestedTitle) return 100;
  if (candidateTitle.startsWith(`${requestedTitle} `)) return 80;
  if (candidateTitle.includes(requestedTitle)) return 60;
  if (requestedTitle.includes(candidateTitle)) return 40;
  return 0;
}

async function findSeries(titleCandidates: string[]): Promise<SearchResult | null> {
  let bestResult: SearchResult | undefined;
  let bestScore = 0;

  for (const requestedTitle of titleCandidates) {
    const html = await fetchText(`${BASE_URL}/?s=${encodeURIComponent(requestedTitle)}`);
    const $ = cheerio.load(html);

    $("article, .result-item, .post-item").each((_, element) => {
      const card = $(element);
      const link = card
        .find('a[href*="/series/"], a[href*="/movies/"]')
        .first()
        .attr("href");
      const title = card.find("h2, h3").first().text().trim() || card.text().trim();
      if (!link || !title) return;

      const score = scoreSearchCandidate(title, requestedTitle);
      if (score === 0 || score <= bestScore) return;

      const url = absoluteUrl(link);
      bestScore = score;
      bestResult = { title, url, slug: new URL(url).pathname.split("/").filter(Boolean).pop() ?? "" };
    });

    if (bestScore === 100) break;
  }

  return bestResult ?? null;
}

async function resolveEpisodeUrl(series: SearchResult, season: number, episode: number): Promise<string> {
  const fallback = `${BASE_URL}/episode/${series.slug}-${season}x${episode}/`;
  const html = await fetchText(series.url);
  const $ = cheerio.load(html);
  const target = `${season}x${episode}`;
  let result = fallback;

  $('a[href*="/episode/"]').each((_, element) => {
    const href = $(element).attr("href") ?? "";
    if (href.includes(target)) {
      result = absoluteUrl(href);
      return false;
    }
  });

  return result;
}

function decodeLanguageLinks(src: string): LanguageLink[] {
  try {
    const encoded = new URL(src).searchParams.get("data");
    if (!encoded) return [];
    const parsed = JSON.parse(Buffer.from(encoded, "base64").toString("utf8")) as Array<{
      language?: string;
      link?: string;
    }>;
    return parsed.flatMap(entry =>
      entry.link ? [{ language: entry.language?.trim() || "Unknown", link: entry.link }] : []
    );
  } catch {
    return [];
  }
}

async function resolveZephyrix(embedUrl: string, episodeUrl: string, label = "Direct HLS"): Promise<DirectStream | null> {
  try {
    const origin = new URL(embedUrl).origin;
    const videoId = new URL(embedUrl).pathname.split("/").filter(Boolean).pop();
    if (!videoId) return null;

    const response = await fetch(`${origin}/player/index.php?data=${encodeURIComponent(videoId)}&do=getVideo`, {
      method: "POST",
      headers: {
        "User-Agent": BROWSER_USER_AGENT,
        Accept: "application/json, text/plain, */*",
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        "X-Requested-With": "XMLHttpRequest",
        Referer: embedUrl,
      },
      body: new URLSearchParams({ hash: videoId, r: episodeUrl }).toString(),
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) return null;

    const data = (await response.json()) as ZephyrixResponse;
    const url = data.videoSource ?? data.securedLink;
    if (!url || !isDirectPlaybackUrl(url)) return null;

    return { url, title: `WatchAnimeWorld — ${label}`, quality: "AUTO", headers: hlsHeaders(`${origin}/`) };
  } catch {
    return null;
  }
}

async function resolveLanguageLink(entry: LanguageLink, episodeUrl: string): Promise<DirectStream | null> {
  try {
    const response = await fetch(entry.link, {
      redirect: "follow",
      headers: { ...SITE_HEADERS, Referer: episodeUrl },
      signal: AbortSignal.timeout(15_000),
    });
    const finalUrl = response.url;

    if (isDirectPlaybackUrl(finalUrl)) {
      return {
        url: finalUrl,
        title: `WatchAnimeWorld — ${entry.language}`,
        quality: "AUTO",
        headers: hlsHeaders(episodeUrl),
      };
    }

    if (finalUrl.includes("zephyrix.top") || finalUrl.includes("zephyrflick.top")) {
      return resolveZephyrix(finalUrl, episodeUrl, entry.language);
    }

    const html = await response.text();
    const m3u8 = html.match(/https?:[^\s"']+\.m3u8(?:\?[^\s"']*)?/i)?.[0];
    if (m3u8) {
      return {
        url: m3u8,
        title: `WatchAnimeWorld — ${entry.language}`,
        quality: "AUTO",
        headers: hlsHeaders(finalUrl),
      };
    }
  } catch {
    // A language redirect that fails does not invalidate the available HLS stream.
  }

  return null;
}

export function normalizeDirectStreams(streams: DirectStream[]): DirectStream[] {
  const seen = new Set<string>();
  return streams.flatMap(stream => {
    if (!isDirectPlaybackUrl(stream.url)) return [];
    if (seen.has(stream.url)) return [];
    seen.add(stream.url);
    return [
      {
        url: stream.url,
        title: stream.title,
        quality: stream.quality,
        headers: {
          ...stream.headers,
        },
      },
    ];
  });
}

async function extractDirectStreams(episodeUrl: string): Promise<DirectStream[]> {
  const html = await fetchText(episodeUrl);
  const $ = cheerio.load(html);
  const streams: DirectStream[] = [];

  $("video[src], video source[src]").each((_, element) => {
    const source = $(element).attr("src");
    const directUrl = source ? absoluteUrl(source) : "";
    if (directUrl && isDirectPlaybackUrl(directUrl)) {
      streams.push({
        url: directUrl,
        title: "WatchAnimeWorld — Direct",
        quality: "AUTO",
        headers: hlsHeaders(episodeUrl),
      });
    }
  });

  const languageLinks: LanguageLink[] = [];
  const zephyrixEmbeds: string[] = [];
  $("iframe").each((_, element) => {
    const source = $(element).attr("src") || $(element).attr("data-src") || "";
    if (!source) return;
    const resolved = absoluteUrl(source);

    if (resolved.includes("player1.php?data=") || resolved.includes("player2.php?data=")) {
      languageLinks.push(...decodeLanguageLinks(resolved));
    } else if (resolved.includes("zephyrix.top") || resolved.includes("zephyrflick.top")) {
      zephyrixEmbeds.push(resolved);
    }
  });

  for (const embedUrl of zephyrixEmbeds) {
    const direct = await resolveZephyrix(embedUrl, episodeUrl);
    if (direct) streams.push(direct);
  }

  for (const entry of languageLinks) {
    const direct = await resolveLanguageLink(entry, episodeUrl);
    if (direct) streams.push(direct);
  }

  return normalizeDirectStreams(streams);
}

export async function resolveWatchAnimeWorldStreams(
  metadata: MediaMetadata,
  request: StreamRequest
): Promise<DirectStream[]> {
  if (request.type === "tv" && (!request.season || !request.episode)) {
    throw new StreamApiError(400, "missing_episode", "TV requests require positive season and episode values.");
  }

  const series = await findSeries(metadata.titles);
  if (!series) {
    throw new StreamApiError(404, "source_not_found", "No matching title was found on WatchAnimeWorld.");
  }

  const pageUrl =
    request.type === "movie"
      ? series.url
      : await resolveEpisodeUrl(series, request.season as number, request.episode as number);
  const streams = await extractDirectStreams(pageUrl);

  if (streams.length === 0) {
    throw new StreamApiError(404, "streams_not_found", "No direct playback stream was available for this title.");
  }

  return streams;
}
