import type { CallStatus, StubScenario, StubScenarioOutcome } from "@callplane/contracts";

/**
 * One step of a call's execution. `status` is set only on a lifecycle transition — omit it for
 * an event that doesn't change status (e.g. a transcript turn while still IN_PROGRESS).
 */
export interface CallTransition {
  status?: CallStatus;
  eventType: string;
  payload?: Record<string, unknown>;
}

export type OnTransition = (transition: CallTransition) => Promise<void>;

/**
 * Pluggable call execution strategy. `StubCallRunner` (this stage) replays a scripted scenario;
 * Stage 3's `RealCallRunner` (LiveKit dial + real provider session) implements the same
 * interface so the worker never needs to know which one it's running.
 */
export interface CallRunner {
  run(scenario: StubScenario | undefined, onTransition: OnTransition): Promise<void>;
}

/**
 * The outcome->CallStatus decision tree shared by every stub-scenario runner (`StubCallRunner`,
 * `StubVoiceSession`). This is the ONLY place that decides which statuses are reachable from
 * which outcome (matching `CALL_STATUS_TRANSITIONS` in @callplane/contracts) — a runner must
 * never re-derive this mapping itself, since two independent copies silently drifting apart is
 * exactly the class of bug a prior review caught in `StubCallRunner` (see its own history).
 *
 * Callers apply each step via their own `onTransition` (plus any side effects, e.g. LiveKit
 * publish calls) in order, then only walk `scenario.turns` themselves when `walkTurns` is true.
 */
export function computeStubPreTurnSteps(outcome: StubScenarioOutcome): {
  steps: CallTransition[];
  walkTurns: boolean;
} {
  const dialing: CallTransition = { status: "DIALING", eventType: "call_dialing" };

  if (outcome === "trunk_failure") {
    return { steps: [dialing, { status: "FAILED", eventType: "call_failed", payload: { outcome } }], walkTurns: false };
  }

  const ringing: CallTransition = { status: "RINGING", eventType: "call_ringing" };

  if (outcome === "busy" || outcome === "no_answer") {
    const terminalStatus: CallStatus = outcome === "busy" ? "BUSY" : "NO_ANSWER";
    return {
      steps: [dialing, ringing, { status: terminalStatus, eventType: "call_failed", payload: { outcome } }],
      walkTurns: false,
    };
  }

  return { steps: [dialing, ringing, { status: "IN_PROGRESS", eventType: "call_in_progress" }], walkTurns: true };
}

/** The final transition once any turns have been walked (or skipped, for a non-`walkTurns` outcome). */
export function computeStubFinalStep(outcome: StubScenarioOutcome): CallTransition {
  const finalStatus: CallStatus = outcome === "completed" ? "COMPLETED" : "FAILED";
  return {
    status: finalStatus,
    eventType: finalStatus === "COMPLETED" ? "call_completed" : "call_failed",
    ...(finalStatus !== "COMPLETED" ? { payload: { outcome } } : {}),
  };
}
