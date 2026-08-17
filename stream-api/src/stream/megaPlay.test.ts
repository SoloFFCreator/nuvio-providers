import { afterEach, describe, expect, it, vi } from "vitest";
import { isClientFetchableMedia, resolveMegaPlayStreams } from "./megaPlay.js";

const request = {
  tmdbId: 127532,
  type: "tv" as const,
  audio: "sub" as const,
  season: 2,
  episode: 1,
};

const metadata = { primaryTitle: "Solo Leveling", titles: ["Solo Leveling", "Ore dake Level Up na Ken"] };

function mockFetch(responses: Array<Response>): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn(async () => responses.shift() ?? new Response("", { status: 500 }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function jikanSearchResponse(): Response {
  return new Response(JSON.stringify({
    data: [{ mal_id: 58567, title: "Ore dake Level Up na Ken Season 2: Arise from the Shadow", title_english: "Solo Leveling Season 2: Arise from the Shadow" }],
  }), { status: 200, headers: { "content-type": "application/json" } });
}

afterEach(() => vi.unstubAllGlobals());

describe("MegaPlay resolver with internal MAL bridge", () => {
  it("resolves a TMDB request through a high-confidence internal MAL bridge and direct sub source", async () => {
    const mediaUrl = "https://cdn.watching.onl/anime/test/master.m3u8";
    const fetchMock = mockFetch([
      jikanSearchResponse(),
      new Response('<div id="megaplay-player" data-id="player-123"></div>', { status: 200 }),
      new Response(JSON.stringify({ sources: { file: mediaUrl } }), { status: 200, headers: { "content-type": "application/json" } }),
      new Response("#EXTM3U\n#EXT-X-VERSION:3", { status: 200, headers: { "content-type": "application/vnd.apple.mpegurl" } }),
    ]);

    await expect(resolveMegaPlayStreams(metadata, request)).resolves.toEqual([
      expect.objectContaining({ name: "MegaPlay", title: "MegaPlay — sub", url: mediaUrl }),
    ]);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("api.jikan.moe/v4/anime");
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain("/mal/58567/1/sub");
  });

  it("uses the same internal MAL bridge for dubbed playback", async () => {
    const mediaUrl = "https://cdn.watching.onl/anime/test/master.m3u8";
    const fetchMock = mockFetch([
      jikanSearchResponse(),
      new Response('<div id="megaplay-player" data-id="player-dub"></div>', { status: 200 }),
      new Response(JSON.stringify({ sources: { file: mediaUrl } }), { status: 200 }),
      new Response("#EXTM3U\n#EXT-X-VERSION:3", { status: 200, headers: { "content-type": "application/vnd.apple.mpegurl" } }),
    ]);

    await expect(resolveMegaPlayStreams(metadata, { ...request, audio: "dub" })).resolves.toEqual([
      expect.objectContaining({ name: "MegaPlay", title: "MegaPlay — dub", url: mediaUrl }),
    ]);
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain("/mal/58567/1/dub");
  });

  it("validates the first child playlist and media segment", async () => {
    const fetchMock = mockFetch([
      new Response(["#EXTM3U", "#EXT-X-STREAM-INF:BANDWIDTH=1", "child.m3u8"].join("\n"), { status: 200 }),
      new Response(["#EXTM3U", "#EXTINF:4,", "segment.bin"].join("\n"), { status: 200, headers: { "content-type": "application/vnd.apple.mpegurl" } }),
      new Response(new Uint8Array([0x47, 0x40, 0x00]), { status: 206 }),
    ]);

    await expect(isClientFetchableMedia("https://cdn.watching.onl/anime/test/master.m3u8", {
      "User-Agent": "Mozilla/5.0",
      Referer: "https://megaplay.buzz/",
    })).resolves.toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("rejects a direct URL that is not client-fetchable", async () => {
    const fetchMock = mockFetch([new Response("challenge", { status: 403 })]);
    await expect(isClientFetchableMedia("https://cdn.watching.onl/anime/test/master.m3u8", {
      "User-Agent": "Mozilla/5.0",
      Referer: "https://megaplay.buzz/",
    })).resolves.toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
