import { z } from "zod";

/** Public voice-mode names (D6/D1 — not the source project's internal `semi_cascade`/`realtime_s2s`). */
export const VoiceModeSchema = z.enum(["cascade", "half_cascade", "realtime"]);
export type VoiceMode = z.infer<typeof VoiceModeSchema>;

/** Native speech-to-speech providers, used by `realtime` (and the S2S leg of `half_cascade`). */
export const S2sProviderSchema = z.enum(["gemini", "openai", "azure"]);
export type S2sProvider = z.infer<typeof S2sProviderSchema>;

/** STT providers, used by `cascade`. */
export const SttProviderSchema = z.enum(["deepgram"]);
export type SttProvider = z.infer<typeof SttProviderSchema>;

/** LLM providers, used by `cascade`. */
export const LlmProviderSchema = z.enum(["openai", "google", "azure"]);
export type LlmProvider = z.infer<typeof LlmProviderSchema>;

/** TTS providers, used by `cascade` and `half_cascade`. */
export const TtsProviderSchema = z.enum(["elevenlabs", "cartesia"]);
export type TtsProvider = z.infer<typeof TtsProviderSchema>;

/** Matches OpenAI-style `reasoning_effort` model params. */
export const ReasoningEffortSchema = z.enum(["none", "low", "medium", "high"]);
export type ReasoningEffort = z.infer<typeof ReasoningEffortSchema>;

/**
 * Agent configuration — every field here is D6-configurable (Postgres row, editable in the
 * console) rather than an env var. Which provider/model fields are meaningful depends on
 * `voiceMode`: `realtime` uses only `s2sProvider`/`s2sModel`; `cascade` uses
 * `sttProvider`/`llmProvider`/`llmModel`/`ttsProvider`/`ttsVoiceId`; `half_cascade` uses
 * `s2sProvider`/`s2sModel` (STT+LLM combo) plus `ttsProvider`/`ttsVoiceId`.
 */
export const AgentConfigSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  voiceMode: VoiceModeSchema,
  s2sProvider: S2sProviderSchema.nullable(),
  s2sModel: z.string().nullable(),
  sttProvider: SttProviderSchema.nullable(),
  llmProvider: LlmProviderSchema.nullable(),
  llmModel: z.string().nullable(),
  ttsProvider: TtsProviderSchema.nullable(),
  ttsVoiceId: z.string().nullable(),
  reasoningEffort: ReasoningEffortSchema.nullable(),
  prompt: z.string().min(1),
  enableShortFirstResponse: z.boolean(),
  languageProfileId: z.string().nullable(),
  isActive: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type AgentConfigResponse = z.infer<typeof AgentConfigSchema>;

export const CreateAgentConfigBodySchema = z.object({
  name: z.string().min(1),
  voiceMode: VoiceModeSchema,
  s2sProvider: S2sProviderSchema.optional(),
  s2sModel: z.string().min(1).optional(),
  sttProvider: SttProviderSchema.optional(),
  llmProvider: LlmProviderSchema.optional(),
  llmModel: z.string().min(1).optional(),
  ttsProvider: TtsProviderSchema.optional(),
  ttsVoiceId: z.string().min(1).optional(),
  reasoningEffort: ReasoningEffortSchema.optional(),
  prompt: z.string().min(1),
  enableShortFirstResponse: z.boolean().optional(),
  languageProfileId: z.string().optional(),
  isActive: z.boolean().optional(),
});

export type CreateAgentConfigBody = z.infer<typeof CreateAgentConfigBodySchema>;

export const UpdateAgentConfigBodySchema = CreateAgentConfigBodySchema.partial();

export type UpdateAgentConfigBody = z.infer<typeof UpdateAgentConfigBodySchema>;

/** Language profile — phonetic/prompt fragments and default voice per language. */
export const LanguageProfileSchema = z.object({
  id: z.string(),
  languageCode: z.string().min(2),
  systemPromptPrefix: z.string(),
  defaultTtsVoiceId: z.string().nullable(),
  defaultSttLanguageCode: z.string().nullable(),
});

export type LanguageProfileResponse = z.infer<typeof LanguageProfileSchema>;
