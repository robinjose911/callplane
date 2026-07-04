import { expect, test } from "@playwright/test";
import { assertStubMode } from "./helpers/stub-probe.js";
import { TestWebhookReceiver } from "./helpers/webhook-receiver.js";

const API_BASE_URL = process.env["API_BASE_URL"] ?? "http://localhost:4300";
const CALLPLANE_API_KEY = process.env["CALLPLANE_API_KEY"] ?? "e2e-test-key";
const AUTH_HEADERS = { Authorization: `Bearer ${CALLPLANE_API_KEY}` };
const WEBHOOK_RECEIVER_PORT = 4999;
const WEBHOOK_SECRET = "whsec_e2e_shared_secret";

const receiver = new TestWebhookReceiver(WEBHOOK_SECRET);
const createdEndpointNames: string[] = [];

test.beforeAll(async ({ request }) => {
  await assertStubMode(request, test);
  await receiver.start(WEBHOOK_RECEIVER_PORT);
});

test.afterAll(async ({ request }) => {
  await receiver.stop();
  // There's no DELETE /v1/webhook-endpoints route (by design — see the repo's CRUD surface), so
  // this can't remove the rows outright. Disabling them at least stops the dispatcher from
  // retrying against a receiver that's no longer running once this spec exits, which would
  // otherwise accumulate a growing backlog of doomed delayed retry jobs across repeated local runs.
  await Promise.all(
    createdEndpointNames.map((name) =>
      request.patch(`${API_BASE_URL}/v1/webhook-endpoints/${name}`, {
        headers: AUTH_HEADERS,
        data: { isEnabled: false },
      }),
    ),
  );
});

test.describe("stage 8: webhook outbox + ElevenLabs-compatible delivery + replay UI", () => {
  test("a completed call delivers a signature-valid post_call_transcription webhook, visible in the console", async ({
    page,
  }) => {
    const endpointName = `e2e-webhook-endpoint-${Date.now()}`;
    createdEndpointNames.push(endpointName);

    // Endpoint CRUD via the console UI.
    await page.goto("/webhooks");
    await page.waitForSelector('[data-testid="webhook-endpoints-table"]');
    await page.click('[data-testid="new-webhook-endpoint-button"]');
    await page.waitForSelector('[data-testid="new-webhook-endpoint-dialog"]');
    await page.fill('[data-testid="webhook-name-input"]', endpointName);
    await page.fill('[data-testid="webhook-url-input"]', `http://localhost:${WEBHOOK_RECEIVER_PORT}/webhook`);
    await page.fill('[data-testid="webhook-secret-input"]', WEBHOOK_SECRET);
    await page.click('[data-testid="new-webhook-endpoint-submit"]');
    await page.waitForSelector(`[data-testid="webhook-endpoint-row-${endpointName}"]`);

    // Newly created endpoints default to disabled — enable it so it actually receives deliveries.
    await page.click(`[data-testid="webhook-endpoint-enabled-${endpointName}"]`);
    await page.waitForTimeout(300);

    // Drive a call to completion (New call dialog, from Stage 7).
    await page.goto("/calls");
    await page.waitForSelector('[data-testid="calls-table"]');
    await page.click('[data-testid="new-call-button"]');
    await page.waitForSelector('[data-testid="new-call-dialog"]');
    await page.click('[data-testid="new-call-agent-select"]');
    await page.getByRole("option", { name: "demo-cascade", exact: true }).click();
    await page.fill('[data-testid="new-call-number"]', "+15550000000");
    await page.click('[data-testid="new-call-scenario-select"]');
    await page.getByRole("option", { name: "demo_greeting", exact: true }).click();
    await page.click('[data-testid="new-call-submit"]');
    await page.waitForURL(/\/calls\/[0-9a-f-]+$/);
    await expect(page.locator('[data-testid="call-detail-status"]')).toHaveText("COMPLETED", { timeout: 15000 });

    // The dispatcher worker should have delivered to the receiver by now.
    await expect.poll(() => receiver.received.length, { timeout: 15000 }).toBeGreaterThan(0);
    const delivery = receiver.received.at(-1)!;
    expect(delivery.signatureValid).toBe(true);
    expect(delivery.headers["x-idempotency-key"]).toBeTruthy();
    expect(delivery.body).toMatchObject({ type: "post_call_transcription", data: { status: "completed" } });

    // The console's call detail page reflects the delivery.
    await page.waitForSelector('[data-testid="webhook-deliveries"]', { timeout: 15000 });
    await expect(page.locator('[data-testid^="webhook-delivery-status-"]').first()).toHaveText("DELIVERED", {
      timeout: 15000,
    });
  });

  test("replaying an already-delivered entry re-sends it (console Replay button, not just a DEAD-only affordance)", async ({
    page,
    request,
  }) => {
    const endpointName = `e2e-webhook-endpoint-${Date.now()}`;
    createdEndpointNames.push(endpointName);
    const endpointRes = await request.post(`${API_BASE_URL}/v1/webhook-endpoints`, {
      headers: AUTH_HEADERS,
      data: {
        name: endpointName,
        url: `http://localhost:${WEBHOOK_RECEIVER_PORT}/webhook`,
        secret: WEBHOOK_SECRET,
        isEnabled: true,
        eventTypes: ["post_call_transcription"],
      },
    });
    const endpoint = await endpointRes.json();

    const callRes = await request.post(`${API_BASE_URL}/v1/calls`, {
      headers: AUTH_HEADERS,
      data: { agentId: "demo-cascade", channel: "sip", toNumber: "+15550000000", scenario: "demo_greeting" },
    });
    const { callSid } = await callRes.json();

    await expect
      .poll(
        async () => {
          const res = await request.get(`${API_BASE_URL}/v1/calls/${callSid}`, { headers: AUTH_HEADERS });
          return (await res.json()).status;
        },
        { timeout: 15000 },
      )
      .toBe("COMPLETED");

    const outboxRes = await request.get(`${API_BASE_URL}/v1/webhook-outbox?callSid=${callSid}`, { headers: AUTH_HEADERS });
    const { entries } = await outboxRes.json();
    const entry = entries.find((e: { webhookEndpointId: string }) => e.webhookEndpointId === endpoint.id);

    const receivedBeforeReplay = receiver.received.length;

    await page.goto(`/calls/${callSid}`);
    await page.waitForSelector(`[data-testid="webhook-replay-${entry.id}"]`);
    await page.click(`[data-testid="webhook-replay-${entry.id}"]`);

    await expect.poll(() => receiver.received.length, { timeout: 15000 }).toBeGreaterThan(receivedBeforeReplay);
    await expect(page.locator(`[data-testid="webhook-delivery-status-${entry.id}"]`)).toHaveText("DELIVERED", {
      timeout: 15000,
    });
  });
});
