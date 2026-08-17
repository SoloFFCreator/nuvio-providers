import { describe, expect, it } from "vitest";
import { StreamApiError } from "./errors";
import { parseStreamRequest } from "./validation";

describe("parseStreamRequest", () => {
  it("accepts an AniList TV request", () => {
    expect(parseStreamRequest({ anilistId: "20", type: "tv", season: "1", episode: "1" })).toEqual({
      anilistId: 20,
      malId: undefined,
      type: "tv",
      audio: "sub",
      season: 1,
      episode: 1,
    });
  });

  it("accepts a MAL movie request", () => {
    expect(parseStreamRequest({ malId: "5114", type: "movie" })).toEqual({
      anilistId: undefined,
      malId: 5114,
      type: "movie",
      audio: "sub",
      season: undefined,
      episode: undefined,
    });
  });

  it("rejects invalid types, identifiers, and missing TV episodes", () => {
    expect(() => parseStreamRequest({ anilistId: "20", type: "anime" })).toThrow(StreamApiError);
    expect(() => parseStreamRequest({ anilistId: "20", malId: "20", type: "tv", season: "1", episode: "1" })).toThrow(
      StreamApiError
    );
    expect(() => parseStreamRequest({ malId: "20", type: "tv" })).toThrow(StreamApiError);
    expect(() => parseStreamRequest({ malId: "20", type: "movie", audio: "english" })).toThrow(StreamApiError);
  });

  it("accepts explicit Hindi, sub, and dub source preferences", () => {
    expect(parseStreamRequest({ malId: "63316", type: "tv", season: "1", episode: "1", audio: "hindi" }).audio).toBe("hindi");
    expect(parseStreamRequest({ malId: "63316", type: "tv", season: "1", episode: "1", audio: "sub" }).audio).toBe("sub");
    expect(parseStreamRequest({ malId: "63316", type: "tv", season: "1", episode: "1", audio: "dub" }).audio).toBe("dub");
  });
});
