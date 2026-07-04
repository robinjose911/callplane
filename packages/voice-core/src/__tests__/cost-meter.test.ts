import { describe, expect, it } from "vitest";
import type { PriceTable } from "@callplane/database";
import { meterCallUsage } from "../lib/cost-meter.js";

function priceRow(overrides: Partial<PriceTable> = {}): PriceTable {
  return {
    id: "row-1",
    provider: "openai",
    providerType: "llm",
    unitType: "tokens",
    pricePerUnit: 0.0000025 as unknown as PriceTable["pricePerUnit"],
    currency: "USD",
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as PriceTable;
}

const usage = { s2sTokens: 1000, sttSeconds: 5, llmTokens: 500, ttsCharacters: 200 };

const priceRows = [
  priceRow({ provider: "gemini-live", providerType: "s2s", unitType: "tokens", pricePerUnit: 0.000004 as never }),
  priceRow({ provider: "deepgram", providerType: "stt", unitType: "seconds", pricePerUnit: 0.0043 as never }),
  priceRow({ provider: "openai", providerType: "llm", unitType: "tokens", pricePerUnit: 0.0000025 as never }),
  priceRow({ provider: "elevenlabs", providerType: "tts", unitType: "characters", pricePerUnit: 0.00003 as never }),
];

describe("meterCallUsage", () => {
  it("meters only the STT+LLM+TTS legs for cascade mode, ignoring S2S usage entirely", () => {
    const legs = meterCallUsage(
      { voiceMode: "cascade", s2sProvider: null, sttProvider: "deepgram", llmProvider: "openai", ttsProvider: "elevenlabs", usage },
      priceRows,
    );

    expect(legs.map((l) => l.providerType).sort()).toEqual(["llm", "stt", "tts"]);
    const total = legs.reduce((sum, l) => sum + (l.costAmount ?? 0), 0);
    expect(total).toBeCloseTo(0.02875, 6); // 5*0.0043 + 500*0.0000025 + 200*0.00003
  });

  it("meters only the S2S leg for realtime mode, ignoring STT/LLM/TTS providers if present", () => {
    const legs = meterCallUsage(
      { voiceMode: "realtime", s2sProvider: "gemini-live", sttProvider: null, llmProvider: null, ttsProvider: null, usage },
      priceRows,
    );

    expect(legs).toHaveLength(1);
    expect(legs[0]).toMatchObject({ providerType: "s2s", costAmount: 0.004 }); // 1000 * 0.000004
  });

  it("meters S2S + TTS legs for half_cascade mode", () => {
    const legs = meterCallUsage(
      { voiceMode: "half_cascade", s2sProvider: "gemini-live", sttProvider: null, llmProvider: null, ttsProvider: "elevenlabs", usage },
      priceRows,
    );

    expect(legs.map((l) => l.providerType).sort()).toEqual(["s2s", "tts"]);
    const total = legs.reduce((sum, l) => sum + (l.costAmount ?? 0), 0);
    expect(total).toBeCloseTo(0.01, 6); // 1000*0.000004 + 200*0.00003
  });

  it("flags a provider with no matching PriceTable row as UNPRICED (costAmount: null), not zero", () => {
    const legs = meterCallUsage(
      { voiceMode: "realtime", s2sProvider: "azure", sttProvider: null, llmProvider: null, ttsProvider: null, usage },
      priceRows, // no "azure" row
    );

    expect(legs).toHaveLength(1);
    expect(legs[0]!.costAmount).toBeNull();
    expect(legs[0]!.units).toBe(1000); // usage is still reported even though it's unpriced
  });

  it("a price-table override changes the metered cost", () => {
    const cheaperRows = [priceRow({ provider: "gemini-live", providerType: "s2s", unitType: "tokens", pricePerUnit: 0.000001 as never })];
    const legs = meterCallUsage(
      { voiceMode: "realtime", s2sProvider: "gemini-live", sttProvider: null, llmProvider: null, ttsProvider: null, usage },
      cheaperRows,
    );
    expect(legs[0]!.costAmount).toBeCloseTo(0.001, 6);
  });
});
