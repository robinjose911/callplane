import { randomUUID } from "node:crypto";

/** Unique-per-run prefix so parallel test files never collide on unique constraints. */
export function testId(label: string): string {
  return `test-${label}-${randomUUID().slice(0, 8)}`;
}
