import { afterEach, describe, expect, it, vi } from "vitest";
import { StreamApiError } from "./errors";
import { resolveAniListMetadata, resolveMalMetadata } from "./metadata";

function mockJsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("anime metadata resolution", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("uses AniList title variants for WatchAnimeWorld matching", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      mockJsonResponse({
        data: {
          Media: {
            title: { english: "Naruto", romaji: "Naruto", native: "ナルト" },
            synonyms: ["Naruto TV"],
          },
        },
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(resolveAniListMetadata(20)).resolves.toEqual({
      primaryTitle: "Naruto",
      titles: ["Naruto", "ナルト", "Naruto TV"],
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://graphql.anilist.co",
      expect.objectContaining({ method: "POST" })
    );
  });

  it("uses MAL title variants for WatchAnimeWorld matching", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      mockJsonResponse({
        data: {
          title: "Naruto",
          title_english: "Naruto",
          title_japanese: "ナルト",
          titles: [{ title: "Naruto" }, { title: "Naruto TV" }],
        },
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(resolveMalMetadata(20)).resolves.toEqual({
      primaryTitle: "Naruto",
      titles: ["Naruto", "ナルト", "Naruto TV"],
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.jikan.moe/v4/anime/20/full",
      expect.any(Object)
    );
  });

  it("returns a controlled lookup error when the upstream metadata request fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockJsonResponse({ error: "not found" }, 404)));

    await expect(resolveAniListMetadata(999999999)).rejects.toBeInstanceOf(StreamApiError);
  });
});
