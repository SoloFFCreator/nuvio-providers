import type { Express, Request, Response } from "express";
import { StreamApiError } from "./errors.js";
import { resolveMetadata } from "./metadata.js";
import { parseStreamRequest } from "./validation.js";
import { toNuvioStreams } from "./compatibility.js";
import { resolveBlakiteStreams } from "./blakite.js";
import { resolveMegaPlayStreams, isClientFetchableMedia } from "./megaPlay.js";

function sendError(res: Response, error: unknown): void {
  if (error instanceof StreamApiError) {
    res.status(error.statusCode).json({ error: { code: error.code, message: error.message } });
    return;
  }

  console.error("[stream-api] Unexpected error", error);
  res.status(500).json({ error: { code: "internal_error", message: "The stream request could not be completed." } });
}

export async function handleStreamRequest(req: Request, res: Response): Promise<void> {
  try {
    const request = parseStreamRequest(req.query as Record<string, unknown>);
    const metadata = await resolveMetadata({ anilistId: request.anilistId, malId: request.malId });
    const resolvers = request.audio === "hindi"
      ? [() => resolveBlakiteStreams(metadata, request)]
      : [() => resolveMegaPlayStreams(metadata, request)];

    for (const resolveStreams of resolvers) {
      const streams = await resolveStreams().catch(() => []);
      const clientFetchableStreams = (
        await Promise.all(
          streams.map(async stream =>
            (await isClientFetchableMedia(stream.url, stream.headers)) ? stream : null
          )
        )
      ).filter((stream): stream is NonNullable<typeof stream> => stream !== null);

      if (clientFetchableStreams.length > 0) {
        // Nuvio requires a top-level array. A one-item array is valid, but each item
        // must include the provider name in addition to the direct playback fields.
        res.status(200).json(toNuvioStreams(clientFetchableStreams));
        return;
      }
    }

    throw new StreamApiError(
      404,
      "streams_not_found",
      request.audio === "hindi"
        ? "No client-fetchable Hindi playback stream was available from BlakiteAPI."
        : `No client-fetchable ${request.audio} playback stream was available from MegaPlay.`
    );
  } catch (error) {
    sendError(res, error);
  }
}

export function registerStreamRoutes(app: Express): void {
  app.get("/api/health", (_req, res) => {
    res.status(200).json({ status: "ok" });
  });

  app.get("/api/stream", handleStreamRequest);
}
