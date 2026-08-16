export const ALLOWED_ANDROID_PACKAGES = [
  "com.midnight.anime",
  "com.midnight.anime.tv",
] as const;

export type AllowedAndroidPackage = (typeof ALLOWED_ANDROID_PACKAGES)[number];
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
