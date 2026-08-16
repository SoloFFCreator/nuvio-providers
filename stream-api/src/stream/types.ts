export type MediaType = "movie" | "tv";

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
  anilistId?: number;
  malId?: number;
  type: MediaType;
  season?: number;
  episode?: number;
};
