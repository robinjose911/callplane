import { z } from "zod";

/**
 * A scripted conversation fixture. `StubVoiceSession` (Stage 3) replays these turns as timed
 * LiveKit transcription events; `StubCallRunner` (Stage 2) walks the lifecycle to `outcome`.
 * This is a *contract*, not an internal detail — the API (accepts `scenario` by name), the
 * worker (replays it), and every e2e spec (asserts against its exact turns) all consume it.
 */
export const StubScenarioTurnSchema = z.object({
  role: z.enum(["agent", "user"]),
  text: z.string().min(1),
  delayMs: z.number().int().min(0),
});

export type StubScenarioTurn = z.infer<typeof StubScenarioTurnSchema>;

/** Terminal outcome a scenario ends in — drives the call's final status. */
export const StubScenarioOutcomeSchema = z.enum([
  "completed",
  "failed",
  "busy",
  "no_answer",
  "trunk_failure",
]);

export type StubScenarioOutcome = z.infer<typeof StubScenarioOutcomeSchema>;

/** Optional tool-call turn — the agent invokes a named tool mid-conversation. */
export const StubScenarioToolCallSchema = z.object({
  afterTurnIndex: z.number().int().min(0),
  toolName: z.string().min(1),
  arguments: z.record(z.string(), z.unknown()),
});

export type StubScenarioToolCall = z.infer<typeof StubScenarioToolCallSchema>;

export const StubScenarioSchema = z.object({
  name: z.string().min(1),
  turns: z.array(StubScenarioTurnSchema).min(1),
  outcome: StubScenarioOutcomeSchema,
  toolCalls: z.array(StubScenarioToolCallSchema).optional(),
});

export type StubScenario = z.infer<typeof StubScenarioSchema>;
