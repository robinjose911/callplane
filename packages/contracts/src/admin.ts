import { z } from "zod";
import { WEBHOOK_EVENT_TYPES } from "./webhooks.js";

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

/**
 * Unlike `CreateAgentConfigBodySchema`, the mode/provider fields here are `.nullable()` as well
 * as `.optional()` — switching `voiceMode` (e.g. realtime -> cascade) must be able to explicitly
 * clear the fields that no longer apply (`s2sProvider`/`s2sModel`/`reasoningEffort`), not just
 * omit them. An omitted field means "leave unchanged" (a genuine PATCH partial-update semantic);
 * a `null` field means "clear it". Without this, switching modes leaves stale values in the DB
 * that a later read path (e.g. the console's agents list, which falls back `s2sProvider ??
 * llmProvider`) can surface incorrectly.
 */
export const UpdateAgentConfigBodySchema = z.object({
  voiceMode: VoiceModeSchema.optional(),
  s2sProvider: S2sProviderSchema.nullable().optional(),
  s2sModel: z.string().min(1).nullable().optional(),
  sttProvider: SttProviderSchema.nullable().optional(),
  llmProvider: LlmProviderSchema.nullable().optional(),
  llmModel: z.string().min(1).nullable().optional(),
  ttsProvider: TtsProviderSchema.nullable().optional(),
  ttsVoiceId: z.string().min(1).nullable().optional(),
  reasoningEffort: ReasoningEffortSchema.nullable().optional(),
  prompt: z.string().min(1).optional(),
  enableShortFirstResponse: z.boolean().optional(),
  languageProfileId: z.string().nullable().optional(),
  isActive: z.boolean().optional(),
});

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

/** SIP trunk provider config shapes (D9) — Telnyx/Twilio/generic all share the same DB row shape. */
export const SipTrunkProviderSchema = z.enum(["telnyx", "twilio", "generic"]);
export type SipTrunkProvider = z.infer<typeof SipTrunkProviderSchema>;

/**
 * SIP trunk registry entry. `credentialsRef` is a logical pointer to credentials (an env var name
 * or secret ID), never the raw secret itself — but every read path still redacts it to `"****"`
 * as defense in depth (public-repo hygiene, matching the webhook-secret redaction convention).
 */
export const SipTrunkSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  provider: SipTrunkProviderSchema,
  livekitTrunkId: z.string().min(1),
  credentialsRef: z.string(),
  maxConcurrentCalls: z.number().int().positive(),
  weight: z.number().int().min(0),
  isActive: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type SipTrunkResponse = z.infer<typeof SipTrunkSchema>;

export const CreateSipTrunkBodySchema = z.object({
  name: z.string().min(1),
  provider: SipTrunkProviderSchema,
  livekitTrunkId: z.string().min(1),
  credentialsRef: z.string().min(1),
  maxConcurrentCalls: z.number().int().positive().optional(),
  weight: z.number().int().min(0).optional(),
  isActive: z.boolean().optional(),
});

export type CreateSipTrunkBody = z.infer<typeof CreateSipTrunkBodySchema>;

export const UpdateSipTrunkBodySchema = CreateSipTrunkBodySchema.omit({ name: true }).partial();

export type UpdateSipTrunkBody = z.infer<typeof UpdateSipTrunkBodySchema>;

export const SetTrunkStatusBodySchema = z.object({ isActive: z.boolean() });
export type SetTrunkStatusBody = z.infer<typeof SetTrunkStatusBodySchema>;

/**
 * Known model names shown in the console's agent-config editor dropdowns (the source project's
 * VoiceModelOption pattern) — "llm" populates cascade's llmModel field, "s2s" populates
 * realtime/half_cascade's s2sModel field.
 */
export const VoiceModelTypeSchema = z.enum(["llm", "s2s"]);
export type VoiceModelType = z.infer<typeof VoiceModelTypeSchema>;

export const VoiceModelOptionSchema = z.object({
  id: z.string(),
  name: z.string(),
  modelType: VoiceModelTypeSchema,
  isBuiltIn: z.boolean(),
  createdAt: z.string(),
});

export type VoiceModelOptionResponse = z.infer<typeof VoiceModelOptionSchema>;

export const CreateVoiceModelOptionBodySchema = z.object({
  name: z.string().min(1, "Model name is required"),
  modelType: VoiceModelTypeSchema,
});

export type CreateVoiceModelOptionBody = z.infer<typeof CreateVoiceModelOptionBodySchema>;

const WebhookEventTypeSchema = z.enum(WEBHOOK_EVENT_TYPES);

/**
 * Blocks cloud metadata endpoints (AWS/GCP/Azure all serve instance credentials from the
 * link-local range `169.254.0.0/16`) — the one class of webhook-URL SSRF target with no
 * legitimate use case in this stack. Deliberately does NOT block `localhost`/private IPs: this
 * is a local-first demo stack whose whole point is that a webhook "customer endpoint" is
 * typically the owner's own machine (the e2e webhook receiver, `examples/webhook-receiver/`, or
 * a teammate's laptop during a demo) — a blanket loopback/private-range ban would break that
 * core use case for a security property this v1 doesn't otherwise claim to provide.
 */
function isNotMetadataUrl(url: string): boolean {
  try {
    const hostname = new URL(url).hostname;
    return hostname !== "169.254.169.254" && !hostname.startsWith("169.254.");
  } catch {
    return true; // an unparseable URL is caught by .url() separately
  }
}

const METADATA_URL_MESSAGE = "URL must not point at a cloud metadata endpoint (169.254.0.0/16)";

/** Outbound webhook target. `secret` is never returned on a read path — always `"****"`. */
export const WebhookEndpointSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  url: z.string().url(),
  secret: z.string(),
  isEnabled: z.boolean(),
  eventTypes: z.array(WebhookEventTypeSchema),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type WebhookEndpointResponse = z.infer<typeof WebhookEndpointSchema>;

export const CreateWebhookEndpointBodySchema = z.object({
  name: z.string().min(1),
  url: z.string().url().refine(isNotMetadataUrl, METADATA_URL_MESSAGE),
  secret: z.string().min(1),
  isEnabled: z.boolean().optional(),
  eventTypes: z.array(WebhookEventTypeSchema).min(1, "Select at least one event type"),
});

export type CreateWebhookEndpointBody = z.infer<typeof CreateWebhookEndpointBodySchema>;

export const UpdateWebhookEndpointBodySchema = CreateWebhookEndpointBodySchema.omit({ name: true }).partial();

export type UpdateWebhookEndpointBody = z.infer<typeof UpdateWebhookEndpointBodySchema>;

export const WebhookOutboxStatusSchema = z.enum(["PENDING", "DELIVERED", "RETRY_PENDING", "FAILED", "DEAD"]);
export type WebhookOutboxStatus = z.infer<typeof WebhookOutboxStatusSchema>;

/** A delivery is done being retried once it lands here — shared by the API's SSE stream and the
 * console's polling/rendering so both sides agree on what "settled" means. */
export const TERMINAL_WEBHOOK_OUTBOX_STATUSES: readonly WebhookOutboxStatus[] = ["DELIVERED", "DEAD"];

/** A single webhook delivery-attempt row — the console's delivery log / replay UI. */
export const WebhookOutboxEntrySchema = z.object({
  id: z.string(),
  callSid: z.string(),
  webhookEndpointId: z.string(),
  eventType: WebhookEventTypeSchema,
  status: WebhookOutboxStatusSchema,
  retryCount: z.number().int().min(0),
  maxRetries: z.number().int().positive(),
  nextRetryAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type WebhookOutboxEntryResponse = z.infer<typeof WebhookOutboxEntrySchema>;

/** One `PriceTable` row — D6: console-editable, never a hardcoded constant. */
export const PriceTableEntrySchema = z.object({
  id: z.string(),
  provider: z.string(),
  providerType: z.string(),
  unitType: z.string(),
  pricePerUnit: z.number(),
  currency: z.string(),
});

export type PriceTableEntryResponse = z.infer<typeof PriceTableEntrySchema>;

export const UpsertPriceTableEntryBodySchema = z.object({
  provider: z.string().min(1),
  providerType: z.string().min(1),
  unitType: z.string().min(1),
  pricePerUnit: z.number().nonnegative(),
  currency: z.string().min(1).optional(),
});

export type UpsertPriceTableEntryBody = z.infer<typeof UpsertPriceTableEntryBodySchema>;
