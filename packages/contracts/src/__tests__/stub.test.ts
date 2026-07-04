import { describe, expect, it } from "vitest";
import { StubScenarioSchema } from "../stub.js";

describe("StubScenarioSchema", () => {
  it("round-trips a minimal greeting scenario", () => {
    const scenario = {
      name: "demo_greeting",
      turns: [{ role: "agent", text: "Hi, thanks for calling!", delayMs: 500 }],
      outcome: "completed",
    };

    const parsed = StubScenarioSchema.parse(scenario);
    expect(parsed).toEqual(scenario);
  });

  it("round-trips a multi-turn scenario with a tool call", () => {
    const scenario = {
      name: "demo_booking",
      turns: [
        { role: "agent", text: "Hi, how can I help?", delayMs: 300 },
        { role: "user", text: "I'd like to book an appointment.", delayMs: 1200 },
        { role: "agent", text: "Let me check the calendar.", delayMs: 400 },
      ],
      outcome: "completed",
      toolCalls: [{ afterTurnIndex: 1, toolName: "check_calendar", arguments: { day: "Monday" } }],
    };

    const parsed = StubScenarioSchema.parse(scenario);
    expect(parsed).toEqual(scenario);
  });

  it("rejects an empty turns array", () => {
    const result = StubScenarioSchema.safeParse({
      name: "demo_empty",
      turns: [],
      outcome: "completed",
    });
    expect(result.success).toBe(false);
  });

  it("rejects an unknown outcome", () => {
    const result = StubScenarioSchema.safeParse({
      name: "demo_failure",
      turns: [{ role: "agent", text: "Sorry, error.", delayMs: 100 }],
      outcome: "spontaneous_combustion",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a turn with a negative delayMs", () => {
    const result = StubScenarioSchema.safeParse({
      name: "demo_bad_delay",
      turns: [{ role: "agent", text: "Hi", delayMs: -1 }],
      outcome: "completed",
    });
    expect(result.success).toBe(false);
  });
});
