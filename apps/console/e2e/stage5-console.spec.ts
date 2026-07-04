import { expect, test } from "@playwright/test";
import { assertStubMode } from "./helpers/stub-probe.js";

const API_BASE_URL = process.env["API_BASE_URL"] ?? "http://localhost:4300";
const CALLPLANE_API_KEY = process.env["CALLPLANE_API_KEY"] ?? "e2e-test-key";
const AUTH_HEADERS = { Authorization: `Bearer ${CALLPLANE_API_KEY}` };

test.beforeAll(async ({ request }) => {
  await assertStubMode(request, test);
});

test.describe("stage 5: console foundation", () => {
  test("a fresh (unauthenticated) context is redirected to /login, then to the dashboard after signing in", async ({
    browser,
  }) => {
    // A raw browser.newContext() inherits playwright.config.ts's `use.storageState` (the
    // authenticated session) unless explicitly cleared here with an empty state — that's what
    // actually simulates a first-time visitor with no cookies; `baseURL` isn't inherited either,
    // so it's passed explicitly too.
    const context = await browser.newContext({
      baseURL: "http://localhost:4400",
      storageState: { cookies: [], origins: [] },
    });
    const page = await context.newPage();

    await page.goto("/");
    await page.waitForURL(/\/login/);
    expect(page.url()).toContain("/login");

    await page.fill('[data-testid="username-input"]', process.env["CONSOLE_USER"] ?? "admin");
    await page.fill('[data-testid="password-input"]', process.env["CONSOLE_PASSWORD"] ?? "e2e-console-password");
    await page.click('[data-testid="login-submit"]');
    await page.waitForSelector('[data-testid="app-sidebar"]');
    expect(page.url()).not.toContain("/login");

    await context.close();
  });

  test("/agents lists all 6 seeded configs", async ({ page }) => {
    await page.goto("/agents");
    await page.waitForSelector('[data-testid="agents-table"]');

    for (const name of [
      "demo-azure-realtime",
      "demo-cascade",
      "demo-cascade-cartesia",
      "demo-gemini-realtime",
      "demo-half-cascade",
      "demo-openai-realtime",
    ]) {
      await expect(page.locator(`[data-testid="agent-row-${name}"]`)).toBeVisible();
    }
  });

  test("editing demo-cascade's TTS provider persists via the API, then reverts (idempotent)", async ({ page }) => {
    await page.goto("/agents/demo-cascade");
    await page.waitForSelector('[data-testid="agent-editor-form"]');

    await page.click('[data-testid="field-tts-provider"]');
    await page.getByRole("option", { name: "cartesia" }).click();
    await page.click('[data-testid="agent-editor-submit"]');
    await page.waitForURL(/\/agents$/);

    const afterEdit = await fetch(`${API_BASE_URL}/v1/agents/demo-cascade`, { headers: AUTH_HEADERS });
    expect((await afterEdit.json()).ttsProvider).toBe("cartesia");

    // Revert so the seed's expected state survives for any other spec that depends on it.
    await page.goto("/agents/demo-cascade");
    await page.waitForSelector('[data-testid="agent-editor-form"]');
    await page.click('[data-testid="field-tts-provider"]');
    await page.getByRole("option", { name: "elevenlabs" }).click();
    await page.click('[data-testid="agent-editor-submit"]');
    await page.waitForURL(/\/agents$/);

    const afterRevert = await fetch(`${API_BASE_URL}/v1/agents/demo-cascade`, { headers: AUTH_HEADERS });
    expect((await afterRevert.json()).ttsProvider).toBe("elevenlabs");
  });

  test("creating a new agent via the UI makes it appear in GET /v1/agents, then cleans it up", async ({ page }) => {
    const name = `e2e-created-agent-${Date.now()}`;

    await page.goto("/agents/new");
    await page.waitForSelector('[data-testid="agent-editor-form"]');

    await page.fill('[data-testid="field-name"]', name);
    await page.fill('[data-testid="field-prompt"]', "You are a test agent.");
    await page.click('[data-testid="agent-editor-submit"]');
    await page.waitForURL(/\/agents$/);

    const listResponse = await fetch(`${API_BASE_URL}/v1/agents`, { headers: AUTH_HEADERS });
    const { agents } = await listResponse.json();
    expect(agents.map((a: { name: string }) => a.name)).toContain(name);

    // Cleanup — this spec's own artifact, not a UI feature under test.
    await fetch(`${API_BASE_URL}/v1/agents/${name}`, { method: "DELETE", headers: AUTH_HEADERS });
    const afterDelete = await fetch(`${API_BASE_URL}/v1/agents/${name}`, { headers: AUTH_HEADERS });
    expect(afterDelete.status).toBe(404);
  });
});
