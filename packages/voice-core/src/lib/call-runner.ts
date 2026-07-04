import type { CallStatus, StubScenario } from "@callplane/contracts";

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
