import type { Response } from "express";
import { ERROR_CODE_HTTP_STATUS, type ErrorCode, type FieldError } from "@callplane/contracts";

/** Sends the standard `{ success: false, error: {...} }` shape for a given error code. */
export function sendError(
  res: Response,
  status: number,
  code: ErrorCode,
  message: string,
  fields?: FieldError[],
): void {
  res.status(status).json({
    success: false,
    error: { code, message, ...(fields !== undefined ? { fields } : {}) },
  });
}

/** Sends an error using the code's documented default HTTP status (ERROR_CODE_HTTP_STATUS). */
export function sendErrorDefault(
  res: Response,
  code: ErrorCode,
  message: string,
  fields?: FieldError[],
): void {
  sendError(res, ERROR_CODE_HTTP_STATUS[code], code, message, fields);
}
