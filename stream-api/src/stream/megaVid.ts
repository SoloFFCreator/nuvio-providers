import { isDirectPlaybackUrl } from "./watchAnimeWorld.js";
import type { DirectStream, MediaMetadata, StreamRequest, StreamHeaders } from "./types.js";

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
  _metadata: MediaMetadata,
  request: StreamRequest,
): Promise<DirectStream[]> {
  if (request.malId === undefined || request.episode === undefined) return [];

  const language = request.audio === "dub" ? "dub" : "sub";
  const response = await fetchWithTimeout(
    `${MEGAVID_BASE}/api/mal/${request.malId}/${request.episode}/${language}`,
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

  return [{
    name: "MegaVid",
    title: `MegaVid — ${language}`,
    url: source,
    quality: "AUTO",
    headers: MEGAVID_HEADERS,
  }];
}
