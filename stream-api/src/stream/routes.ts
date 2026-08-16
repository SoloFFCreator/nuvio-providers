import type { Express, Request, Response } from "express";
import { validateAllowedPackage } from "./auth.js";
import { StreamApiError } from "./errors.js";
import { resolveMetadata } from "./metadata.js";
import { parseStreamRequest } from "./validation.js";
import { resolveWatchAnimeWorldStreams } from "./watchAnimeWorld.js";

function sendError(res: Response, error: unknown): void {
  if (error instanceof StreamApiError) {
    res.status(error.statusCode).json({ error: { code: error.code, message: error.message } });
    return;
  }

  console.error("[stream-api] Unexpected error", error);
  res.status(500).json({ error: { code: "internal_error", message: "The stream request could not be completed." } });
}

async function handleStreamRequest(req: Request, res: Response): Promise<void> {
  try {
    validateAllowedPackage(req.header("X-App-Package") ?? undefined);

    const request = parseStreamRequest(req.query as Record<string, unknown>);
    const metadata = await resolveMetadata({ anilistId: request.anilistId, malId: request.malId });
    const streams = await resolveWatchAnimeWorldStreams(metadata, request);

    // The success payload is deliberately an array: each entry has exactly url, title, quality, and headers.
    res.status(200).json(streams);
  } catch (error) {
    sendError(res, error);
  }
}

export function registerStreamRoutes(app: Express): void {
  app.get("/api/health", (_req, res) => {
    res.status(200).json({ status: "ok" });
  });

  app.get("/api/stream", (req, res) => {
    void handleStreamRequest(req, res);
  });
}
