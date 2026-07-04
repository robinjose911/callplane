import { describe, expect, it, vi } from "vitest";
import type { Call } from "@callplane/database";
import { meterCallCost, type MeterCallCostDeps } from "../lib/meter-call-cost.js";

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

const usage = { s2sTokens: 1000, sttSeconds: 5, llmTokens: 500, ttsCharacters: 200 };

function deps(overrides: Partial<{ agentConfig: Record<string, unknown> | null; priceRows: unknown[] }> = {}) {
  const callCostRepo = { create: vi.fn().mockResolvedValue(undefined) };
  const callEventRepo = { append: vi.fn().mockResolvedValue(undefined) };
  const agentConfigRepo = {
    findByName: vi.fn().mockResolvedValue(
      overrides.agentConfig !== undefined
        ? overrides.agentConfig
        : { voiceMode: "cascade", s2sProvider: null, sttProvider: "deepgram", llmProvider: "openai", ttsProvider: "elevenlabs" },
    ),
  };
  const priceTableRepo = {
    listAll: vi.fn().mockResolvedValue(
      overrides.priceRows ?? [
        { provider: "deepgram", providerType: "stt", unitType: "seconds", pricePerUnit: 0.0043, currency: "USD" },
        { provider: "openai", providerType: "llm", unitType: "tokens", pricePerUnit: 0.0000025, currency: "USD" },
        { provider: "elevenlabs", providerType: "tts", unitType: "characters", pricePerUnit: 0.00003, currency: "USD" },
      ],
    ),
  };
  return { callCostRepo, callEventRepo, agentConfigRepo, priceTableRepo } as unknown as MeterCallCostDeps & {
    callCostRepo: { create: ReturnType<typeof vi.fn> };
    callEventRepo: { append: ReturnType<typeof vi.fn> };
    agentConfigRepo: { findByName: ReturnType<typeof vi.fn> };
    priceTableRepo: { listAll: ReturnType<typeof vi.fn> };
  };
}

describe("meterCallCost", () => {
  it("does nothing for a non-COMPLETED call", async () => {
    const d = deps();
    await meterCallCost(call({ status: "FAILED" }), usage, d);
    expect(d.callCostRepo.create).not.toHaveBeenCalled();
  });

  it("does nothing when usage is undefined (a scenario-less call)", async () => {
    const d = deps();
    await meterCallCost(call(), undefined, d);
    expect(d.callCostRepo.create).not.toHaveBeenCalled();
  });

  it("does nothing when the agent config no longer exists", async () => {
    const d = deps({ agentConfig: null });
    await meterCallCost(call(), usage, d);
    expect(d.callCostRepo.create).not.toHaveBeenCalled();
  });

  it("creates one CallCost row per metered leg for a completed cascade call", async () => {
    const d = deps();
    await meterCallCost(call(), usage, d);

    expect(d.callCostRepo.create).toHaveBeenCalledTimes(3);
    expect(d.callCostRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ callSid: "call-1", providerType: "stt", provider: "deepgram" }),
    );
  });

  it("records a cost_unpriced_leg CallEvent instead of a CallCost row for an unpriced provider", async () => {
    const d = deps({
      agentConfig: { voiceMode: "realtime", s2sProvider: "azure", sttProvider: null, llmProvider: null, ttsProvider: null },
      priceRows: [], // no price row for "azure"
    });
    await meterCallCost(call({ scenario: "demo_greeting" }), usage, d);

    expect(d.callCostRepo.create).not.toHaveBeenCalled();
    expect(d.callEventRepo.append).toHaveBeenCalledWith(
      expect.objectContaining({ callSid: "call-1", eventType: "cost_unpriced_leg" }),
    );
  });
});
