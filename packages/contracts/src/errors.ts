import { z } from "zod";

/**
 * Error code taxonomy for all API error responses.
 * These are the only error codes returned by the API — never leak internal error details.
 */
export const ErrorCodeSchema = z.enum([
  "VALIDATION_ERROR",
  "AUTH_ERROR",
  "NOT_FOUND",
  "CONFLICT",
  "RATE_LIMIT",
  "PROVIDER_ERROR",
  "TRUNK_UNAVAILABLE",
  "ALL_PROVIDERS_FAILED",
  "INTERNAL_ERROR",
]);

export type ErrorCode = z.infer<typeof ErrorCodeSchema>;

/** HTTP status codes mapped to each error code. Prisma P2025 → NOT_FOUND, P2002 → CONFLICT. */
export const ERROR_CODE_HTTP_STATUS: Record<ErrorCode, number> = {
  VALIDATION_ERROR: 422,
  AUTH_ERROR: 401,
  NOT_FOUND: 404,
  CONFLICT: 409,
  RATE_LIMIT: 429,
  PROVIDER_ERROR: 502,
  TRUNK_UNAVAILABLE: 503,
  ALL_PROVIDERS_FAILED: 502,
  INTERNAL_ERROR: 500,
};

/** Single field-level validation error detail. */
export const FieldErrorSchema = z.object({
  field: z.string(),
  message: z.string(),
});

export type FieldError = z.infer<typeof FieldErrorSchema>;

/** Standard error response body returned for all non-2xx responses. */
export const ErrorResponseSchema = z.object({
  success: z.literal(false),
  error: z.object({
    code: ErrorCodeSchema,
    message: z.string(),
    fields: z.array(FieldErrorSchema).optional(),
  }),
});

export type ErrorResponse = z.infer<typeof ErrorResponseSchema>;
