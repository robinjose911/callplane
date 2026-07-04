import type { Call, RecordingRepository } from "@callplane/database";
import type { StubScenario } from "@callplane/contracts";
import type { StorageAdapter } from "./storage-adapter.js";
import { generateStubWavBuffer } from "./stub-wav.js";

export interface RecordCallStubDeps {
  storageAdapter: StorageAdapter;
  recordingRepo: RecordingRepository;
}

/**
 * Writes a deterministic stub recording for a completed call — gated on `RECORDING_MODE=stub`
 * (never on `NODE_ENV`, per CLAUDE.md: stubs are a product/demo feature, not test scaffolding).
 * Duration is derived from the scenario's own turn delays so it's still call-specific without
 * needing real audio (there's none to record — see `StubVoiceSession`). Idempotent: a call that
 * already has a `Recording` row (e.g. a redelivered job) is left alone rather than throwing on
 * the column's unique constraint.
 */
export async function recordCallStub(
  call: Call,
  scenario: StubScenario | undefined,
  deps: RecordCallStubDeps,
): Promise<void> {
  if (call.status !== "COMPLETED" || process.env["RECORDING_MODE"] !== "stub") return;

  const existing = await deps.recordingRepo.findByCallSid(call.callSid);
  if (existing) return;

  const durationSeconds = scenario
    ? Math.max(1, Math.round(scenario.turns.reduce((sum, turn) => sum + turn.delayMs, 0) / 1000))
    : 1;
  const wavBuffer = generateStubWavBuffer(durationSeconds);
  const storagePath = await deps.storageAdapter.put(`${call.callSid}.wav`, wavBuffer);

  await deps.recordingRepo.create({
    callSid: call.callSid,
    storagePath,
    durationSeconds,
    sizeBytes: BigInt(wavBuffer.length),
  });
}
