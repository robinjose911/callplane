import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { expect, test } from "@playwright/test";
import { assertStubMode } from "./helpers/stub-probe.js";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

test.beforeAll(async ({ request }) => {
  await assertStubMode(request, test);
});

test.describe("stage 10: launch readiness", () => {
  test("README documents the exact quickstart commands this repo actually uses", async () => {
    const readme = readFileSync(join(repoRoot, "README.md"), "utf8");
    expect(readme).toContain("docker compose --profile full up -d");
    expect(readme).toContain("npm run setup");
    expect(readme).toContain("turbo dev");
  });

  test("every doc file referenced from README/CONTRIBUTING/docs exists on disk (no dead links)", () => {
    // Re-runs the same check scripts/check-links.mjs performs in CI, as a Playwright-visible
    // assertion — if this ever regresses, it fails loudly in the same regression run as
    // everything else, not just in a separate CI step someone could miss.
    expect(() => execFileSync("node", ["scripts/check-links.mjs"], { cwd: repoRoot })).not.toThrow();
  });

  test("every doc referenced from README exists and is non-empty", async () => {
    for (const doc of [
      "docs/architecture.md",
      "docs/providers.md",
      "docs/telephony.md",
      "docs/webhooks.md",
      "docs/cost-model.md",
      "MAINTENANCE.md",
      "CONTRIBUTING.md",
    ]) {
      const content = readFileSync(join(repoRoot, doc), "utf8");
      expect(content.length).toBeGreaterThan(200);
    }
  });

  test("every ADR referenced in docs/adr exists and is non-empty", async () => {
    for (const adr of [
      "docs/adr/0001-stub-as-demo-mode.md",
      "docs/adr/0002-failover-at-init-only.md",
      "docs/adr/0003-webhook-outbox-pattern.md",
      "docs/adr/0004-polling-over-sse-v1.md",
    ]) {
      const content = readFileSync(join(repoRoot, adr), "utf8");
      expect(content.length).toBeGreaterThan(200);
    }
  });

  test("every console page in the sidebar renders without a server error (final launch smoke)", async ({ page }) => {
    // Login itself is already covered end-to-end by stage5-console.spec.ts's unauthenticated-
    // context test — this just proves every page a stranger's first click could land on renders.
    await page.goto("/");
    await expect(page.locator('[data-testid="app-sidebar"]')).toBeVisible();

    for (const path of ["/agents", "/trunks", "/webhooks", "/costs", "/settings", "/calls", "/playground"]) {
      await page.goto(path);
      await expect(page.locator("body")).not.toContainText("Application error");
    }
  });
});
