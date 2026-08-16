import { afterEach, describe, expect, it, vi } from "vitest";
import { isClientFetchableMedia, resolveMegaPlayStreams } from "./megaPlay.js";

const request = {
  anilistId: 20,
  type: "tv" as const,
  season: 1,
  episode: 1,
};

const metadata = { primaryTitle: "Test Anime", titles: ["Test Anime"] };

function mockFetch(responses: Array<Response>): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn(async () => responses.shift() ?? new Response("", { status: 500 }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => vi.unstubAllGlobals());

describe("MegaPlay direct source resolver", () => {
  it("extracts getSources media and verifies the client-facing HLS response", async () => {
    const mediaUrl = "https://cdn.watching.onl/anime/test/master.m3u8";
    const fetchMock = mockFetch([
      new Response('<div id="megaplay-player" data-id="player-123"></div>', { status: 200 }),
      new Response(JSON.stringify({ sources: { file: mediaUrl } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
      new Response("#EXTM3U\n#EXT-X-VERSION:3", {
        status: 200,
        headers: { "content-type": "application/vnd.apple.mpegurl" },
      }),
    ]);

    const streams = await resolveMegaPlayStreams(metadata, request);

    expect(streams).toEqual([
      {
        name: "MegaPlay",
        url: mediaUrl,
        title: "MegaPlay — sub",
        quality: "AUTO",
        headers: {
          "User-Agent": expect.any(String),
          Referer: "https://megaplay.buzz/",
        },
      },
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("validates the first child playlist and media segment", async () => {
    const fetchMock = mockFetch([
      new Response(["#EXTM3U", "#EXT-X-STREAM-INF:BANDWIDTH=1", "child.m3u8"].join(String.fromCharCode(10)), { status: 200 }),
      new Response(["#EXTM3U", "#EXTINF:4,", "segment.bin"].join(String.fromCharCode(10)), {
        status: 200,
        headers: { "content-type": "application/vnd.apple.mpegurl" },
      }),
      new Response(new Uint8Array([0x47, 0x40, 0x00]), { status: 206 }),
    ]);

    await expect(
      isClientFetchableMedia("https://cdn.watching.onl/anime/test/master.m3u8", {
        "User-Agent": "Mozilla/5.0",
        Referer: "https://megaplay.buzz/",
      })
    ).resolves.toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("rejects a media URL that returns Cloudflare or origin HTTP 403", async () => {
    const mediaUrl = "https://cdn.watching.onl/anime/test/master.m3u8";
    const fetchMock = mockFetch([
      new Response('<div id="megaplay-player" data-id="player-123"></div>', { status: 200 }),
      new Response(JSON.stringify({ sources: { file: mediaUrl } }), { status: 200 }),
      new Response("forbidden", { status: 403 }),
    ]);

    const streams = await resolveMegaPlayStreams(metadata, request);

    expect(streams).toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(5);
  });

  it("rejects a direct URL that is not client-fetchable", async () => {
    const fetchMock = mockFetch([new Response("challenge", { status: 403 })]);

    await expect(
      isClientFetchableMedia("https://cdn.watching.onl/anime/test/master.m3u8", {
        "User-Agent": "Mozilla/5.0",
        Referer: "https://megaplay.buzz/",
      })
    ).resolves.toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
