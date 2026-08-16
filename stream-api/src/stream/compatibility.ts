import type { DirectStream } from "./types.js";

export type NuvioStream = DirectStream & {
  name: string;
};

const PROVIDER_NAME = "WatchAnimeWorld";

/**
 * Nuvio expects a top-level array of stream objects. A single stream is valid,
 * but the provider name is required by the documented stream contract.
 */
export function toNuvioStreams(streams: DirectStream[]): NuvioStream[] {
  return streams.map(stream => ({
    name: PROVIDER_NAME,
    url: stream.url,
    title: stream.title,
    quality: stream.quality,
    headers: stream.headers,
  }));
}
