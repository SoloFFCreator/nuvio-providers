import { describe, expect, it } from "vitest";
import { toNuvioStreams } from "./compatibility.js";

const directStream = {
  url: "https://cdn.example.net/video/master.m3u8?token=abc",
  title: "WatchAnimeWorld — Direct HLS",
  quality: "AUTO",
  headers: {
    "User-Agent": "Mozilla/5.0",
    Referer: "https://play.zephyrix.top/",
  },
};

describe("toNuvioStreams", () => {
  it("keeps a single source as a one-item array with the required name", () => {
    const result = toNuvioStreams([directStream]);

    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ ...directStream, name: "WatchAnimeWorld" });
  });

  it("preserves all direct source fields for multiple sources", () => {
    const second = { ...directStream, url: "https://cdn.example.net/video/video.mp4" };
    const result = toNuvioStreams([directStream, second]);

    expect(result).toHaveLength(2);
    expect(result.every(stream => stream.name === "WatchAnimeWorld")).toBe(true);
    expect(result.map(stream => stream.url)).toEqual([directStream.url, second.url]);
  });
});
