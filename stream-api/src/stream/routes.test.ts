import type { Request, Response } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./metadata.js", () => ({
  resolveMetadata: vi.fn(async () => ({ primaryTitle: "Test Anime", titles: ["Test Anime"] })),
}));

vi.mock("./blakite.js", () => ({
  resolveBlakiteStreams: vi.fn(async () => []),
}));

vi.mock("./megaPlay.js", () => ({
  resolveMegaPlayStreams: vi.fn(async () => [
    {
      name: "MegaPlay",
      url: "https://cdn.watching.onl/video/master.m3u8?token=abc",
      title: "MegaPlay — sub",
      quality: "AUTO",
      headers: { "User-Agent": "Mozilla/5.0", Referer: "https://megaplay.buzz/" },
    },
  ]),
  isClientFetchableMedia: vi.fn(async () => true),
}));

vi.mock("./watchAnimeWorld.js", () => ({
  resolveWatchAnimeWorldStreams: vi.fn(async () => [
    {
      url: "https://cdn.example.net/video/master.m3u8?token=abc",
      title: "WatchAnimeWorld — Direct HLS",
      quality: "AUTO",
      headers: {
        "User-Agent": "Mozilla/5.0",
        Referer: "https://play.zephyrix.top/",
        Accept: "*/*",
        "X-Requested-With": "XMLHttpRequest",
      },
    },
  ]),
}));

import { handleStreamRequest } from "./routes.js";
import { isClientFetchableMedia, resolveMegaPlayStreams } from "./megaPlay.js";
import { resolveWatchAnimeWorldStreams } from "./watchAnimeWorld.js";

type CapturedResponse = {
  statusCode: number;
  body: unknown;
};

function makeResponse(): { response: Response; captured: CapturedResponse } {
  const captured: CapturedResponse = { statusCode: 200, body: undefined };
  const response = {
    status(code: number) {
      captured.statusCode = code;
      return response;
    },
    json(body: unknown) {
      captured.body = body;
      return response;
    },
  } as unknown as Response;

  return { response, captured };
}

describe("handleStreamRequest", () => {
  beforeEach(() => vi.clearAllMocks());

  it("accepts a request without X-App-Package and returns a one-item Nuvio array", async () => {
    const { response, captured } = makeResponse();
    const request = {
      query: { anilistId: "20", type: "tv", season: "1", episode: "1" },
      header: vi.fn(() => undefined),
    } as unknown as Request;

    await handleStreamRequest(request, response);

    expect(captured.statusCode).toBe(200);
    expect(captured.body).toEqual([
      {
        name: "WatchAnimeWorld",
        url: "https://cdn.example.net/video/master.m3u8?token=abc",
        title: "WatchAnimeWorld — Direct HLS",
        quality: "AUTO",
        headers: {
          "User-Agent": "Mozilla/5.0",
          Referer: "https://play.zephyrix.top/",
          Accept: "*/*",
          "X-Requested-With": "XMLHttpRequest",
        },
      },
    ]);
  });

  it("filters a blocked Zephyrix source and falls back to the validated MegaPlay source", async () => {
    vi.mocked(resolveWatchAnimeWorldStreams).mockResolvedValueOnce([
      {
        url: "https://play.zephyrix.top/cdn/hls/blocked/master.m3u8?token=expired",
        title: "WatchAnimeWorld — Direct HLS",
        quality: "AUTO",
        headers: { "User-Agent": "Mozilla/5.0", Referer: "https://play.zephyrix.top/" },
      },
    ]);
    vi.mocked(isClientFetchableMedia).mockImplementation(async url => !url.includes("/blocked/"));

    const { response, captured } = makeResponse();
    const request = {
      query: { anilistId: "20", type: "tv", season: "1", episode: "1" },
      header: vi.fn(() => undefined),
    } as unknown as Request;

    await handleStreamRequest(request, response);

    expect(vi.mocked(resolveMegaPlayStreams)).toHaveBeenCalledTimes(1);
    expect(captured.statusCode).toBe(200);
    expect(captured.body).toEqual([
      {
        name: "MegaPlay",
        url: "https://cdn.watching.onl/video/master.m3u8?token=abc",
        title: "MegaPlay — sub",
        quality: "AUTO",
        headers: { "User-Agent": "Mozilla/5.0", Referer: "https://megaplay.buzz/" },
      },
    ]);
  });
});
