import type { Request, Response } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./metadata.js", () => ({
  resolveMetadata: vi.fn(async () => ({ primaryTitle: "Test Anime", titles: ["Test Anime"] })),
}));

vi.mock("./blakite.js", () => ({
  resolveBlakiteStreams: vi.fn(async () => [
    {
      name: "BlakiteAPI",
      url: "https://hugh.cdn.rumble.cloud/video/test.caa.tar?r_file=chunklist.m3u8&r_range=1-2",
      title: "BlakiteAPI — Hindi — 480p",
      quality: "480P",
      headers: { "User-Agent": "Mozilla/5.0", Referer: "https://blakiteapi.xyz/", Origin: "https://blakiteapi.xyz" },
    },
  ]),
}));

vi.mock("./megaPlay.js", () => ({
  resolveMegaPlayStreams: vi.fn(async () => [
    {
      name: "MegaPlay",
      url: "https://cdn.watching.onl/video/master.m3u8?token=abc",
      title: "MegaPlay — requested audio",
      quality: "AUTO",
      headers: { "User-Agent": "Mozilla/5.0", Referer: "https://megaplay.buzz/" },
    },
  ]),
  isClientFetchableMedia: vi.fn(async () => true),
}));

import { handleStreamRequest } from "./routes.js";
import { resolveBlakiteStreams } from "./blakite.js";
import { resolveMegaPlayStreams } from "./megaPlay.js";

type CapturedResponse = { statusCode: number; body: unknown };

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

  it("uses BlakiteAPI only for a Hindi request without X-App-Package", async () => {
    const { response, captured } = makeResponse();
    const request = {
      query: { anilistId: "20", type: "tv", season: "1", episode: "1", audio: "hindi" },
      header: vi.fn(() => undefined),
    } as unknown as Request;

    await handleStreamRequest(request, response);

    expect(captured.statusCode).toBe(200);
    expect(captured.body).toEqual([expect.objectContaining({ name: "BlakiteAPI", quality: "480P" })]);
    expect(vi.mocked(resolveBlakiteStreams)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(resolveMegaPlayStreams)).not.toHaveBeenCalled();
  });

  it.each(["sub", "dub"] as const)("uses MegaPlay only for a %s request", async audio => {
    const { response, captured } = makeResponse();
    const request = {
      query: { anilistId: "20", type: "tv", season: "1", episode: "1", audio },
      header: vi.fn(() => undefined),
    } as unknown as Request;

    await handleStreamRequest(request, response);

    expect(captured.statusCode).toBe(200);
    expect(captured.body).toEqual([expect.objectContaining({ name: "MegaPlay", quality: "AUTO" })]);
    expect(vi.mocked(resolveMegaPlayStreams)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(resolveBlakiteStreams)).not.toHaveBeenCalled();
  });
});
