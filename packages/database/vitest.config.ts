import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    passWithNoTests: true,
    // DB-touching suites share one Postgres schema — run sequentially (per PLAN.md's
    // `turbo test --concurrency=1` convention for this workspace).
    fileParallelism: false,
  },
});
