import { describe, expect, it } from "vitest";
import { toNuvioStreams } from "./compatibility.js";

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
  it("keeps a single HLS source as a one-item strict legacy-compatible array", () => {
    const result = toNuvioStreams([hlsStream]);

    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      ...hlsStream,
      name: "WatchAnimeWorld",
      headers: { ...hlsStream.headers, Accept: "*/*" },
    });
    expect(result[0]).not.toHaveProperty("format");
    expect(result[0]).not.toHaveProperty("mimeType");
    expect(result[0]).not.toHaveProperty("subtitles");
  });

  it("preserves an existing Accept header for direct MP4 sources", () => {
    const mp4 = {
      ...hlsStream,
      url: "https://cdn.example.net/video/video.mp4",
      headers: { ...hlsStream.headers, Accept: "*/*" },
    };
    const result = toNuvioStreams([mp4]);

    expect(result[0]).toEqual({
      ...mp4,
      name: "WatchAnimeWorld",
    });
  });
});
