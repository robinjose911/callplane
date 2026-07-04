import type { Response } from "express";
import type { ZodError } from "zod";
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

/** Sends a VALIDATION_ERROR response with each Zod issue mapped to a { field, message } pair. */
export function sendValidationError(res: Response, error: ZodError, message = "Invalid request body."): void {
  sendErrorDefault(
    res,
    "VALIDATION_ERROR",
    message,
    error.issues.map((issue) => ({ field: issue.path.join("."), message: issue.message })),
  );
}
