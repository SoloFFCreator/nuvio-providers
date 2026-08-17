export type MediaType = "movie" | "tv";
export type AudioPreference = "hindi" | "sub" | "dub";

export type StreamHeaders = {
  "User-Agent": string;
  Referer: string;
  Accept?: string;
  "Accept-Language"?: string;
  "X-Requested-With"?: string;
  Origin?: string;
};

export type DirectStream = {
  name?: string;
  url: string;
  title: string;
  quality: string;
  headers: StreamHeaders;
};

export type MediaMetadata = {
  primaryTitle: string;
  titles: string[];
};

export type StreamRequest = {
  malId?: number;
  tmdbId?: number;
  imdbId?: string;
  type: MediaType;
  audio: AudioPreference;
  season?: number;
  episode?: number;
};
