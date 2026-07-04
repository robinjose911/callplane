import type { Call, CallEvent } from "@callplane/database";
import type { FailureReason, WebhookPayload } from "@callplane/contracts";
import { extractTranscript } from "./transcript-extractor.js";

const TERMINAL_FAILURE_STATUSES = new Set(["FAILED", "NO_ANSWER", "BUSY", "CALL_DROPPED"]);

function inferFailureReason(call: Call, events: CallEvent[]): FailureReason {
  if (call.status === "BUSY") return "busy";
  if (call.status === "NO_ANSWER") return "no_answer";
  if (call.status === "CALL_DROPPED") return "unknown";

  // FAILED — inspect the terminal event for a more specific reason than a bare status gives.
  const initiationFailure = events.find((e) => e.eventType === "call_initiation_failure");
  const initiationReason = (initiationFailure?.payload as { reason?: string } | null)?.reason;
  if (initiationReason === "trunk_unavailable") return "trunk_unavailable";

  if (events.some((e) => e.eventType === "call_failed")) return "provider_error";
  return "unknown";
}

/**
 * Maps a terminal `Call` + its `CallEvent` history to the webhook payload it should produce —
 * `undefined` for a non-terminal call (nothing to send yet). `COMPLETED` -> `post_call_transcription`
 * with the full transcript; every other terminal status -> `call_initiation_failure` with a
 * normalized `failure_reason` (never a raw provider error string, per contracts/webhooks.ts).
 */
export function mapCallOutcomeToWebhookPayload(call: Call, events: CallEvent[]): WebhookPayload | undefined {
  const eventTimestamp = Math.floor(call.updatedAt.getTime() / 1000);

  if (call.status === "COMPLETED") {
    return {
      type: "post_call_transcription",
      event_timestamp: eventTimestamp,
      data: {
        call_sid: call.callSid,
        status: "completed",
        transcript: extractTranscript(call, events),
      },
    };
  }

  if (TERMINAL_FAILURE_STATUSES.has(call.status)) {
    return {
      type: "call_initiation_failure",
      event_timestamp: eventTimestamp,
      data: {
        call_sid: call.callSid,
        failure_reason: inferFailureReason(call, events),
      },
    };
  }

  return undefined;
}
