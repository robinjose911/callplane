import { existsSync, copyFileSync } from "node:fs";
import { join } from "node:path";

export const ENV_TARGETS = ["apps/api", "apps/worker", "apps/console"];

/**
 * Copies `<target>/.env.example` to `<target>/.env` for every target that doesn't already have
 * one — idempotent by design, since a second `npm run setup` run must never clobber a developer's
 * already-edited `.env`. Returns one result per target for the caller to log.
 */
export function copyEnvExamples(repoRoot, targets = ENV_TARGETS) {
  return targets.map((target) => {
    const examplePath = join(repoRoot, target, ".env.example");
    const envPath = join(repoRoot, target, ".env");
    if (existsSync(envPath)) {
      return { target, action: "skipped" };
    }
    copyFileSync(examplePath, envPath);
    return { target, action: "written" };
  });
}
