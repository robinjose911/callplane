import type { StubScenario } from "@callplane/contracts";

export const STUB_SCENARIO_NAMES = {
  GREETING: "demo_greeting",
  BOOKING: "demo_booking",
  FAILURE: "demo_failure",
} as const;

/**
 * Scripted conversation fixtures. Stub scenarios are not database rows — they are static
 * data consumed by StubVoiceSession (Stage 3) and StubCallRunner (Stage 2), and asserted
 * against directly by every e2e spec. Exported here (not @callplane/contracts) because this
 * package is the single source of truth for fixture data, matching the seed's other fixtures.
 */
export const STUB_SCENARIOS: Record<string, StubScenario> = {
  [STUB_SCENARIO_NAMES.GREETING]: {
    name: STUB_SCENARIO_NAMES.GREETING,
    turns: [{ role: "agent", text: "Hi, thanks for calling callplane! How can I help today?", delayMs: 500 }],
    outcome: "completed",
    // Fixed, deterministic usage (Stage 9) — chosen so every mode's cost total is an exact,
    // hand-verifiable number of cents against PRICE_TABLE_FIXTURES's illustrative rates.
    usage: { s2sTokens: 1000, sttSeconds: 5, llmTokens: 500, ttsCharacters: 200 },
  },
  [STUB_SCENARIO_NAMES.BOOKING]: {
    name: STUB_SCENARIO_NAMES.BOOKING,
    turns: [
      { role: "agent", text: "Hi, thanks for calling! Would you like to book an appointment?", delayMs: 500 },
      { role: "user", text: "Yes, I'd like to book for next Monday.", delayMs: 1500 },
      { role: "agent", text: "Great, I've booked you in for Monday. Anything else?", delayMs: 800 },
      { role: "user", text: "No, that's all, thank you!", delayMs: 1200 },
      { role: "agent", text: "You're welcome, have a great day!", delayMs: 500 },
    ],
    outcome: "completed",
    toolCalls: [{ afterTurnIndex: 1, toolName: "check_calendar", arguments: { day: "Monday" } }],
    usage: { s2sTokens: 5000, sttSeconds: 20, llmTokens: 2500, ttsCharacters: 1000 },
  },
  [STUB_SCENARIO_NAMES.FAILURE]: {
    name: STUB_SCENARIO_NAMES.FAILURE,
    turns: [{ role: "agent", text: "Sorry, I'm having trouble connecting right now.", delayMs: 300 }],
    outcome: "failed",
    // No cost row is ever created for a non-completed call, so this usage is unreachable in
    // practice — present only because the field type is shared, not because it's meaningful here.
    usage: { s2sTokens: 0, sttSeconds: 0, llmTokens: 0, ttsCharacters: 0 },
  },
};
