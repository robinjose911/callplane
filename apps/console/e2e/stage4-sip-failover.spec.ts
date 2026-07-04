import { expect, test } from "@playwright/test";
import { assertStubMode } from "./helpers/stub-probe.js";

const API_BASE_URL = process.env["API_BASE_URL"] ?? "http://localhost:4300";
const CALLPLANE_API_KEY = process.env["CALLPLANE_API_KEY"] ?? "e2e-test-key";
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

async function setTrunkActive(
  request: import("@playwright/test").APIRequestContext,
  name: string,
  isActive: boolean,
): Promise<void> {
  const res = await request.patch(`${API_BASE_URL}/v1/trunks/${name}/status`, {
    headers: AUTH_HEADERS,
    data: { isActive },
  });
  expect(res.status()).toBe(200);
}

test.describe("stage 4: SIP trunk registry + failover (stub dialer)", () => {
  test.afterEach(async ({ request }) => {
    // Every test independently deactivates/reactivates trunks — always restore both to active so
    // later tests (and other spec files sharing this seeded data) see the seed's default state.
    await setTrunkActive(request, "stub-primary", true);
    await setTrunkActive(request, "stub-secondary", true);
  });

  test("a …0000 sip call completes normally via the primary trunk", async ({ request }) => {
    const postResponse = await request.post(`${API_BASE_URL}/v1/calls`, {
      headers: AUTH_HEADERS,
      data: { agentId: "demo-cascade", channel: "sip", toNumber: "+15550000000", scenario: "demo_greeting" },
    });
    expect(postResponse.status()).toBe(200);
    const { callSid } = await postResponse.json();

    const finalStatus = await pollUntilTerminal(request, callSid);
    expect(finalStatus).toBe("COMPLETED");

    const eventsResponse = await request.get(`${API_BASE_URL}/v1/calls/${callSid}/events?limit=100`, { headers: AUTH_HEADERS });
    const { events } = await eventsResponse.json();
    expect(events.map((e: { eventType: string }) => e.eventType)).toEqual([
      "call_queued",
      "call_dialing",
      "call_ringing",
      "call_in_progress",
      "transcript_turn",
      "call_completed",
    ]);
  });

  test("a …0003 sip call fails over from the primary trunk to the secondary, then completes", async ({ request }) => {
    const postResponse = await request.post(`${API_BASE_URL}/v1/calls`, {
      headers: AUTH_HEADERS,
      data: { agentId: "demo-cascade", channel: "sip", toNumber: "+15550000003", scenario: "demo_greeting" },
    });
    expect(postResponse.status()).toBe(200);
    const { callSid } = await postResponse.json();

    const finalStatus = await pollUntilTerminal(request, callSid);
    expect(finalStatus).toBe("COMPLETED");

    const eventsResponse = await request.get(`${API_BASE_URL}/v1/calls/${callSid}/events?limit=100`, { headers: AUTH_HEADERS });
    const { events } = await eventsResponse.json();
    const eventTypes = events.map((e: { eventType: string }) => e.eventType);

    const failoverIndex = eventTypes.indexOf("failover_triggered");
    expect(failoverIndex).toBeGreaterThan(-1);
    expect(eventTypes.slice(failoverIndex - 1)).toEqual([
      "call_dialing",
      "failover_triggered",
      "call_ringing",
      "call_in_progress",
      "transcript_turn",
      "call_completed",
    ]);

    const failoverEvent = events.find((e: { eventType: string }) => e.eventType === "failover_triggered");
    expect(failoverEvent.payload).toMatchObject({ failedTrunkId: expect.any(String) });
  });

  test("a …0001 sip call ends BUSY", async ({ request }) => {
    const postResponse = await request.post(`${API_BASE_URL}/v1/calls`, {
      headers: AUTH_HEADERS,
      data: { agentId: "demo-cascade", channel: "sip", toNumber: "+15550000001" },
    });
    const { callSid } = await postResponse.json();

    const finalStatus = await pollUntilTerminal(request, callSid);
    expect(finalStatus).toBe("BUSY");
  });

  test("a …0002 sip call ends NO_ANSWER", async ({ request }) => {
    const postResponse = await request.post(`${API_BASE_URL}/v1/calls`, {
      headers: AUTH_HEADERS,
      data: { agentId: "demo-cascade", channel: "sip", toNumber: "+15550000002" },
    });
    const { callSid } = await postResponse.json();

    const finalStatus = await pollUntilTerminal(request, callSid);
    expect(finalStatus).toBe("NO_ANSWER");
  });

  test("deactivating both trunks records a typed call_initiation_failure outcome", async ({ request }) => {
    await setTrunkActive(request, "stub-primary", false);
    await setTrunkActive(request, "stub-secondary", false);

    const postResponse = await request.post(`${API_BASE_URL}/v1/calls`, {
      headers: AUTH_HEADERS,
      data: { agentId: "demo-cascade", channel: "sip", toNumber: "+15550009999" },
    });
    expect(postResponse.status()).toBe(200);
    const { callSid } = await postResponse.json();

    const finalStatus = await pollUntilTerminal(request, callSid);
    expect(finalStatus).toBe("FAILED");

    const eventsResponse = await request.get(`${API_BASE_URL}/v1/calls/${callSid}/events?limit=100`, { headers: AUTH_HEADERS });
    const { events } = await eventsResponse.json();
    expect(events.at(-1)).toMatchObject({ eventType: "call_initiation_failure", payload: { reason: "trunk_unavailable" } });
  });
});
