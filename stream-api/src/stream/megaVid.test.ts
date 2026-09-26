import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveMegaVidStreams } from "./megaVid.js";

const request = {
  malId: 58567,
  type: "tv" as const,
  audio: "sub" as const,
  season: 2,
  episode: 1,
};
const metadata = { primaryTitle: "Solo Leveling", titles: ["Solo Leveling"] };

function mockFetch(response: Response): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn(async () => response);
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => vi.unstubAllGlobals());

describe("MegaVid resolver", () => {
  it.each(["sub", "dub"] as const)("resolves a direct %s HLS source", async audio => {
    const source = "https://megavid.buzz/vid/token/secret/master.m3u8";
    const fetchMock = mockFetch(new Response(JSON.stringify({ success: true, source }), { status: 200 }));

    await expect(resolveMegaVidStreams(metadata, { ...request, audio })).resolves.toEqual([
      expect.objectContaining({
        name: "MegaVid",
        title: `MegaVid — ${audio}`,
        url: source,
        quality: "AUTO",
        headers: {
          "User-Agent": expect.any(String),
          Accept: "*/*",
          Origin: "https://megavid.buzz",
          Referer: "https://megavid.buzz/",
        },
      }),
    ]);
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(`https://megavid.buzz/api/mal/58567/1/${audio}`);
  });

  it("extracts direct WebVTT subtitle tracks", async () => {
    const source = "https://megavid.buzz/vid/token/secret/master.m3u8";
    const subtitle = "https://megavid.buzz/sub/token/english.vtt";
    mockFetch(new Response(JSON.stringify({
      success: true,
      source,
      tracks: [
        { file: subtitle, label: "English", kind: "captions", default: true },
        { file: "https://megavid.buzz/player/subtitle", label: "Invalid wrapper", kind: "captions" },
      ],
    }), { status: 200 }));

    await expect(resolveMegaVidStreams(metadata, request)).resolves.toEqual([
      expect.objectContaining({ subtitles: [{ url: subtitle, label: "English", kind: "captions", default: true }] }),
    ]);
  });

  it("does not return a player page or wrapper URL", async () => {
    mockFetch(new Response(JSON.stringify({ success: true, source: "https://megavid.buzz/mal/58567/1/sub" }), { status: 200 }));
    await expect(resolveMegaVidStreams(metadata, request)).resolves.toEqual([]);
  });

  it("requires a MAL ID because MegaVid documents only MAL and AniList source routes", async () => {
    await expect(resolveMegaVidStreams(metadata, { ...request, malId: undefined })).resolves.toEqual([]);
  });
});
