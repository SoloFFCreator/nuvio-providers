import type { DirectStream } from "./types.js";

export type ExoPlayerStream = DirectStream & {
  format: "hls" | "progressive";
  mimeType: "application/x-mpegURL" | "video/mp4" | "application/octet-stream";
};

export type NuvioStream = ExoPlayerStream & {
  name: string;
};

const DEFAULT_PROVIDER_NAME = "WatchAnimeWorld";

function inferExoPlayerFormat(url: string): Pick<ExoPlayerStream, "format" | "mimeType"> {
  const normalized = url.toLowerCase();
  if (normalized.includes(".m3u8") || normalized.includes("r_file=chunklist.m3u8")) {
    return { format: "hls", mimeType: "application/x-mpegURL" };
  }
  if (normalized.includes(".mp4") || normalized.includes("r_file=video.mp4")) {
    return { format: "progressive", mimeType: "video/mp4" };
  }
  return { format: "progressive", mimeType: "application/octet-stream" };
}

/**
 * Nuvio expects a top-level array of stream objects. The format and MIME hint are
 * additive fields for Media3/ExoPlayer clients; legacy Nuvio clients can ignore them.
 */
export function toNuvioStreams(streams: DirectStream[]): NuvioStream[] {
  return streams.map(stream => {
    const playback = inferExoPlayerFormat(stream.url);
    return {
      name: stream.name ?? DEFAULT_PROVIDER_NAME,
      url: stream.url,
      title: stream.title,
      quality: stream.quality,
      headers: playback.format === "hls" && !stream.headers.Accept
        ? { ...stream.headers, Accept: "*/*" }
        : stream.headers,
      ...playback,
    };
  });
}
