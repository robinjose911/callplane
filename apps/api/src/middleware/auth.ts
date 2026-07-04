import { timingSafeEqual } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { sendErrorDefault } from "../lib/send-error.js";

function safeEqual(a: string, b: string): boolean {
  const bufferA = Buffer.from(a);
  const bufferB = Buffer.from(b);
  if (bufferA.length !== bufferB.length) return false;
  return timingSafeEqual(bufferA, bufferB);
}

/** Requires `Authorization: Bearer <CALLPLANE_API_KEY>` on every request it guards. */
export function requireApiKey(req: Request, res: Response, next: NextFunction): void {
  const expectedKey = process.env["CALLPLANE_API_KEY"];
  const header = req.header("authorization");
  const providedKey = header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : undefined;

  if (!expectedKey || !providedKey || !safeEqual(providedKey, expectedKey)) {
    sendErrorDefault(res, "AUTH_ERROR", "Missing or invalid API key.");
    return;
  }

  next();
}
