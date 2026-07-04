import { z } from "zod";
import type { Request, Response } from "express";
import { sendErrorDefault } from "./send-error.js";

/** `?page=1&limit=25` query params — clamped to sane bounds, defaulting when absent/invalid. */
export const PaginationQuerySchema = z.object({
  page: z
    .string()
    .optional()
    .transform((v) => Math.max(1, parseInt(v ?? "1", 10) || 1))
    .pipe(z.number().int().min(1)),
  limit: z
    .string()
    .optional()
    .transform((v) => Math.min(100, Math.max(1, parseInt(v ?? "25", 10) || 25)))
    .pipe(z.number().int().min(1).max(100)),
});

export type PaginationQuery = z.infer<typeof PaginationQuerySchema>;

export function toOffset(page: number, limit: number): number {
  return (page - 1) * limit;
}

/** Parses `req.query` as pagination params, or sends a 422 and returns undefined. */
export function parsePaginationOrRespond(req: Request, res: Response): PaginationQuery | undefined {
  const parsed = PaginationQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    sendErrorDefault(res, "VALIDATION_ERROR", "Invalid pagination query.");
    return undefined;
  }
  return parsed.data;
}
