import { describe, expect, it } from "vitest";
import { isDirectPlaybackUrl, normalizeDirectStreams } from "./watchAnimeWorld";

describe("isDirectPlaybackUrl", () => {
  it("allows direct HLS, MP4, and MKV URLs with signed query parameters", () => {
    expect(isDirectPlaybackUrl("https://cdn.example.net/show/master.m3u8?expires=123&signature=abc")).toBe(true);
    expect(isDirectPlaybackUrl("https://cdn.example.net/show/video.mp4")).toBe(true);
    expect(isDirectPlaybackUrl("https://cdn.example.net/show/video.mkv?token=abc")).toBe(true);
  });

  it("rejects short-link redirects and HTML embed pages", () => {
    expect(isDirectPlaybackUrl("https://short.icu/YOgUAbEIg")).toBe(false);
    expect(isDirectPlaybackUrl("https://play.zephyrix.top/video/abc123")).toBe(false);
    expect(isDirectPlaybackUrl("https://example.net/player.html")).toBe(false);
  });

  it("returns only the required stream schema and removes duplicate or redirect entries", () => {
    const streams = normalizeDirectStreams([
      {
        url: "https://cdn.example.net/show/master.m3u8?token=abc",
        title: "English",
        quality: "AUTO",
        headers: {
          "User-Agent": "test-agent",
          Referer: "https://player.example.net/",
          Accept: "*/*",
          "Accept-Language": "en-US,en;q=0.9",
          "X-Requested-With": "XMLHttpRequest",
        },
        ignored: "not returned",
      } as unknown as Parameters<typeof normalizeDirectStreams>[0][number],
      {
        url: "https://short.icu/YOgUAbEIg",
        title: "Redirect",
        quality: "AUTO",
        headers: { "User-Agent": "test-agent", Referer: "https://player.example.net/" },
      },
      {
        url: "https://play.zephyrix.top/video/abc123",
        title: "Embed",
        quality: "AUTO",
        headers: { "User-Agent": "test-agent", Referer: "https://player.example.net/" },
      },
      {
        url: "https://cdn.example.net/show/master.m3u8?token=abc",
        title: "Duplicate",
        quality: "AUTO",
        headers: { "User-Agent": "test-agent", Referer: "https://player.example.net/" },
      },
    ]);

    expect(streams).toHaveLength(1);
    expect(Object.keys(streams[0]).sort()).toEqual(["headers", "quality", "title", "url"]);
    expect(streams[0]?.headers).toEqual({
      "User-Agent": "test-agent",
      Referer: "https://player.example.net/",
      Accept: "*/*",
      "Accept-Language": "en-US,en;q=0.9",
      "X-Requested-With": "XMLHttpRequest",
    });
  });
});
