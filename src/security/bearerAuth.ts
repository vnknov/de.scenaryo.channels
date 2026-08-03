import { createHash, timingSafeEqual } from "node:crypto";
import type { RequestHandler } from "express";
import { ConfigurationError } from "../domain/errors.js";

export function createBearerAuth(expectedToken: string): RequestHandler {
  if (!expectedToken.trim()) {
    throw new ConfigurationError("CHANNELS_MCP_TOKEN is missing or empty.");
  }
  const expectedDigest = digest(expectedToken);

  return (request, response, next) => {
    const authorization = request.header("authorization");
    const match = /^Bearer (.+)$/.exec(authorization ?? "");
    const providedDigest = digest(match?.[1] ?? "");

    if (!match || !timingSafeEqual(expectedDigest, providedDigest)) {
      response.status(401).json({ error: "Unauthorized" });
      return;
    }
    next();
  };
}

function digest(value: string): Buffer {
  return createHash("sha256").update(value).digest();
}
