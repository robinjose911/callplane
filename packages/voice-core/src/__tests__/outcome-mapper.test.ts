import { describe, expect, it } from "vitest";
import type { Call, CallEvent } from "@callplane/database";
import { mapCallOutcomeToWebhookPayload } from "../lib/outcome-mapper.js";

function call(overrides: Partial<Call> = {}): Call {
  return {
    id: "row-1",
    callSid: "call-1",
    agentId: "demo-cascade",
    channel: "sip",
    toNumber: "+14155551234",
    status: "COMPLETED",
    scenario: null,
    dynamicVariables: null,
    idempotencyKey: null,
    createdAt: new Date("2026-07-04T00:00:00.000Z"),
    updatedAt: new Date("2026-07-04T00:00:10.000Z"),
    ...overrides,
  } as Call;
}

function event(eventType: string, payload: Record<string, unknown> | null = null, offsetMs = 0): CallEvent {
  return {
    id: eventType,
    callSid: "call-1",
    eventType,
    payload,
    createdAt: new Date(new Date("2026-07-04T00:00:00.000Z").getTime() + offsetMs),
  } as CallEvent;
}

describe("mapCallOutcomeToWebhookPayload", () => {
  it("returns undefined for a non-terminal call", () => {
    expect(mapCallOutcomeToWebhookPayload(call({ status: "IN_PROGRESS" }), [])).toBeUndefined();
  });

  it("maps COMPLETED to post_call_transcription with the extracted transcript", () => {
    const events = [
      event("transcript_turn", { role: "agent", text: "Hi" }, 1000),
      event("transcript_turn", { role: "user", text: "Hello" }, 2500),
    ];
    const payload = mapCallOutcomeToWebhookPayload(call({ status: "COMPLETED" }), events);

    expect(payload).toMatchObject({
      type: "post_call_transcription",
      data: {
        call_sid: "call-1",
        status: "completed",
        transcript: [
          { role: "agent", message: "Hi", time_in_call_secs: 1 },
          { role: "user", message: "Hello", time_in_call_secs: 2 },
        ],
      },
    });
  });

  it("maps BUSY to call_initiation_failure with failure_reason busy", () => {
    const payload = mapCallOutcomeToWebhookPayload(call({ status: "BUSY" }), []);
    expect(payload).toMatchObject({ type: "call_initiation_failure", data: { failure_reason: "busy" } });
  });

  it("maps NO_ANSWER to call_initiation_failure with failure_reason no_answer", () => {
    const payload = mapCallOutcomeToWebhookPayload(call({ status: "NO_ANSWER" }), []);
    expect(payload).toMatchObject({ type: "call_initiation_failure", data: { failure_reason: "no_answer" } });
  });

  it("maps FAILED with a trunk_unavailable call_initiation_failure event to that specific reason", () => {
    const events = [event("call_initiation_failure", { reason: "trunk_unavailable" })];
    const payload = mapCallOutcomeToWebhookPayload(call({ status: "FAILED" }), events);
    expect(payload).toMatchObject({ type: "call_initiation_failure", data: { failure_reason: "trunk_unavailable" } });
  });

  it("maps a generic FAILED (call_failed event, no specific reason) to provider_error", () => {
    const events = [event("call_failed", { error: "boom" })];
    const payload = mapCallOutcomeToWebhookPayload(call({ status: "FAILED" }), events);
    expect(payload).toMatchObject({ type: "call_initiation_failure", data: { failure_reason: "provider_error" } });
  });

  it("maps CALL_DROPPED to failure_reason unknown", () => {
    const payload = mapCallOutcomeToWebhookPayload(call({ status: "CALL_DROPPED" }), []);
    expect(payload).toMatchObject({ type: "call_initiation_failure", data: { failure_reason: "unknown" } });
  });
});
