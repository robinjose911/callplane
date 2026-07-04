import { describe, expect, it, vi } from "vitest";
import type { CallStatus, StubScenario, StubScenarioOutcome } from "@callplane/contracts";
import { isValidStatusTransition } from "@callplane/contracts";
import { StubCallRunner } from "../lib/stub-call-runner.js";
import type { CallTransition } from "../lib/call-runner.js";

const greeting: StubScenario = {
  name: "demo_greeting",
  turns: [{ role: "agent", text: "Hi!", delayMs: 100 }],
  outcome: "completed",
};

const failure: StubScenario = {
  name: "demo_failure",
  turns: [{ role: "agent", text: "Sorry, error.", delayMs: 50 }],
  outcome: "failed",
};

function scenarioWithOutcome(outcome: StubScenarioOutcome): StubScenario {
  return { name: `demo_${outcome}`, turns: [{ role: "agent", text: "...", delayMs: 10 }], outcome };
}

describe("StubCallRunner", () => {
  it("walks the full lifecycle for a completed scenario, in order", async () => {
    const transitions: CallTransition[] = [];
    const onTransition = vi.fn(async (t: CallTransition) => {
      transitions.push(t);
    });

    await new StubCallRunner().run(greeting, onTransition);

    expect(transitions.map((t) => t.status ?? null)).toEqual([
      "DIALING",
      "RINGING",
      "IN_PROGRESS",
      null, // transcript_turn — no status change
      "COMPLETED",
    ]);
    expect(transitions.map((t) => t.eventType)).toEqual([
      "call_dialing",
      "call_ringing",
      "call_in_progress",
      "transcript_turn",
      "call_completed",
    ]);
  });

  it("emits one transcript_turn event per scenario turn with role/text/delayMs", async () => {
    const transitions: CallTransition[] = [];
    await new StubCallRunner().run(greeting, async (t) => {
      transitions.push(t);
    });

    const turnEvent = transitions.find((t) => t.eventType === "transcript_turn");
    expect(turnEvent?.payload).toEqual({ role: "agent", text: "Hi!", delayMs: 100 });
  });

  it("ends FAILED for a failed-outcome scenario", async () => {
    const transitions: CallTransition[] = [];
    await new StubCallRunner().run(failure, async (t) => {
      transitions.push(t);
    });

    const last = transitions.at(-1);
    expect(last).toMatchObject({ status: "FAILED", eventType: "call_failed" });
  });

  it("with no scenario, still walks dial->ring->in_progress->completed with no turns", async () => {
    const transitions: CallTransition[] = [];
    await new StubCallRunner().run(undefined, async (t) => {
      transitions.push(t);
    });

    expect(transitions).toHaveLength(4);
    expect(transitions.at(-1)).toMatchObject({ status: "COMPLETED" });
  });

  it.each(["busy", "no_answer", "trunk_failure"] as const)(
    "ends %s without ever reaching IN_PROGRESS (never connected)",
    async (outcome) => {
      const transitions: CallTransition[] = [];
      await new StubCallRunner().run(scenarioWithOutcome(outcome), async (t) => {
        transitions.push(t);
      });

      expect(transitions.map((t) => t.status).filter(Boolean)).not.toContain("IN_PROGRESS");
      expect(transitions.some((t) => t.eventType === "transcript_turn")).toBe(false);
    },
  );

  it.each(["completed", "failed", "busy", "no_answer", "trunk_failure"] as const)(
    "every emitted status transition for outcome=%s is a legal CALL_STATUS_TRANSITIONS edge",
    async (outcome) => {
      const transitions: CallTransition[] = [];
      await new StubCallRunner().run(scenarioWithOutcome(outcome), async (t) => {
        transitions.push(t);
      });

      let current: CallStatus = "QUEUED";
      for (const t of transitions) {
        if (t.status === undefined || t.status === current) continue;
        expect(
          isValidStatusTransition(current, t.status),
          `${current} -> ${t.status} should be a legal transition`,
        ).toBe(true);
        current = t.status;
      }
    },
  );
});
