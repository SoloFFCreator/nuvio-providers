export type MediaType = "movie" | "tv";

export type StreamHeaders = {
  "User-Agent": string;
  Referer: string;
};

export type DirectStream = {
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
  anilistId?: number;
  malId?: number;
  type: MediaType;
  season?: number;
  episode?: number;
};
