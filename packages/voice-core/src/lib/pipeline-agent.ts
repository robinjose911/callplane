/**
 * STT/LLM/TTS provider factories for `cascade` and `half_cascade` modes. Ported from the source project's
 * pipeline-agent.ts, genericized (mode names, no service-specific defaults).
 */
import * as cartesia from "@livekit/agents-plugin-cartesia";
import * as deepgram from "@livekit/agents-plugin-deepgram";
import * as elevenlabs from "@livekit/agents-plugin-elevenlabs";
import * as google from "@livekit/agents-plugin-google";
import * as openai from "@livekit/agents-plugin-openai";
import { AzureOpenAI } from "openai";

export interface DeepgramSttOptions {
  apiKey?: string;
  /** BCP-47 language code, e.g. "en-US". */
  language?: string;
  /** Silence duration (ms) before Deepgram declares end-of-utterance. */
  endpointing?: number;
}

/** Deepgram Nova-3 STT for the cascade pipeline. */
export function createDeepgramStt(opts: DeepgramSttOptions): deepgram.STT {
  return new deepgram.STT({
    ...(opts.apiKey !== undefined ? { apiKey: opts.apiKey } : {}),
    model: "nova-3",
    language: opts.language ?? "en-US",
    smartFormat: false,
    punctuate: false,
    interimResults: true,
    endpointing: opts.endpointing ?? 300,
  });
}

export interface GeminiLlmOptions {
  apiKey?: string;
  model?: string;
}

/** Google Gemini chat LLM (non-realtime) for the cascade pipeline, when llmModel is gemini-*. */
export function createGeminiLlm(opts: GeminiLlmOptions): google.LLM {
  return new google.LLM({
    model: opts.model ?? "gemini-2.0-flash-001",
    ...(opts.apiKey !== undefined ? { apiKey: opts.apiKey } : {}),
  });
}

export interface ElevenLabsTtsOptions {
  apiKey?: string;
  voiceId?: string;
  languageCode?: string;
}

/** ElevenLabs TTS (eleven_flash_v2_5 — lowest latency) for cascade/half_cascade. */
export function createElevenLabsTts(opts: ElevenLabsTtsOptions): elevenlabs.TTS {
  return new elevenlabs.TTS({
    ...(opts.apiKey !== undefined ? { apiKey: opts.apiKey } : {}),
    voiceId: opts.voiceId ?? "EXAVITQu4vr4xnSDxMaL", // Bella — versatile, natural default
    model: "eleven_flash_v2_5",
    languageCode: opts.languageCode ?? "en",
  });
}

export interface CartesiaTtsOptions {
  apiKey?: string;
  voiceId?: string;
  languageCode?: string;
}

/** Cartesia TTS (Sonic 3 — low latency) for cascade/half_cascade, when ttsProvider is cartesia. */
export function createCartesiaTts(opts: CartesiaTtsOptions): cartesia.TTS {
  return new cartesia.TTS({
    ...(opts.apiKey !== undefined ? { apiKey: opts.apiKey } : {}),
    model: "sonic-3",
    voice: opts.voiceId ?? "62ae83ad-4f6a-430b-af41-a9bede9286ca",
    language: opts.languageCode ?? "en",
    speed: 0,
  });
}

export interface AzureLlmOptions {
  apiKey?: string;
  azureEndpoint?: string;
  deployment: string;
  apiVersion?: string;
}

/**
 * Azure OpenAI LLM for the cascade pipeline (llmModel is not gemini-*).
 *
 * Constructs `AzureOpenAI` directly (not `openai.LLM.withAzure()`) and passes `model` explicitly
 * alongside `client` — the constructor-with-`azureDeployment` pattern this repo standardizes on
 * (see CLAUDE.md). `apiKey` must be spread in explicitly; Azure does NOT reliably fall back to
 * `AZURE_OPENAI_API_KEY` the way the direct-OpenAI path falls back to `OPENAI_API_KEY`.
 */
export function createAzureLlm(opts: AzureLlmOptions): openai.LLM {
  const azureClient = new AzureOpenAI({
    ...(opts.azureEndpoint !== undefined ? { endpoint: opts.azureEndpoint } : {}),
    deployment: opts.deployment,
    apiVersion: opts.apiVersion ?? "2024-12-01-preview",
    ...(opts.apiKey !== undefined ? { apiKey: opts.apiKey } : {}),
  });

  return new openai.LLM({ model: opts.deployment, client: azureClient });
}
