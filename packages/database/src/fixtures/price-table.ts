import type { UpsertPriceInput } from "../repositories/price-table.repository.js";

/** Illustrative default prices (D6: console-editable) — not a promise of any real provider's rate. */
export const PRICE_TABLE_FIXTURES: UpsertPriceInput[] = [
  { provider: "gemini-live", providerType: "s2s", unitType: "tokens", pricePerUnit: 0.000004 },
  { provider: "openai-realtime", providerType: "s2s", unitType: "tokens", pricePerUnit: 0.000006 },
  { provider: "deepgram", providerType: "stt", unitType: "seconds", pricePerUnit: 0.0043 },
  { provider: "openai", providerType: "llm", unitType: "tokens", pricePerUnit: 0.0000025 },
  { provider: "elevenlabs", providerType: "tts", unitType: "characters", pricePerUnit: 0.00003 },
  { provider: "cartesia", providerType: "tts", unitType: "characters", pricePerUnit: 0.00002 },
];
