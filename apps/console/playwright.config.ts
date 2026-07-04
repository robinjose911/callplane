import { defineConfig, devices } from "@playwright/test";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));
const isCI = !!process.env["CI"];

const stubEnv = {
  PROVIDER_STUB_MODE: "true",
  SIP_STUB_MODE: "true",
  RECORDING_MODE: "stub",
  CALLPLANE_API_KEY: "e2e-test-key",
  LIVEKIT_URL: process.env["LIVEKIT_URL"] ?? "ws://localhost:7880",
  LIVEKIT_API_KEY: "devkey",
  LIVEKIT_API_SECRET: "secret",
  REDIS_URL: process.env["REDIS_URL"] ?? "redis://localhost:6379",
  DATABASE_URL:
    process.env["DATABASE_URL"] ??
    "postgresql://postgres:postgres@localhost:5433/callplane?schema=callplane",
};

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: isCI ? 1 : 0,
  reporter: isCI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: "http://localhost:4400",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        launchOptions: {
          args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"],
        },
      },
    },
  ],
  webServer: [
    {
      command: "npm run dev --workspace=@callplane/api",
      cwd: repoRoot,
      url: "http://localhost:4300/health",
      reuseExistingServer: !isCI,
      env: { ...stubEnv, PORT: "4300", SERVICE_NAME: "callplane-api" },
      stdout: "pipe",
      stderr: "pipe",
    },
    {
      command: "npm run dev --workspace=@callplane/worker",
      cwd: repoRoot,
      url: "http://localhost:4301/health",
      reuseExistingServer: !isCI,
      env: { ...stubEnv, WORKER_HEALTH_PORT: "4301", SERVICE_NAME: "callplane-worker" },
      stdout: "pipe",
      stderr: "pipe",
    },
    {
      command: "npm run dev --workspace=@callplane/console",
      cwd: repoRoot,
      url: "http://localhost:4400",
      reuseExistingServer: !isCI,
      env: { ...stubEnv, API_BASE_URL: "http://localhost:4300" },
      stdout: "pipe",
      stderr: "pipe",
    },
  ],
});
