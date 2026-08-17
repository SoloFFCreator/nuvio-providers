import { afterEach, describe, expect, it, vi } from "vitest";
import { StreamApiError } from "./errors.js";
import { resolveImdbMetadata, resolveMetadata, resolveTmdbMetadata } from "./metadata.js";

function mockJsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function mockHtmlResponse(body: string, status = 200): Response {
  return new Response(body, { status, headers: { "Content-Type": "text/html" } });
}

describe("TMDB and IMDb metadata resolution", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("extracts a title from a public TMDB detail page", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      mockHtmlResponse('<meta property="og:title" content="Lookism">')
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(resolveTmdbMetadata(210942, "tv")).resolves.toEqual({ primaryTitle: "Lookism", titles: ["Lookism"] });
    expect(fetchMock).toHaveBeenCalledWith("https://www.themoviedb.org/tv/210942?language=en-US", expect.any(Object));
  });

  it("resolves an IMDb suggestion record and dispatches a TMDB request", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(mockJsonResponse({ d: [{ id: "tt22297722", l: "Lookism" }] }))
      .mockResolvedValueOnce(mockHtmlResponse('<meta content="Solo Leveling" property="og:title">'));
    vi.stubGlobal("fetch", fetchMock);

    await expect(resolveImdbMetadata("tt22297722")).resolves.toEqual({ primaryTitle: "Lookism", titles: ["Lookism"] });
    await expect(resolveMetadata({ tmdbId: 127532, type: "tv" })).resolves.toEqual({ primaryTitle: "Solo Leveling", titles: ["Solo Leveling"] });
  });

  it("rejects zero, mixed, and unavailable identifier metadata", async () => {
    await expect(resolveMetadata({ type: "tv" })).rejects.toBeInstanceOf(StreamApiError);
    await expect(resolveMetadata({ tmdbId: 210942, imdbId: "tt22297722", type: "tv" })).rejects.toBeInstanceOf(StreamApiError);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockJsonResponse({ error: "not found" }, 404)));
    await expect(resolveImdbMetadata("tt22297722")).rejects.toBeInstanceOf(StreamApiError);
  });
});
