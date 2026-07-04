import { chromium, type FullConfig } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const AUTH_DIR = join(__dirname, ".auth");
export const STORAGE_STATE_PATH = join(AUTH_DIR, "user.json");

const CONSOLE_USER = process.env["CONSOLE_USER"] ?? "admin";
const CONSOLE_PASSWORD = process.env["CONSOLE_PASSWORD"] ?? "e2e-console-password";

/** Logs into the console once, saving session storageState for every browser-mode spec to reuse. */
export default async function globalSetup(config: FullConfig): Promise<void> {
  mkdirSync(AUTH_DIR, { recursive: true });

  const baseURL = config.projects[0]?.use.baseURL ?? "http://localhost:4400";
  const browser = await chromium.launch();
  const page = await browser.newPage();

  // Generous timeout: this is the very first request to the console dev server, which is still
  // compiling the /login, /api/auth/login, and / routes on demand (each can take several seconds
  // the first time). A cold Next.js dev server easily needs 20-30s for this whole sequence.
  await page.goto(`${baseURL}/login`, { timeout: 30000 });
  await page.fill('[data-testid="username-input"]', CONSOLE_USER);
  await page.fill('[data-testid="password-input"]', CONSOLE_PASSWORD);
  await page.click('[data-testid="login-submit"]');
  // Waits on the authenticated shell rendering (not page.waitForURL()) — login navigates via
  // window.location.href, a full page load, so this selector wait covers it end to end.
  await page.waitForSelector('[data-testid="app-sidebar"]', { timeout: 30000 });

  await page.context().storageState({ path: STORAGE_STATE_PATH });
  await browser.close();
}
