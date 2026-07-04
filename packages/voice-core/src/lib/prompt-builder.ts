import { resolveTemplate } from "./template-resolver.js";

/**
 * Short first-response filler instruction injected when `enableShortFirstResponse` is true.
 *
 * Latency optimization: beginning responses with a 1-3 word affirmative lets the TTS pipeline
 * (or realtime model) start speaking immediately, so the first audio chunk reaches the caller
 * in ~200ms while the model continues generating the substantive response. Phrasing spans
 * English/German/French so no per-language variants are needed for the 3 seeded profiles.
 */
const SHORT_FIRST_RESPONSE_INSTRUCTION = `Except for your opening greeting, begin each response with a short 1-3 word affirmative filler in the conversation language before your main response. Examples by language:
- English: "I see,", "Right,", "Absolutely,", "Of course,", "Sure,"
- German: "Verstehe,", "Genau,", "Natürlich,", "Selbstverständlich,", "Klar,"
- French: "Je vois,", "Bien sûr,", "Absolument,", "Tout à fait,", "Entendu,"
This makes responses feel more natural and reduces perceived delay. Do not use a filler when asking a clarifying question. Always use fillers in the same language you are speaking.`;

export interface PromptBuildParams {
  /** Agent's own prompt template, with optional `{{variable_name}}` placeholders. */
  prompt: string;
  /** Language profile prefix (phonetic alphabet + number reading rules). Prepended first. */
  languageProfilePrefix: string;
  dynamicVariables: Record<string, unknown>;
  enableShortFirstResponse: boolean;
}

/**
 * Builds the fully-resolved system prompt for a voice call. This is the only place prompt
 * assembly happens — no prompt construction in the worker, the runner, or apps/.
 *
 * Injection order: language prefix → short-first-response instruction (if enabled) → resolved
 * agent prompt. Deterministic pure function of its params — no I/O, no randomness.
 */
export function buildSystemPrompt(params: PromptBuildParams): string {
  const resolvedPrompt = resolveTemplate(params.prompt, params.dynamicVariables);

  const parts: string[] = [];

  const prefix = params.languageProfilePrefix.trim();
  if (prefix) parts.push(prefix);

  if (params.enableShortFirstResponse) parts.push(SHORT_FIRST_RESPONSE_INSTRUCTION);

  parts.push(resolvedPrompt);

  return parts.join("\n\n");
}
