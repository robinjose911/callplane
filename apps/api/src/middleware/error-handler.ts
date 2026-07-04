import type { NextFunction, Request, Response } from "express";
import { isNotFoundError, isUniqueConstraintError } from "@callplane/database";
import { createChildLogger } from "@callplane/voice-core";
import { sendErrorDefault } from "../lib/send-error.js";

const logger = createChildLogger({ module: "error-handler" });

/**
 * Last-resort error handler — every route calls `next(error)` (or throws inside an async
 * handler) for anything it doesn't special-case itself, and this guarantees the response is
 * still the API's `{ success: false, error: {...} }` envelope, never Express's default
 * HTML/plain-text error page. Maps Prisma's P2025/P2002 per CLAUDE.md's stated convention;
 * anything else is an opaque 500 (never leaks internal error details to the client).
 */
export function errorHandler(error: unknown, req: Request, res: Response, _next: NextFunction): void {
  if (isNotFoundError(error)) {
    sendErrorDefault(res, "NOT_FOUND", "The requested resource was not found.");
    return;
  }

  if (isUniqueConstraintError(error)) {
    sendErrorDefault(res, "CONFLICT", "The request conflicts with an existing resource.");
    return;
  }

  logger.error({ err: error, path: req.path, method: req.method }, "Unhandled error");
  sendErrorDefault(res, "INTERNAL_ERROR", "An unexpected error occurred.");
}
