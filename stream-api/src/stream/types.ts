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

export type SubtitleTrack = {
  url: string;
  label: string;
  lang?: string;
  kind?: string;
  default?: boolean;
};

export type DirectStream = {
  name?: string;
  url: string;
  title: string;
  quality: string;
  headers: StreamHeaders;
  subtitles?: SubtitleTrack[];
};

export type MediaMetadata = {
  primaryTitle: string;
  titles: string[];
  malId?: number;
};

export type StreamRequest = {
  anilistId?: number;
  malId?: number;
  tmdbId?: number;
  imdbId?: string;
  type: MediaType;
  audio: AudioPreference;
  season?: number;
  episode?: number;
};
