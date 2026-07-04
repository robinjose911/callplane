import type { StubScenario } from "@callplane/contracts";
import type { CallRunner, OnTransition } from "./call-runner.js";

/**
 * Replays a scripted scenario's turns as timed CallEvents, then ends at the scenario's outcome.
 * `CALL_RUNNER=stub` only — Stage 3's RealCallRunner (LiveKit dial) implements the same
 * `CallRunner` interface behind an identical worker call site.
 *
 * Each outcome ends the lifecycle from the earliest stage the real telephony/provider stack
 * would actually reach it from (per CALL_STATUS_TRANSITIONS): `trunk_failure` never rings,
 * `busy`/`no_answer` never connect, only `completed`/`failed` reach IN_PROGRESS. Walking
 * unconditionally to IN_PROGRESS before checking outcome would attempt an illegal transition
 * (e.g. IN_PROGRESS -> BUSY isn't a valid edge) and throw mid-call.
 */
export class StubCallRunner implements CallRunner {
  async run(scenario: StubScenario | undefined, onTransition: OnTransition): Promise<void> {
    const outcome = scenario?.outcome ?? "completed";

    await onTransition({ status: "DIALING", eventType: "call_dialing" });

    if (outcome === "trunk_failure") {
      await onTransition({ status: "FAILED", eventType: "call_failed", payload: { outcome } });
      return;
    }

    await onTransition({ status: "RINGING", eventType: "call_ringing" });

    if (outcome === "busy") {
      await onTransition({ status: "BUSY", eventType: "call_failed", payload: { outcome } });
      return;
    }

    if (outcome === "no_answer") {
      await onTransition({ status: "NO_ANSWER", eventType: "call_failed", payload: { outcome } });
      return;
    }

    await onTransition({ status: "IN_PROGRESS", eventType: "call_in_progress" });

    if (scenario) {
      for (const turn of scenario.turns) {
        await onTransition({
          eventType: "transcript_turn",
          payload: { role: turn.role, text: turn.text, delayMs: turn.delayMs },
        });
      }
    }

    const finalStatus = outcome === "completed" ? "COMPLETED" : "FAILED";
    await onTransition({
      status: finalStatus,
      eventType: finalStatus === "COMPLETED" ? "call_completed" : "call_failed",
      ...(finalStatus !== "COMPLETED" ? { payload: { outcome } } : {}),
    });
  }
}
