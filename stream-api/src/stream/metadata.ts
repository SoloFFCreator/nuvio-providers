import { StreamApiError } from "./errors.js";
import type { MediaMetadata } from "./types.js";

type AniListResponse = {
  data?: {
    Media?: {
      title?: { english?: string | null; romaji?: string | null; native?: string | null };
      synonyms?: string[];
    } | null;
  };
  errors?: Array<{ message?: string }>;
};

type JikanResponse = {
  data?: {
    title?: string;
    title_english?: string | null;
    title_japanese?: string | null;
    titles?: Array<{ title?: string }>;
  };
};

function uniqueTitles(values: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const results: string[] = [];

  for (const value of values) {
    const normalized = value?.replace(/\s+/g, " ").trim();
    if (!normalized) continue;
    const key = normalized.toLocaleLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      results.push(normalized);
    }
  }

  return results;
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      headers: {
        Accept: "application/json",
        "User-Agent": "NuvioStreamAPI/1.0",
        ...(init?.headers ?? {}),
      },
      signal: AbortSignal.timeout(12_000),
    });
  } catch {
    throw new StreamApiError(502, "metadata_lookup_failed", "The anime metadata provider could not be reached.");
  }

  if (!response.ok) {
    throw new StreamApiError(502, "metadata_lookup_failed", "The anime metadata provider returned an error.");
  }

  return (await response.json()) as T;
}

export async function resolveAniListMetadata(anilistId: number): Promise<MediaMetadata> {
  const query = `query ($id: Int) {
    Media(id: $id, type: ANIME) {
      title { english romaji native }
      synonyms
    }
  }`;

  const result = await fetchJson<AniListResponse>("https://graphql.anilist.co", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables: { id: anilistId } }),
  });

  const media = result.data?.Media;
  const titles = uniqueTitles([
    media?.title?.english,
    media?.title?.romaji,
    media?.title?.native,
    ...(media?.synonyms ?? []),
  ]);

  if (!media || titles.length === 0) {
    throw new StreamApiError(404, "anilist_not_found", "No anime was found for the supplied AniList ID.");
  }

  return { primaryTitle: titles[0], titles };
}

export async function resolveMalMetadata(malId: number): Promise<MediaMetadata> {
  const result = await fetchJson<JikanResponse>(`https://api.jikan.moe/v4/anime/${malId}/full`);
  const anime = result.data;
  const titles = uniqueTitles([
    anime?.title_english,
    anime?.title,
    anime?.title_japanese,
    ...(anime?.titles?.map(entry => entry.title) ?? []),
  ]);

  if (!anime || titles.length === 0) {
    throw new StreamApiError(404, "mal_not_found", "No anime was found for the supplied MAL ID.");
  }

  return { primaryTitle: titles[0], titles };
}

export async function resolveMetadata(input: { anilistId?: number; malId?: number }): Promise<MediaMetadata> {
  const requestedIds = Number(Boolean(input.anilistId)) + Number(Boolean(input.malId));
  if (requestedIds !== 1) {
    throw new StreamApiError(
      400,
      "invalid_identifier",
      "Provide exactly one identifier: anilistId or malId."
    );
  }

  return input.anilistId
    ? resolveAniListMetadata(input.anilistId)
    : resolveMalMetadata(input.malId as number);
}
