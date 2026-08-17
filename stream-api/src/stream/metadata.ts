import { StreamApiError } from "./errors.js";
import type { MediaMetadata, MediaType } from "./types.js";

type ImdbSuggestionResponse = {
  d?: Array<{ id?: string; l?: string }>;
};

function uniqueTitles(values: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const results: string[] = [];
  for (const value of values) {
    const normalized = value?.replace(/\s+/g, " ").trim();
    if (!normalized || seen.has(normalized.toLowerCase())) continue;
    seen.add(normalized.toLowerCase());
    results.push(normalized);
  }
  return results;
}

function decodeHtml(value: string): string {
  return value
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#8212;|&mdash;/gi, "—")
    .replace(/&#8217;/gi, "’");
}

async function fetchJson<T>(url: string): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, {
      headers: { Accept: "application/json", "User-Agent": "NuvioStreamAPI/1.0" },
      signal: AbortSignal.timeout(12_000),
    });
  } catch {
    throw new StreamApiError(502, "metadata_lookup_failed", "The metadata provider could not be reached.");
  }
  if (!response.ok) {
    throw new StreamApiError(502, "metadata_lookup_failed", "The metadata provider returned an error.");
  }
  return (await response.json()) as T;
}

async function fetchText(url: string): Promise<string> {
  let response: Response;
  try {
    response = await fetch(url, {
      headers: {
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "en-US,en;q=0.9",
        "User-Agent": "NuvioStreamAPI/1.0",
      },
      signal: AbortSignal.timeout(12_000),
    });
  } catch {
    throw new StreamApiError(502, "metadata_lookup_failed", "The metadata provider could not be reached.");
  }
  if (response.status === 404) {
    throw new StreamApiError(404, "tmdb_not_found", "No title was found for the supplied TMDB ID.");
  }
  if (!response.ok) {
    throw new StreamApiError(502, "metadata_lookup_failed", "The metadata provider returned an error.");
  }
  return response.text();
}

function extractOgTitle(html: string): string | null {
  const propertyFirst = html.match(/<meta\b(?=[^>]*\bproperty=["']og:title["'])[^>]*\bcontent=["']([^"']+)["'][^>]*>/i);
  const contentFirst = html.match(/<meta\b(?=[^>]*\bcontent=["']([^"']+)["'])[^>]*\bproperty=["']og:title["'][^>]*>/i);
  return decodeHtml(propertyFirst?.[1] ?? contentFirst?.[1] ?? "").trim() || null;
}

export async function resolveTmdbMetadata(tmdbId: number, type: MediaType): Promise<MediaMetadata> {
  const path = type === "tv" ? "tv" : "movie";
  const title = extractOgTitle(await fetchText(`https://www.themoviedb.org/${path}/${tmdbId}?language=en-US`));
  if (!title) throw new StreamApiError(404, "tmdb_not_found", "No title was found for the supplied TMDB ID.");
  return { primaryTitle: title, titles: [title] };
}

export async function resolveImdbMetadata(imdbId: string): Promise<MediaMetadata> {
  const result = await fetchJson<ImdbSuggestionResponse>(`https://v3.sg.media-imdb.com/suggestion/x/${encodeURIComponent(imdbId)}.json`);
  const match = result.d?.find(entry => entry.id?.toLowerCase() === imdbId.toLowerCase());
  const titles = uniqueTitles([match?.l]);
  if (!match || titles.length === 0) {
    throw new StreamApiError(404, "imdb_not_found", "No title was found for the supplied IMDb ID.");
  }
  return { primaryTitle: titles[0], titles };
}

async function resolveMalMetadata(malId: number): Promise<MediaMetadata> {
  // Use Jikan v4 anime endpoint for MAL metadata
  try {
    const res = await fetch(`https://api.jikan.moe/v4/anime/${malId}`, {
      headers: { Accept: "application/json", "User-Agent": "NuvioStreamAPI/1.0" },
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) {
      throw new StreamApiError(404, "mal_not_found", "No title was found for the supplied MAL ID.");
    }
    const payload = (await res.json()) as { data?: { title?: string; title_english?: string; titles?: Array<{ title?: string }> } };
    const anime = payload.data;
    if (!anime) throw new StreamApiError(404, "mal_not_found", "No title was found for the supplied MAL ID.");
    const titles = uniqueTitles([
      anime.title_english,
      anime.title,
      ...(anime.titles?.map(t => t.title) ?? []),
    ]);
    return { primaryTitle: titles[0] ?? "Anime", titles };
  } catch (err) {
    if (err instanceof StreamApiError) throw err;
    throw new StreamApiError(502, "metadata_lookup_failed", "The metadata provider could not be reached.");
  }
}

export async function resolveMetadata(input: { tmdbId?: number; imdbId?: string; malId?: number; type: MediaType }): Promise<MediaMetadata> {
  if (Number(input.tmdbId !== undefined) + Number(input.imdbId !== undefined) + Number(input.malId !== undefined) !== 1) {
    throw new StreamApiError(400, "invalid_identifier", "Provide exactly one identifier: tmdbId, imdbId, or malId.");
  }
  if (input.tmdbId !== undefined) return resolveTmdbMetadata(input.tmdbId, input.type);
  if (input.imdbId !== undefined) return resolveImdbMetadata(input.imdbId);
  return resolveMalMetadata(input.malId as number);
}
