import type { Request } from "express";

/**
 * Route params are typed `string | undefined` under noUncheckedIndexedAccess even for segments
 * Express guarantees are present when the route matches — this is the request boundary, so we
 * assert rather than cast, per CLAUDE.md's "?? fallback" convention (here: throw instead of
 * silently coercing to a literal "undefined" string that would flow into a DB lookup).
 */
export function requireParam(req: Request, name: string): string {
  const value = req.params[name];
  if (typeof value !== "string") {
    throw new Error(`Route parameter "${name}" was expected but missing — check the route pattern.`);
  }
  return value;
}
