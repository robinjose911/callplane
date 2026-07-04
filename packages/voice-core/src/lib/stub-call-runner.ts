import type { StubScenario } from "@callplane/contracts";
import { computeStubFinalStep, computeStubPreTurnSteps, type CallRunner, type OnTransition } from "./call-runner.js";

/**
 * Replays a scripted scenario's turns as timed CallEvents, then ends at the scenario's outcome.
 * `CALL_RUNNER=stub` only — Stage 3's RealCallRunner (LiveKit dial) implements the same
 * `CallRunner` interface behind an identical worker call site.
 *
 * The outcome->status decision tree lives in `computeStubPreTurnSteps`/`computeStubFinalStep`
 * (call-runner.ts), shared with `StubVoiceSession` — this class only walks turns and applies
 * each step via `onTransition`, with no transition-legality logic of its own.
 */
export class StubCallRunner implements CallRunner {
  async run(scenario: StubScenario | undefined, onTransition: OnTransition): Promise<void> {
    const outcome = scenario?.outcome ?? "completed";
    const { steps, walkTurns } = computeStubPreTurnSteps(outcome);

    for (const step of steps) {
      await onTransition(step);
    }

    if (!walkTurns) return;

    if (scenario) {
      for (const turn of scenario.turns) {
        await onTransition({
          eventType: "transcript_turn",
          payload: { role: turn.role, text: turn.text, delayMs: turn.delayMs },
        });
      }
    }

    await onTransition(computeStubFinalStep(outcome));
  }
}
