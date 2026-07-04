import { Redis } from "ioredis";
import { expect, test } from "@playwright/test";
import { assertStubMode } from "./helpers/stub-probe.js";

const API_BASE_URL = process.env["API_BASE_URL"] ?? "http://localhost:4300";
const CALLPLANE_API_KEY = process.env["CALLPLANE_API_KEY"] ?? "e2e-test-key";
const REDIS_URL = process.env["REDIS_URL"] ?? "redis://localhost:6379";
const AUTH_HEADERS = { Authorization: `Bearer ${CALLPLANE_API_KEY}` };

test.beforeAll(async ({ request }) => {
  await assertStubMode(request, test);
});

async function pollUntilTerminal(
  request: import("@playwright/test").APIRequestContext,
  callSid: string,
  timeoutMs = 15000,
): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const response = await request.get(`${API_BASE_URL}/v1/calls/${callSid}`, { headers: AUTH_HEADERS });
    const body = await response.json();
    if (["COMPLETED", "FAILED", "NO_ANSWER", "BUSY", "CALL_DROPPED"].includes(body.status)) {
      return body.status;
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error(`Call ${callSid} did not reach a terminal status within ${timeoutMs}ms`);
}

test.describe("stage 2: call lifecycle", () => {
  test("a demo_greeting call completes with the full ordered lifecycle event trail", async ({ request }) => {
    const postResponse = await request.post(`${API_BASE_URL}/v1/calls`, {
      headers: AUTH_HEADERS,
      data: { agentId: "demo-cascade", channel: "browser", scenario: "demo_greeting" },
    });
    expect(postResponse.status()).toBe(200);
    const { callSid, status } = await postResponse.json();
    expect(status).toBe("QUEUED");

    const finalStatus = await pollUntilTerminal(request, callSid);
    expect(finalStatus).toBe("COMPLETED");

    const eventsResponse = await request.get(`${API_BASE_URL}/v1/calls/${callSid}/events?limit=100`, { headers: AUTH_HEADERS });
    const { events } = await eventsResponse.json();
    const eventTypes = events.map((e: { eventType: string }) => e.eventType);

    expect(eventTypes).toEqual([
      "call_queued",
      "call_dialing",
      "call_ringing",
      "call_in_progress",
      "transcript_turn",
      "call_completed",
    ]);
  });

  test("a demo_failure call ends FAILED with a failure event", async ({ request }) => {
    const postResponse = await request.post(`${API_BASE_URL}/v1/calls`, {
      headers: AUTH_HEADERS,
      data: { agentId: "demo-cascade", channel: "browser", scenario: "demo_failure" },
    });
    expect(postResponse.status()).toBe(200);
    const { callSid } = await postResponse.json();

    const finalStatus = await pollUntilTerminal(request, callSid);
    expect(finalStatus).toBe("FAILED");

    const eventsResponse = await request.get(`${API_BASE_URL}/v1/calls/${callSid}/events?limit=100`, { headers: AUTH_HEADERS });
    const { events } = await eventsResponse.json();
    expect(events.at(-1)).toMatchObject({ eventType: "call_failed" });
  });

  test("this spec's own call-executor job lands under the callplane: prefix, not bare", async ({ request }) => {
    // The shared Redis instance already holds many of the source project's own unprefixed BullMQ keys from its
    // production usage (call-scheduler, goal-notification, etc.) — asserting "zero unprefixed
    // keys exist anywhere" would be a false positive on someone else's legitimate data. Instead,
    // create a call here and confirm *this job's own key* is namespaced under "callplane:".
    const postResponse = await request.post(`${API_BASE_URL}/v1/calls`, {
      headers: AUTH_HEADERS,
      data: { agentId: "demo-cascade", channel: "browser", scenario: "demo_greeting" },
    });
    const { callSid } = await postResponse.json();

    const redis = new Redis(REDIS_URL);
    try {
      const prefixedKey = await redis.exists(`callplane:call-executor:${callSid}`);
      const bareKey = await redis.exists(`bull:call-executor:${callSid}`);
      expect(prefixedKey, "expected callplane:call-executor:<callSid> to exist").toBe(1);
      expect(bareKey, "expected no bare bull:call-executor:<callSid> key (would collide with NVA)").toBe(0);
    } finally {
      redis.disconnect();
    }
  });
});
