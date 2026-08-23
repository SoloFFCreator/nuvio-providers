import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("./megaPlay.js", () => ({
  isClientFetchableMedia: vi.fn(async () => true),
}));

import { buildBlakiteHlsUrl, buildBlakiteMp4Url, resetBlakiteCacheForTests, resolveBlakiteStreams } from "./blakite.js";

const ranges = [
  "38541312-38554938 (240p)",
  "116282368-116296070 (360p)",
  "181623808-181637614 (480p)",
  "368586752-368600655 (720p)",
  "708610560-708624490 (1080p)",
].join("\n");

afterEach(() => {
  vi.unstubAllGlobals();
  resetBlakiteCacheForTests();
});

describe("BlakiteAPI resolver", () => {
  it("builds a direct 480p HLS manifest from data ID and provider ranges", () => {
    expect(buildBlakiteHlsUrl("fwe2/00/s8/2/Q/o/T/J/QoTJA", ranges, "480p")).toEqual({
      quality: "480p",
      url: "https://hugh.cdn.rumble.cloud/video/fwe2/00/s8/2/Q/o/T/J/QoTJA.caa.tar?r_file=chunklist.m3u8&r_type=application%2Fvnd.apple.mpegurl&r_range=181623808-181637614",
    });
    expect(buildBlakiteHlsUrl("fww1/72/s8/2/-/9/_/Q/-9_Qz", ranges, "480p")).toEqual({
      quality: "480p",
      url: "https://hugh.cdn.rumble.cloud/video/fww1/72/s8/2/-/9/_/Q/-9_Qz.caa.tar?r_file=chunklist.m3u8&r_type=application%2Fvnd.apple.mpegurl&r_range=181623808-181637614",
    });
    expect(buildBlakiteHlsUrl("invalid?data", ranges)).toBeNull();
  });

  it("matches a Hindi-dubbed catalog entry and returns its health-checked direct HLS stream", async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith("/api/getAllAnime.php")) {
        return new Response(JSON.stringify({
          success: true,
          data: { movies: {}, series: { "297826": { tmdbId: "297826", title: "Tomb Raider King (Hindi Dubbed)", language: "ORG", type: "Series" } } },
        }), { status: 200 });
      }
      expect(url).toBe("https://blakiteapi.xyz/api/get.php?id=1-1&tmdbId=297826");
      expect(new Headers(init?.headers).get("referer")).toBe("https://blakiteapi.xyz/embed/297826/1-1");
      return new Response(JSON.stringify({
        success: true,
        data: { animeTitle: "Tomb Raider King (Hindi Dubbed)", dataId: "fwe2/00/s8/2/Q/o/T/J/QoTJA", format: "M3U8", quality: "480p", ranges },
      }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(resolveBlakiteStreams(
      { primaryTitle: "Tomb Raider King", titles: ["Tomb Raider King"] },
      { anilistId: 999, type: "tv", season: 1, episode: 1 }
    )).resolves.toEqual([{
      name: "BlakiteAPI",
      url: "https://hugh.cdn.rumble.cloud/video/fwe2/00/s8/2/Q/o/T/J/QoTJA.caa.tar?r_file=chunklist.m3u8&r_type=application%2Fvnd.apple.mpegurl&r_range=181623808-181637614",
      title: "BlakiteAPI — Hindi — 480p",
      quality: "480P",
      headers: expect.objectContaining({ Referer: "https://blakiteapi.xyz/", Origin: "https://blakiteapi.xyz" }),
    }]);
  });

  it("matches the canonical TMDB ID when Blakite stores a zero-padded provider ID", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith("/api/getAllAnime.php")) {
        return new Response(JSON.stringify({
          success: true,
          data: { movies: {}, series: { "105009": { tmdbId: "0105009", originalTmdbId: "105009", title: "Tokyo Revengers (Hindi Fan Dubbed)", language: "Fandub", type: "Series" } } },
        }), { status: 200 });
      }
      expect(url).toBe("https://blakiteapi.xyz/api/get.php?id=1-1&tmdbId=0105009");
      return new Response(JSON.stringify({
        success: true,
        data: { animeTitle: "Tokyo Revengers (Hindi Fan Dubbed)", dataId: "fww1/d3/s8/2/p/x/o/Z/pxoZy", format: "M3U8", quality: "480p", ranges },
      }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(resolveBlakiteStreams(
      { primaryTitle: "Unrelated localized title", titles: ["Unrelated localized title"] },
      { tmdbId: 105009, type: "tv", audio: "hindi", season: 1, episode: 1 }
    )).resolves.toEqual([expect.objectContaining({
      name: "BlakiteAPI",
      url: expect.stringContaining("/fww1/d3/s8/2/p/x/o/Z/pxoZy.caa.tar"),
    })]);
  });

  it("constructs and returns a health-checked direct MP4 for a Lookism-style provider payload", async () => {
    expect(buildBlakiteMp4Url("fww1/e1/s8/2/Y/R/y/x/YRyxy", "480p")).toEqual({
      quality: "480p",
      url: "https://hugh.cdn.rumble.cloud/video/fww1/e1/s8/2/Y/R/y/x/YRyxy.caa.mp4",
    });
    expect(buildBlakiteMp4Url("fww1/72/s8/2/-/9/_/Q/-9_Qz", "480p")).toEqual({
      quality: "480p",
      url: "https://hugh.cdn.rumble.cloud/video/fww1/72/s8/2/-/9/_/Q/-9_Qz.caa.mp4",
    });
    expect(buildBlakiteMp4Url("invalid?data", "480p")).toBeNull();

    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith("/api/getAllAnime.php")) {
        return new Response(JSON.stringify({
          success: true,
          data: { movies: {}, series: { "210942": { tmdbId: "210942", title: "Lookism (Hindi Dubbed)", language: "ORG", type: "Series" } } },
        }), { status: 200 });
      }
      expect(url).toBe("https://blakiteapi.xyz/api/get.php?id=1-1&tmdbId=210942");
      return new Response(JSON.stringify({
        success: true,
        data: { animeTitle: "Lookism (Hindi Dubbed)", dataId: "fww1/e1/s8/2/Y/R/y/x/YRyxy", format: "MP4", quality: "480p" },
      }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(resolveBlakiteStreams(
      { primaryTitle: "Unrelated local title", titles: ["Unrelated local title"] },
      { tmdbId: 210942, type: "tv", audio: "hindi", season: 1, episode: 1 }
    )).resolves.toEqual([expect.objectContaining({
      name: "BlakiteAPI",
      url: "https://hugh.cdn.rumble.cloud/video/fww1/e1/s8/2/Y/R/y/x/YRyxy.caa.mp4",
      title: "BlakiteAPI — Hindi — 480p",
      quality: "480P",
    })]);
  });
});
