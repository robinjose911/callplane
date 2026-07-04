import { expect, test } from "@playwright/test";
import { assertStubMode } from "./helpers/stub-probe.js";

const API_BASE_URL = process.env["API_BASE_URL"] ?? "http://localhost:4300";
const CALLPLANE_API_KEY = process.env["CALLPLANE_API_KEY"] ?? "e2e-test-key";
const AUTH_HEADERS = { Authorization: `Bearer ${CALLPLANE_API_KEY}` };

test.beforeAll(async ({ request }) => {
  await assertStubMode(request, test);
});

test.describe("stage 6: browser-call playground", () => {
  test("a full scripted conversation runs hands-free, and the DOM transcript matches the DB transcript 1:1", async ({
    page,
  }) => {
    await page.goto("/playground");
    await page.waitForSelector('[data-testid="playground"]');
    await expect(page.locator('[data-testid="stub-mode-badge"]')).toBeVisible();

    await page.click('[data-testid="playground-agent-select"]');
    await page.getByRole("option", { name: "demo-gemini-realtime", exact: true }).click();
    await page.click('[data-testid="playground-scenario-select"]');
    await page.getByRole("option", { name: "demo_booking", exact: true }).click();

    await page.click('[data-testid="start-call-button"]');
    await expect(page.locator('[data-testid="call-state"]')).toHaveText("connected", { timeout: 30000 });

    // Turn 0 — the agent's greeting — arrives on its own; no scripted-line click needed.
    await expect(page.locator('[data-testid="turn-0"]')).toHaveText(
      "agent: Hi, thanks for calling! Would you like to book an appointment?",
      { timeout: 15000 },
    );

    // Turn 1 is a scripted "user" turn — StubVoiceSession waits for the user_spoke data message.
    await page.click('[data-testid="stub-user-turn"]');
    await expect(page.locator('[data-testid="turn-1"]')).toHaveText("user: Yes, I'd like to book for next Monday.", {
      timeout: 15000,
    });

    await expect(page.locator('[data-testid="turn-2"]')).toHaveText(
      "agent: Great, I've booked you in for Monday. Anything else?",
      { timeout: 15000 },
    );

    await page.click('[data-testid="stub-user-turn"]');
    await expect(page.locator('[data-testid="turn-3"]')).toHaveText("user: No, that's all, thank you!", {
      timeout: 15000,
    });

    await expect(page.locator('[data-testid="turn-4"]')).toHaveText("agent: You're welcome, have a great day!", {
      timeout: 15000,
    });

    await expect(page.locator('[data-testid="call-state"]')).toHaveText("call ended", { timeout: 15000 });

    const domTurns = await page.locator('[data-testid^="turn-"]').allTextContents();

    // Cross-check the DOM transcript against the DB's CallEvent history — find the callSid via
    // the calls list (the playground doesn't expose it directly in the DOM).
    const callsResponse = await fetch(`${API_BASE_URL}/v1/calls?limit=1`, { headers: AUTH_HEADERS });
    const { calls } = (await callsResponse.json()) as { calls: Array<{ callSid: string; status: string }> };
    const latestCall = calls[0];
    expect(latestCall?.status).toBe("COMPLETED");

    const eventsResponse = await fetch(`${API_BASE_URL}/v1/calls/${latestCall!.callSid}/events`, {
      headers: AUTH_HEADERS,
    });
    const { events } = (await eventsResponse.json()) as {
      events: Array<{ eventType: string; payload: { role?: string; text?: string } | null }>;
    };
    const dbTurns = events
      .filter((e) => e.eventType === "transcript_turn")
      .map((e) => `${e.payload!.role}: ${e.payload!.text}`);

    expect(domTurns).toEqual(dbTurns);
  });
});
