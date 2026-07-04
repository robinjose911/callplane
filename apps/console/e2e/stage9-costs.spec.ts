import { expect, test } from "@playwright/test";
import { assertStubMode } from "./helpers/stub-probe.js";

const API_BASE_URL = process.env["API_BASE_URL"] ?? "http://localhost:4300";
const CALLPLANE_API_KEY = process.env["CALLPLANE_API_KEY"] ?? "e2e-test-key";
const AUTH_HEADERS = { Authorization: `Bearer ${CALLPLANE_API_KEY}` };

test.beforeAll(async ({ request }) => {
  await assertStubMode(request, test);
});

async function startCallAndWaitForCompletion(
  page: import("@playwright/test").Page,
  agentName: string,
  scenarioName: string,
  toNumber: string,
) {
  await page.goto("/calls");
  await page.waitForSelector('[data-testid="calls-table"]');

  await page.click('[data-testid="new-call-button"]');
  await page.waitForSelector('[data-testid="new-call-dialog"]');
  await page.click('[data-testid="new-call-agent-select"]');
  await page.getByRole("option", { name: agentName, exact: true }).click();
  await page.fill('[data-testid="new-call-number"]', toNumber);
  await page.click('[data-testid="new-call-scenario-select"]');
  await page.getByRole("option", { name: scenarioName, exact: true }).click();
  await page.click('[data-testid="new-call-submit"]');

  await page.waitForURL(/\/calls\/[0-9a-f-]+$/);
  await page.waitForSelector('[data-testid="call-detail-page"]');
  await expect(page.locator('[data-testid="call-detail-status"]')).toHaveText("COMPLETED", { timeout: 15000 });

  const url = page.url();
  return url.split("/calls/")[1]!;
}

test.describe("stage 9: cost metering + recording + costs/settings UI", () => {
  test("a completed demo-cascade call shows an exact, hand-verifiable cost total and a loadable recording", async ({
    page,
    request,
  }) => {
    const callSid = await startCallAndWaitForCompletion(page, "demo-cascade", "demo_booking", "+15550000010");

    // demo_booking usage (sttSeconds:20, llmTokens:2500, ttsCharacters:1000) against the seeded
    // PriceTable (deepgram stt 0.0043/sec, openai llm 0.000003/token, elevenlabs tts 0.00003/char):
    // 20*0.0043 + 2500*0.000003 + 1000*0.00003 = 0.086 + 0.0075 + 0.03 = 0.1235
    await expect(page.locator('[data-testid="call-cost-card"]')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('[data-testid="call-cost-total"]')).toHaveText("$0.123500");
    await expect(page.locator('[data-testid="call-cost-leg-stt"]')).toBeVisible();
    await expect(page.locator('[data-testid="call-cost-leg-llm"]')).toBeVisible();
    await expect(page.locator('[data-testid="call-cost-leg-tts"]')).toBeVisible();

    // The recording is a real artifact behind the API's streaming route, not just a UI stub.
    await expect(page.locator('[data-testid="call-recording-player"]')).toBeVisible();
    const recordingResponse = await request.get(`${API_BASE_URL}/v1/calls/${callSid}/recording`, {
      headers: AUTH_HEADERS,
    });
    expect(recordingResponse.status()).toBe(200);
    expect(recordingResponse.headers()["content-type"]).toContain("audio/wav");
  });

  test("a completed demo-cascade-cartesia call metering uses cartesia's rate, and both calls surface on /costs", async ({
    page,
  }) => {
    // Same STT/LLM usage, different TTS provider/rate — proves the leg-by-leg formula, not just
    // "some number showed up": 20*0.0043 + 2500*0.000003 + 1000*0.00002 = 0.1135
    await startCallAndWaitForCompletion(page, "demo-cascade-cartesia", "demo_booking", "+15550000011");
    await expect(page.locator('[data-testid="call-cost-total"]')).toHaveText("$0.113500");
    await expect(page.locator('[data-testid="call-cost-leg-tts"]')).toBeVisible();

    await page.goto("/costs");
    await page.waitForSelector('[data-testid="costs-page"]');
    await expect(page.locator('[data-testid="costs-chart"]')).toBeVisible();
    const total = await page.locator('[data-testid="costs-total"]').textContent();
    expect(Number(total?.replace("$", ""))).toBeGreaterThan(0);
  });

  test("editing a price in /settings changes the cost metered for a subsequent call (D6 proof)", async ({
    page,
    request,
  }) => {
    // Bump elevenlabs's tts rate to a distinctive value, run a demo-cascade call, confirm the new
    // rate — not the seeded default — is what got metered. Restore the original rate afterward so
    // this test doesn't leave the shared seed data mutated for other specs/runs.
    const ORIGINAL_RATE = 0.00003;
    const NEW_RATE = 0.0001;

    await page.goto("/settings");
    await page.waitForSelector('[data-testid="settings-page"]');
    const input = page.locator('[data-testid="price-input-elevenlabs-tts"]');
    await input.fill(String(NEW_RATE));
    await page.click('[data-testid="price-save-elevenlabs-tts"]');
    await expect(input).toHaveValue(String(NEW_RATE));

    try {
      const callSid = await startCallAndWaitForCompletion(page, "demo-cascade", "demo_greeting", "+15550000012");
      // demo_greeting usage (sttSeconds:5, llmTokens:500, ttsCharacters:200):
      // 5*0.0043 + 500*0.000003 + 200*0.0001 = 0.0215 + 0.0015 + 0.02 = 0.043
      await expect(page.locator('[data-testid="call-cost-total"]')).toHaveText("$0.043000");
      expect(callSid).toBeTruthy();
    } finally {
      await request.post(`${API_BASE_URL}/v1/price-table`, {
        headers: AUTH_HEADERS,
        data: { provider: "elevenlabs", providerType: "tts", unitType: "characters", pricePerUnit: ORIGINAL_RATE },
      });
    }
  });
});
