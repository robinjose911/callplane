import { Prisma } from "@prisma/client";

/** True for Prisma's "record not found" error (P2025) — callers map this to an HTTP 404. */
export function isNotFoundError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025";
}

/** True for Prisma's "unique constraint violated" error (P2002) — callers map this to an HTTP 409. */
export function isUniqueConstraintError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}
