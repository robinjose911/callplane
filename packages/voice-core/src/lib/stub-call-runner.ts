import type { CallStatus, StubScenario, StubScenarioOutcome } from "@callplane/contracts";
import type { CallRunner, OnTransition } from "./call-runner.js";

const OUTCOME_TO_STATUS: Record<StubScenarioOutcome, CallStatus> = {
  completed: "COMPLETED",
  failed: "FAILED",
  busy: "BUSY",
  no_answer: "NO_ANSWER",
  trunk_failure: "FAILED",
};

/**
 * Replays a scripted scenario's turns as timed CallEvents, then ends at the scenario's outcome.
 * `CALL_RUNNER=stub` only — Stage 3's RealCallRunner (LiveKit dial) implements the same
 * `CallRunner` interface behind an identical worker call site.
 */
export class StubCallRunner implements CallRunner {
  async run(scenario: StubScenario | undefined, onTransition: OnTransition): Promise<void> {
    await onTransition({ status: "DIALING", eventType: "call_dialing" });
    await onTransition({ status: "RINGING", eventType: "call_ringing" });
    await onTransition({ status: "IN_PROGRESS", eventType: "call_in_progress" });

    if (scenario) {
      for (const turn of scenario.turns) {
        await onTransition({
          eventType: "transcript_turn",
          payload: { role: turn.role, text: turn.text, delayMs: turn.delayMs },
        });
      }
    }

    const outcome = scenario?.outcome ?? "completed";
    const finalStatus = OUTCOME_TO_STATUS[outcome];
    await onTransition({
      status: finalStatus,
      eventType: finalStatus === "COMPLETED" ? "call_completed" : "call_failed",
      ...(finalStatus !== "COMPLETED" ? { payload: { outcome } } : {}),
    });
  }
}
