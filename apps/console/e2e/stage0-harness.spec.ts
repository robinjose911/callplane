import { expect, test } from "@playwright/test";
import { assertStubMode } from "./helpers/stub-probe.js";

const API_BASE_URL = process.env["API_BASE_URL"] ?? "http://localhost:4300";
const WORKER_HEALTH_URL = process.env["WORKER_HEALTH_URL"] ?? "http://localhost:4301/health";

test.beforeAll(async ({ request }) => {
  await assertStubMode(request, test);
});

test.describe("stage 0: harness", () => {
  test("api /health reports ok + stubMode", async ({ request }) => {
    const response = await request.get(`${API_BASE_URL}/health`);
    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(body).toMatchObject({ ok: true, stubMode: true });
  });

  test("worker health endpoint responds", async ({ request }) => {
    const response = await request.get(WORKER_HEALTH_URL);
    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(body).toMatchObject({ ok: true, stubMode: true });
  });

  test("console renders with callplane title and dark theme", async ({ page }) => {
    await page.goto("/");

    await expect(page).toHaveTitle(/callplane/i);
    const htmlClass = await page.locator("html").getAttribute("class");
    expect(htmlClass).toContain("dark");
  });
});
