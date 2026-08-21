import { describe, expect, it } from "vitest";
import { toNuvioStreams } from "./compatibility";

const hlsStream = {
  url: "https://cdn.example.net/video/master.m3u8?token=abc",
  title: "Provider — Direct HLS",
  quality: "AUTO",
  headers: {
    "User-Agent": "Mozilla/5.0",
    Referer: "https://provider.example/",
  },
};

describe("toNuvioStreams", () => {
  it("keeps a single HLS source as a one-item array with ExoPlayer format metadata", () => {
    const result = toNuvioStreams([hlsStream]);

    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      ...hlsStream,
      name: "WatchAnimeWorld",
      format: "hls",
      mimeType: "application/x-mpegURL",
      headers: { ...hlsStream.headers, Accept: "*/*" },
    });
  });

  it("marks direct MP4 sources as progressive without overriding caller headers", () => {
    const mp4 = {
      ...hlsStream,
      url: "https://cdn.example.net/video/video.mp4",
      headers: { ...hlsStream.headers, Accept: "*/*" },
    };
    const result = toNuvioStreams([mp4]);

    expect(result[0]).toMatchObject({
      format: "progressive",
      mimeType: "video/mp4",
      headers: mp4.headers,
    });
  });
});
