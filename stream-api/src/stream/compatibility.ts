import type { DirectStream } from "./types.js";

export type NuvioStream = {
  name: string;
  url: string;
  title: string;
  quality: string;
  headers: DirectStream["headers"];
};

const DEFAULT_PROVIDER_NAME = "WatchAnimeWorld";

/**
 * Keep the public payload intentionally small for strict Kotlin serializers and
 * older Nuvio clients. Media3 can infer HLS/MP4 from the URL, while the full
 * provider headers remain required for manifest and segment requests.
 */
export function toNuvioStreams(streams: DirectStream[]): NuvioStream[] {
  return streams.map(stream => ({
    name: stream.name ?? DEFAULT_PROVIDER_NAME,
    url: stream.url,
    title: stream.title,
    quality: stream.quality,
    headers: stream.headers.Accept
      ? stream.headers
      : { ...stream.headers, Accept: "*/*" },
  }));
}
