/**
 * Realtime (speech-to-speech) model factories for `realtime` and `half_cascade` modes.
 * Ported from the source project's openai-realtime-agent.ts, genericized. The GA/preview Azure endpoint-format
 * transform and wire-format patching NVA needed for one specific SDK version are intentionally
 * not ported — out of scope for this stage's plan (provider factories + azureDeployment/apiKey
 * gotchas only), and this repo's stub-first loop never actually invokes these factories live.
 */
import * as google from "@livekit/agents-plugin-google";
import * as openai from "@livekit/agents-plugin-openai";

/**
 * True only when both Azure OpenAI env vars are set — partial configuration (e.g. just the key)
 * falls back to the direct OpenAI API, never a half-configured Azure client.
 */
export function isAzureConfigured(): boolean {
  return (
    process.env["AZURE_OPENAI_API_KEY"] !== undefined && process.env["AZURE_OPENAI_ENDPOINT"] !== undefined
  );
}

export interface GeminiRealtimeOptions {
  apiKey?: string;
  model?: string;
  voice?: string;
  language?: string;
}

/** Gemini Live — native audio speech-to-speech. */
export function createGeminiRealtimeModel(opts: GeminiRealtimeOptions): google.realtime.RealtimeModel {
  return new google.realtime.RealtimeModel({
    model: opts.model ?? "gemini-2.0-flash-live-001",
    ...(opts.apiKey !== undefined ? { apiKey: opts.apiKey } : {}),
    ...(opts.voice !== undefined ? { voice: opts.voice } : {}),
    ...(opts.language !== undefined ? { language: opts.language } : {}),
  });
}

export interface OpenAIRealtimeOptions {
  apiKey?: string;
  model?: string;
  voice?: string;
}

/** Direct OpenAI Realtime API — used when Azure is not configured. */
export function createOpenAIRealtimeModel(opts: OpenAIRealtimeOptions): openai.realtime.RealtimeModel {
  return new openai.realtime.RealtimeModel({
    model: opts.model ?? "gpt-realtime",
    ...(opts.apiKey !== undefined ? { apiKey: opts.apiKey } : {}),
    voice: opts.voice ?? "marin",
  });
}

export interface AzureRealtimeOptions {
  /** Azure OpenAI deployment name — the name given in Azure OpenAI Studio, not the model name. */
  azureDeployment: string;
  /**
   * Must be spread in explicitly — this constructor path does NOT reliably fall back to
   * `AZURE_OPENAI_API_KEY` the way `OPENAI_API_KEY` is picked up on the direct-OpenAI path.
   * Pass `process.env["AZURE_OPENAI_API_KEY"]` at the call site (see CLAUDE.md).
   */
  apiKey?: string;
  apiVersion?: string;
  voice?: string;
}

/** Azure OpenAI Realtime — the constructor-with-`azureDeployment` pattern this repo standardizes on. */
export function createAzureRealtimeModel(opts: AzureRealtimeOptions): openai.realtime.RealtimeModel {
  return new openai.realtime.RealtimeModel({
    azureDeployment: opts.azureDeployment,
    ...(opts.apiKey !== undefined ? { apiKey: opts.apiKey } : {}),
    ...(opts.apiVersion !== undefined ? { apiVersion: opts.apiVersion } : {}),
    voice: opts.voice ?? "marin",
  });
}
