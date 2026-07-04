import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "repo-conventions",
    environment: "node",
    include: ["tests/**/*.test.ts"],
    projects: [
      ".",
      "apps/api",
      "apps/worker",
      "apps/console",
      "packages/contracts",
      "packages/database",
      "packages/voice-core",
    ],
  },
});
