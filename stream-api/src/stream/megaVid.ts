import { isDirectPlaybackUrl } from "./watchAnimeWorld.js";
import { resolveInternalMalId } from "./megaPlay.js";
import type { DirectStream, MediaMetadata, StreamRequest, StreamHeaders, SubtitleTrack } from "./types.js";

const MEGAVID_BASE = "https://megavid.buzz";
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";
const MEGAVID_HEADERS: StreamHeaders = {
  "User-Agent": USER_AGENT,
  Accept: "*/*",
  Origin: MEGAVID_BASE,
  Referer: `${MEGAVID_BASE}/`,
};

type MegaVidResponse = {
  success?: boolean;
  source?: string;
  tracks?: Array<{ file?: string; label?: string; kind?: string; default?: boolean }>;
};

async function fetchWithTimeout(url: string): Promise<Response | null> {
  try {
    return await fetch(url, {
      headers: {
        ...MEGAVID_HEADERS,
        Accept: "application/json, */*",
      },
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    return null;
  }
}

export async function resolveMegaVidStreams(
  metadata: MediaMetadata,
  request: StreamRequest,
): Promise<DirectStream[]> {
  const malId = request.malId ?? metadata.malId ?? (
    request.anilistId !== undefined || request.tmdbId !== undefined || request.imdbId !== undefined
      ? await resolveInternalMalId(metadata, request)
      : undefined
  );
  const episode = request.type === "movie" ? 1 : request.episode;
  if (malId === undefined || episode === undefined) return [];

  const language = request.audio === "dub" ? "dub" : "sub";
  const response = await fetchWithTimeout(
    `${MEGAVID_BASE}/api/mal/${malId}/${episode}/${language}`,
  );
  if (!response?.ok) return [];

  let payload: MegaVidResponse;
  try {
    payload = (await response.json()) as MegaVidResponse;
  } catch {
    return [];
  }

  const source = payload.success && payload.source ? payload.source : null;
  if (!source || !isDirectPlaybackUrl(source)) return [];

  const subtitles: SubtitleTrack[] = (payload.tracks ?? [])
    .filter(track => typeof track.file === "string" && /^https:\/\/.+\.vtt(?:$|\?)/i.test(track.file))
    .map(track => ({
      url: track.file as string,
      label: track.label?.trim() || "Subtitle",
      kind: track.kind,
      default: Boolean(track.default),
    }));

  return [{
    name: "MegaVid",
    title: `MegaVid — ${language}`,
    url: source,
    quality: "AUTO",
    headers: MEGAVID_HEADERS,
    ...(subtitles.length > 0 ? { subtitles } : {}),
  }];
}
