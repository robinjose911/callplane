import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Call } from "@callplane/database";
import type { StubScenario } from "@callplane/contracts";
import { recordCallStub } from "../lib/record-call-stub.js";

function call(overrides: Partial<Call> = {}): Call {
  return {
    id: "row-1",
    callSid: "call-1",
    agentId: "demo-cascade",
    channel: "sip",
    toNumber: null,
    status: "COMPLETED",
    scenario: "demo_greeting",
    dynamicVariables: null,
    idempotencyKey: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as Call;
}

function scenario(turns: { delayMs: number }[] = [{ role: "agent", text: "x", delayMs: 2000 }] as never): StubScenario {
  return { name: "demo_greeting", turns: turns as StubScenario["turns"], outcome: "completed" };
}

function deps() {
  const storageAdapter = { put: vi.fn().mockResolvedValue("/data/recordings/call-1.wav"), getStream: vi.fn(), delete: vi.fn() };
  const recordingRepo = { create: vi.fn().mockResolvedValue(undefined), findByCallSid: vi.fn().mockResolvedValue(null) };
  return { storageAdapter, recordingRepo };
}

describe("recordCallStub", () => {
  const originalRecordingMode = process.env["RECORDING_MODE"];

  beforeEach(() => {
    process.env["RECORDING_MODE"] = "stub";
  });

  afterEach(() => {
    if (originalRecordingMode === undefined) delete process.env["RECORDING_MODE"];
    else process.env["RECORDING_MODE"] = originalRecordingMode;
  });

  it("does nothing for a non-COMPLETED call", async () => {
    const d = deps();
    await recordCallStub(call({ status: "FAILED" }), scenario(), d);
    expect(d.storageAdapter.put).not.toHaveBeenCalled();
  });

  it("does nothing when RECORDING_MODE is not \"stub\"", async () => {
    delete process.env["RECORDING_MODE"];
    const d = deps();
    await recordCallStub(call(), scenario(), d);
    expect(d.storageAdapter.put).not.toHaveBeenCalled();
  });

  it("writes a WAV and creates a Recording row with a duration derived from the scenario", async () => {
    const d = deps();
    await recordCallStub(call(), scenario([{ delayMs: 2000 }, { delayMs: 3000 }] as never), d);

    expect(d.storageAdapter.put).toHaveBeenCalledWith("call-1.wav", expect.any(Buffer));
    expect(d.recordingRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ callSid: "call-1", storagePath: "/data/recordings/call-1.wav", durationSeconds: 5 }),
    );
  });

  it("is idempotent — does not create a second Recording row if one already exists", async () => {
    const d = deps();
    d.recordingRepo.findByCallSid.mockResolvedValue({ id: "existing" });
    await recordCallStub(call(), scenario(), d);
    expect(d.storageAdapter.put).not.toHaveBeenCalled();
    expect(d.recordingRepo.create).not.toHaveBeenCalled();
  });

  it("defaults to a 1-second recording when there's no scenario at all", async () => {
    const d = deps();
    await recordCallStub(call(), undefined, d);
    expect(d.recordingRepo.create).toHaveBeenCalledWith(expect.objectContaining({ durationSeconds: 1 }));
  });
});
