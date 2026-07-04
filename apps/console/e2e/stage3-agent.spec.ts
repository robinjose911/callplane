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

/**
 * This spec requires the worker to run with CALL_RUNNER=livekit (routes through a real LiveKit
 * room + StubVoiceSession, not the in-process StubCallRunner) — see playwright.config.ts's
 * stubEnv. Without it, these assertions would trivially pass against Stage 2's StubCallRunner and
 * prove nothing about the actual LiveKit integration this stage adds.
 */
test.describe("stage 3: agent session (real LiveKit room + StubVoiceSession)", () => {
  test("a demo-gemini-realtime call (a real-provider config) completes via the stub override, with the scenario's exact transcript", async ({
    request,
  }) => {
    const postResponse = await request.post(`${API_BASE_URL}/v1/calls`, {
      headers: AUTH_HEADERS,
      data: { agentId: "demo-gemini-realtime", channel: "browser", scenario: "demo_greeting" },
    });
    expect(postResponse.status()).toBe(200);
    const { callSid } = await postResponse.json();

    const finalStatus = await pollUntilTerminal(request, callSid);
    expect(finalStatus).toBe("COMPLETED");

    const eventsResponse = await request.get(`${API_BASE_URL}/v1/calls/${callSid}/events?limit=100`, {
      headers: AUTH_HEADERS,
    });
    const { events } = await eventsResponse.json();
    const transcriptTurns = events.filter((e: { eventType: string }) => e.eventType === "transcript_turn");

    expect(transcriptTurns).toHaveLength(1);
    expect(transcriptTurns[0].payload).toMatchObject({
      role: "agent",
      text: "Hi, thanks for calling callplane! How can I help today?",
    });
  });

  test("a demo-cascade call (a different mode/provider path) completes the same scenario identically", async ({
    request,
  }) => {
    const postResponse = await request.post(`${API_BASE_URL}/v1/calls`, {
      headers: AUTH_HEADERS,
      data: { agentId: "demo-cascade", channel: "browser", scenario: "demo_greeting" },
    });
    expect(postResponse.status()).toBe(200);
    const { callSid } = await postResponse.json();

    const finalStatus = await pollUntilTerminal(request, callSid);
    expect(finalStatus).toBe("COMPLETED");

    const eventsResponse = await request.get(`${API_BASE_URL}/v1/calls/${callSid}/events?limit=100`, {
      headers: AUTH_HEADERS,
    });
    const { events } = await eventsResponse.json();
    const eventTypes = events.map((e: { eventType: string }) => e.eventType);

    expect(eventTypes).toEqual(["call_queued", "call_dialing", "call_ringing", "call_in_progress", "transcript_turn", "call_completed"]);
  });

  test("a multi-turn demo_booking scenario preserves exact turn order and role attribution", async ({ request }) => {
    const postResponse = await request.post(`${API_BASE_URL}/v1/calls`, {
      headers: AUTH_HEADERS,
      data: { agentId: "demo-cascade", channel: "browser", scenario: "demo_booking" },
    });
    const { callSid } = await postResponse.json();

    const finalStatus = await pollUntilTerminal(request, callSid);
    expect(finalStatus).toBe("COMPLETED");

    const eventsResponse = await request.get(`${API_BASE_URL}/v1/calls/${callSid}/events?limit=100`, {
      headers: AUTH_HEADERS,
    });
    const { events } = await eventsResponse.json();
    const turns = events
      .filter((e: { eventType: string }) => e.eventType === "transcript_turn")
      .map((e: { payload: { role: string; text: string } }) => e.payload);

    expect(turns).toEqual([
      { role: "agent", text: "Hi, thanks for calling! Would you like to book an appointment?", delayMs: 500 },
      { role: "user", text: "Yes, I'd like to book for next Monday.", delayMs: 1500 },
      { role: "agent", text: "Great, I've booked you in for Monday. Anything else?", delayMs: 800 },
      { role: "user", text: "No, that's all, thank you!", delayMs: 1200 },
      { role: "agent", text: "You're welcome, have a great day!", delayMs: 500 },
    ]);
  });
});
