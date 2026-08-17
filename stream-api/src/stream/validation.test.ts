import { describe, expect, it } from "vitest";
import { StreamApiError } from "./errors";
import { parseStreamRequest } from "./validation";

describe("parseStreamRequest with malId support", () => {
  it("accepts tmdbId, imdbId, or malId as valid single identifiers", () => {
    expect(parseStreamRequest({ tmdbId: "210942", type: "tv", season: "1", episode: "1", audio: "hindi" })).toMatchObject({
      tmdbId: 210942,
    });
    expect(parseStreamRequest({ imdbId: "tt22297722", type: "movie", audio: "sub" })).toMatchObject({
      imdbId: "tt22297722",
    });
    expect(parseStreamRequest({ malId: "58567", type: "tv", season: "2", episode: "1", audio: "dub" })).toMatchObject({
      malId: 58567,
      audio: "dub",
    });
  });

  it("rejects mixed or missing identifiers", () => {
    expect(() => parseStreamRequest({ tmdbId: "210942", malId: "58567", type: "tv", season: "1", episode: "1" })).toThrow(StreamApiError);
    expect(() => parseStreamRequest({ type: "tv", season: "1", episode: "1" })).toThrow(StreamApiError);
  });
});
