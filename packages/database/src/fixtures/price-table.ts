import type { UpsertPriceInput } from "../repositories/price-table.repository.js";

/**
 * Illustrative default prices (D6: console-editable) — not a promise of any real provider's rate.
 * `provider` values must match `S2sProvider`/agent-config provider fields exactly (Stage 9: an
 * agent's `s2sProvider: "gemini"` metered against a price row for a differently-spelled
 * "gemini-live" would be silently UNPRICED) — `demo-azure-realtime`'s `s2sProvider: "azure"` has
 * no row here on purpose, demonstrating the UNPRICED path for a provider nobody's priced yet.
 */
export const PRICE_TABLE_FIXTURES: UpsertPriceInput[] = [
  { provider: "gemini", providerType: "s2s", unitType: "tokens", pricePerUnit: 0.000004 },
  { provider: "openai", providerType: "s2s", unitType: "tokens", pricePerUnit: 0.000006 },
  { provider: "deepgram", providerType: "stt", unitType: "seconds", pricePerUnit: 0.0043 },
  // Not 0.0000025 — PriceTable.pricePerUnit is Decimal(18, 6), so a 7th fractional digit gets
  // silently rounded by Postgres (0.0000025 -> 0.000003), which would make "exact to the cent"
  // cost assertions drift from the value written in this file. Every seeded rate here must round
  // to itself at 6 decimal places.
  { provider: "openai", providerType: "llm", unitType: "tokens", pricePerUnit: 0.000003 },
  { provider: "elevenlabs", providerType: "tts", unitType: "characters", pricePerUnit: 0.00003 },
  { provider: "cartesia", providerType: "tts", unitType: "characters", pricePerUnit: 0.00002 },
];
