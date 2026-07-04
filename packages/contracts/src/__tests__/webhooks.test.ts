import { describe, expect, it } from "vitest";
import {
  CallInitiationFailurePayloadSchema,
  PostCallTranscriptionPayloadSchema,
  WebhookPayloadSchema,
  buildWebhookIdempotencyKey,
} from "../webhooks.js";

const callSid = "123e4567-e89b-42d3-a456-426614174000";

describe("PostCallTranscriptionPayloadSchema", () => {
  it("accepts a valid completed-call payload", () => {
    const result = PostCallTranscriptionPayloadSchema.safeParse({
      type: "post_call_transcription",
      event_timestamp: 1735689600,
      data: {
        call_sid: callSid,
        status: "completed",
        transcript: [{ role: "agent", message: "Hello!", time_in_call_secs: 0 }],
      },
    });
    expect(result.success).toBe(true);
  });

  it("rejects a negative event_timestamp", () => {
    const result = PostCallTranscriptionPayloadSchema.safeParse({
      type: "post_call_transcription",
      event_timestamp: -1,
      data: { call_sid: callSid, status: "completed", transcript: [] },
    });
    expect(result.success).toBe(false);
  });
});

describe("CallInitiationFailurePayloadSchema", () => {
  it("accepts a valid failure payload", () => {
    const result = CallInitiationFailurePayloadSchema.safeParse({
      type: "call_initiation_failure",
      event_timestamp: 1735689600,
      data: { call_sid: callSid, failure_reason: "trunk_unavailable" },
    });
    expect(result.success).toBe(true);
  });

  it("rejects an unknown failure_reason", () => {
    const result = CallInitiationFailurePayloadSchema.safeParse({
      type: "call_initiation_failure",
      event_timestamp: 1735689600,
      data: { call_sid: callSid, failure_reason: "aliens" },
    });
    expect(result.success).toBe(false);
  });
});

describe("WebhookPayloadSchema", () => {
  it("discriminates between the two event types by `type`", () => {
    const failure = WebhookPayloadSchema.safeParse({
      type: "call_initiation_failure",
      event_timestamp: 1735689600,
      data: { call_sid: callSid, failure_reason: "busy" },
    });
    expect(failure.success).toBe(true);

    const completed = WebhookPayloadSchema.safeParse({
      type: "post_call_transcription",
      event_timestamp: 1735689600,
      data: { call_sid: callSid, status: "completed", transcript: [] },
    });
    expect(completed.success).toBe(true);
  });
});

describe("buildWebhookIdempotencyKey", () => {
  it("round-trips a stable key from callSid + eventType", () => {
    expect(buildWebhookIdempotencyKey(callSid, "post_call_transcription")).toBe(
      `${callSid}:post_call_transcription`,
    );
  });

  it("produces different keys for different event types on the same call", () => {
    const a = buildWebhookIdempotencyKey(callSid, "post_call_transcription");
    const b = buildWebhookIdempotencyKey(callSid, "call_initiation_failure");
    expect(a).not.toBe(b);
  });
});
