import { expect, test } from "@playwright/test";
import { assertStubMode } from "./helpers/stub-probe.js";

test.beforeAll(async ({ request }) => {
  await assertStubMode(request, test);
});

test.describe("stage 7: outbound call UI + live monitor + call detail", () => {
  test("New call → detail page: live transcript grows while IN_PROGRESS, then COMPLETED", async ({ page }) => {
    await page.goto("/calls");
    await page.waitForSelector('[data-testid="calls-table"]');

    await page.click('[data-testid="new-call-button"]');
    await page.waitForSelector('[data-testid="new-call-dialog"]');

    await page.click('[data-testid="new-call-agent-select"]');
    await page.getByRole("option", { name: "demo-cascade", exact: true }).click();
    await page.fill('[data-testid="new-call-number"]', "+15550000000");
    await page.click('[data-testid="new-call-scenario-select"]');
    await page.getByRole("option", { name: "demo_booking", exact: true }).click();
    await page.click('[data-testid="new-call-submit"]');

    await page.waitForURL(/\/calls\/[0-9a-f-]+$/);
    await page.waitForSelector('[data-testid="call-detail-page"]');

    // While non-terminal, the live indicator shows and the transcript grows via polling.
    await expect(page.locator('[data-testid="live-indicator"]')).toBeVisible();
    await expect(page.locator('[data-testid="call-turn-0"]')).toBeVisible({ timeout: 15000 });
    const turnCountMidCall = await page.locator('[data-testid^="call-turn-"]').count();

    await expect(page.locator('[data-testid="call-detail-status"]')).toHaveText("COMPLETED", { timeout: 15000 });
    await expect(page.locator('[data-testid="live-indicator"]')).not.toBeVisible();

    const turnCountFinal = await page.locator('[data-testid^="call-turn-"]').count();
    expect(turnCountFinal).toBeGreaterThanOrEqual(turnCountMidCall);
    expect(turnCountFinal).toBe(5); // demo_booking's full scripted turn count

    await expect(page.locator('[data-testid="timeline-event-call_completed"]')).toBeVisible();
  });

  test("New call to a trunk-failure number: detail page shows failover_triggered, then COMPLETED", async ({
    page,
  }) => {
    await page.goto("/calls");
    await page.waitForSelector('[data-testid="calls-table"]');

    await page.click('[data-testid="new-call-button"]');
    await page.waitForSelector('[data-testid="new-call-dialog"]');

    await page.click('[data-testid="new-call-agent-select"]');
    await page.getByRole("option", { name: "demo-cascade", exact: true }).click();
    await page.fill('[data-testid="new-call-number"]', "+15550000003");
    await page.click('[data-testid="new-call-scenario-select"]');
    await page.getByRole("option", { name: "demo_greeting", exact: true }).click();
    await page.click('[data-testid="new-call-submit"]');

    await page.waitForURL(/\/calls\/[0-9a-f-]+$/);
    await page.waitForSelector('[data-testid="call-detail-page"]');

    await expect(page.locator('[data-testid="timeline-event-failover_triggered"]')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('[data-testid="call-detail-status"]')).toHaveText("COMPLETED", { timeout: 15000 });
  });
});
