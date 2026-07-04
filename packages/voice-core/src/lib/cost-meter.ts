import type { PriceTable } from "@callplane/database";
import type { StubScenarioUsage, VoiceMode } from "@callplane/contracts";

export interface MeterCallUsageInput {
  voiceMode: VoiceMode;
  s2sProvider: string | null;
  sttProvider: string | null;
  llmProvider: string | null;
  ttsProvider: string | null;
  usage: StubScenarioUsage;
}

/** One provider leg's metered usage. `costAmount: null` means no matching `PriceTable` row was
 * found — an explicit UNPRICED flag, never a silent zero. */
export interface MeteredLeg {
  provider: string;
  providerType: string;
  unitType: string;
  units: number;
  costAmount: number | null;
  currency: string;
}

interface RawLeg {
  provider: string;
  providerType: string;
  unitType: string;
  units: number;
}

/**
 * Picks the provider legs that actually apply for a given voice mode (realtime/half_cascade use
 * S2S; cascade uses STT+LLM; cascade and half_cascade both use TTS) and prices each against the
 * DB `PriceTable` (D6: console-editable, never hardcoded). A leg whose provider has no matching
 * price row gets `costAmount: null` rather than being silently dropped or priced at zero.
 */
export function meterCallUsage(input: MeterCallUsageInput, priceRows: PriceTable[]): MeteredLeg[] {
  const legs: RawLeg[] = [];

  if ((input.voiceMode === "realtime" || input.voiceMode === "half_cascade") && input.s2sProvider) {
    legs.push({ provider: input.s2sProvider, providerType: "s2s", unitType: "tokens", units: input.usage.s2sTokens });
  }
  if (input.voiceMode === "cascade") {
    if (input.sttProvider) {
      legs.push({ provider: input.sttProvider, providerType: "stt", unitType: "seconds", units: input.usage.sttSeconds });
    }
    if (input.llmProvider) {
      legs.push({ provider: input.llmProvider, providerType: "llm", unitType: "tokens", units: input.usage.llmTokens });
    }
  }
  if ((input.voiceMode === "cascade" || input.voiceMode === "half_cascade") && input.ttsProvider) {
    legs.push({
      provider: input.ttsProvider,
      providerType: "tts",
      unitType: "characters",
      units: input.usage.ttsCharacters,
    });
  }

  return legs.map((leg) => {
    const priceRow = priceRows.find(
      (row) => row.provider === leg.provider && row.providerType === leg.providerType && row.unitType === leg.unitType,
    );
    if (!priceRow) {
      return { ...leg, costAmount: null, currency: "USD" };
    }
    return { ...leg, costAmount: leg.units * Number(priceRow.pricePerUnit), currency: priceRow.currency };
  });
}
