import { z } from "zod";

/**
 * Call lifecycle: QUEUED → DIALING → RINGING → IN_PROGRESS → COMPLETED
 *                                                            → FAILED
 *                                            → NO_ANSWER
 *                                            → BUSY
 *                                → CALL_DROPPED (mid-call disconnect)
 */
export const CallStatusSchema = z.enum([
  "QUEUED",
  "DIALING",
  "RINGING",
  "IN_PROGRESS",
  "COMPLETED",
  "FAILED",
  "NO_ANSWER",
  "BUSY",
  "CALL_DROPPED",
]);

export type CallStatus = z.infer<typeof CallStatusSchema>;

/** Terminal states — no further transitions allowed. */
export const TERMINAL_CALL_STATUSES: readonly CallStatus[] = [
  "COMPLETED",
  "FAILED",
  "NO_ANSWER",
  "BUSY",
  "CALL_DROPPED",
];

/** Valid state transitions. */
export const CALL_STATUS_TRANSITIONS: Record<CallStatus, CallStatus[]> = {
  QUEUED: ["DIALING", "FAILED"],
  DIALING: ["RINGING", "FAILED", "NO_ANSWER", "BUSY"],
  RINGING: ["IN_PROGRESS", "NO_ANSWER", "BUSY", "FAILED"],
  IN_PROGRESS: ["COMPLETED", "FAILED", "CALL_DROPPED"],
  COMPLETED: [],
  FAILED: [],
  NO_ANSWER: [],
  BUSY: [],
  CALL_DROPPED: [],
};

/** Returns true if a transition from `from` to `to` is valid. */
export function isValidStatusTransition(from: CallStatus, to: CallStatus): boolean {
  return CALL_STATUS_TRANSITIONS[from].includes(to);
}

/**
 * Normalized failure reasons emitted in webhook payloads.
 * A controlled vocabulary — never leak raw provider error strings.
 */
export const FailureReasonSchema = z.enum([
  "busy",
  "no_answer",
  "rejected",
  "provider_error",
  "trunk_unavailable",
  "timeout",
  "no_speech",
  "unknown",
]);

export type FailureReason = z.infer<typeof FailureReasonSchema>;
