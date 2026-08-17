import { StreamApiError } from "./errors.js";
import type { AudioPreference, MediaType, StreamRequest } from "./types.js";

function requiredPositiveInteger(value: unknown, field: string): number {
  if (typeof value !== "string" || !/^\d+$/.test(value)) {
    throw new StreamApiError(400, "invalid_query", `${field} must be a positive integer.`);
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new StreamApiError(400, "invalid_query", `${field} must be a positive integer.`);
  }
  return parsed;
}

function optionalPositiveInteger(value: unknown, field: string): number | undefined {
  return value === undefined ? undefined : requiredPositiveInteger(value, field);
}

function optionalImdbId(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || !/^tt\d{5,12}$/i.test(value)) {
    throw new StreamApiError(400, "invalid_query", "imdbId must have the form tt followed by 5 to 12 digits.");
  }
  return value.toLowerCase();
}

function parseAudioPreference(value: unknown): AudioPreference {
  if (value === undefined) return "sub";
  if (value === "hindi" || value === "sub" || value === "dub") return value;
  throw new StreamApiError(400, "invalid_audio", "audio must be exactly hindi, sub, or dub.");
}

export function parseStreamRequest(query: Record<string, unknown>): StreamRequest {
  const type = query.type;
  if (type !== "movie" && type !== "tv") {
    throw new StreamApiError(400, "invalid_type", "type must be exactly movie or tv.");
  }

  const tmdbId = optionalPositiveInteger(query.tmdbId, "tmdbId");
  const imdbId = optionalImdbId(query.imdbId);
  const malId = optionalPositiveInteger(query.malId, "malId");
  if (Number(tmdbId !== undefined) + Number(imdbId !== undefined) + Number(malId !== undefined) !== 1) {
    throw new StreamApiError(400, "invalid_identifier", "Provide exactly one identifier: tmdbId, imdbId, or malId.");
  }

  const request: StreamRequest = {
    tmdbId,
    imdbId,
    malId,
    type: type as MediaType,
    audio: parseAudioPreference(query.audio),
    season: optionalPositiveInteger(query.season, "season"),
    episode: optionalPositiveInteger(query.episode, "episode"),
  };

  if (request.type === "tv" && (request.season === undefined || request.episode === undefined)) {
    throw new StreamApiError(400, "missing_episode", "TV requests require both season and episode.");
  }
  return request;
}
