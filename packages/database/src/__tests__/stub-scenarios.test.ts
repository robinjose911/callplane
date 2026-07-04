import { describe, expect, it } from "vitest";
import { StubScenarioSchema } from "@callplane/contracts";
import { STUB_SCENARIO_NAMES, STUB_SCENARIOS } from "../fixtures/stub-scenarios.js";

describe("STUB_SCENARIOS fixtures", () => {
  it("every fixture satisfies StubScenarioSchema", () => {
    for (const scenario of Object.values(STUB_SCENARIOS)) {
      expect(() => StubScenarioSchema.parse(scenario)).not.toThrow();
    }
  });

  it("includes demo_greeting, demo_booking, demo_failure", () => {
    expect(Object.keys(STUB_SCENARIOS).sort()).toEqual(
      [STUB_SCENARIO_NAMES.GREETING, STUB_SCENARIO_NAMES.BOOKING, STUB_SCENARIO_NAMES.FAILURE].sort(),
    );
  });

  it("demo_failure ends in a failed outcome", () => {
    expect(STUB_SCENARIOS[STUB_SCENARIO_NAMES.FAILURE]?.outcome).toBe("failed");
  });

  it("demo_booking includes a tool call", () => {
    expect(STUB_SCENARIOS[STUB_SCENARIO_NAMES.BOOKING]?.toolCalls?.length).toBeGreaterThan(0);
  });
});
