/**
 * Session builders for the three public voice modes (D1: cascade | half_cascade | realtime).
 * Ported from the source project's session-builders.ts with the public mode names and genericized provider
 * wiring. Each builder is independently testable and has no shared mutable state; only
 * `buildSessionFromMode` dispatches between them.
 */
import { voice, llm, stt } from "@livekit/agents";
import { createDeepgramStt, createGeminiLlm, createAzureLlm, createElevenLabsTts, createCartesiaTts } from "./pipeline-agent.js";
import { createGeminiRealtimeModel, createOpenAIRealtimeModel, createAzureRealtimeModel, isAzureConfigured } from "./realtime-agent.js";
import type { VoiceMode } from "@callplane/contracts";

export interface AgentSessionPair {
  session: voice.AgentSession;
  agent: voice.Agent;
  /** Parallel STT for user transcription — only present for the Gemini realtime path. */
  parallelStt?: stt.STT;
}

/** Common parameters accepted by all three session builders. */
export interface SessionBuildParams {
  voiceMode: VoiceMode;
  /** Cascade: LLM model name (routes to Gemini when it starts with "gemini-", else Azure). */
  llmModel: string;
  /** Realtime/half_cascade: which S2S provider to use. */
  s2sProvider: "gemini" | "openai" | "azure" | null;
  s2sModel: string | null;
  systemPrompt: string;
  sttLanguageCode: string;
  ttsVoiceId: string | null;
  ttsProvider: "elevenlabs" | "cartesia";
  toolContext: llm.ToolContext;
}

function resolveApiKeys() {
  return {
    google: process.env["GOOGLE_API_KEY"],
    openai: process.env["OPENAI_API_KEY"],
    azureKey: process.env["AZURE_OPENAI_API_KEY"],
    azureEndpoint: process.env["AZURE_OPENAI_ENDPOINT"],
    deepgram: process.env["DEEPGRAM_API_KEY"],
    elevenlabs: process.env["ELEVENLABS_API_KEY"],
    cartesia: process.env["CARTESIA_API_KEY"],
  };
}

function buildTts(params: SessionBuildParams): ReturnType<typeof createElevenLabsTts> | ReturnType<typeof createCartesiaTts> {
  const keys = resolveApiKeys();
  const langCode = params.sttLanguageCode.split("-")[0] ?? "en";
  return params.ttsProvider === "cartesia"
    ? createCartesiaTts({
        ...(keys.cartesia !== undefined ? { apiKey: keys.cartesia } : {}),
        ...(params.ttsVoiceId !== null ? { voiceId: params.ttsVoiceId } : {}),
        languageCode: langCode,
      })
    : createElevenLabsTts({
        ...(keys.elevenlabs !== undefined ? { apiKey: keys.elevenlabs } : {}),
        ...(params.ttsVoiceId !== null ? { voiceId: params.ttsVoiceId } : {}),
        languageCode: langCode,
      });
}

/** cascade: Deepgram STT + LLM (Gemini or Azure) + ElevenLabs/Cartesia TTS. */
export function buildCascadeSession(params: SessionBuildParams): AgentSessionPair {
  const keys = resolveApiKeys();
  const isGemini = params.llmModel.toLowerCase().startsWith("gemini-");

  const sttInstance = createDeepgramStt({
    ...(keys.deepgram !== undefined ? { apiKey: keys.deepgram } : {}),
    language: params.sttLanguageCode,
  });

  const llmInstance = isGemini
    ? createGeminiLlm({ ...(keys.google !== undefined ? { apiKey: keys.google } : {}), model: params.llmModel })
    : createAzureLlm({
        ...(keys.azureKey !== undefined ? { apiKey: keys.azureKey } : {}),
        ...(keys.azureEndpoint !== undefined ? { azureEndpoint: keys.azureEndpoint } : {}),
        deployment: params.llmModel,
      });

  const hasTools = params.toolContext.tools.length > 0;

  return {
    session: new voice.AgentSession({ turnDetection: "stt" }),
    agent: new voice.Agent({
      instructions: params.systemPrompt,
      llm: llmInstance,
      stt: sttInstance,
      tts: buildTts(params),
      ...(hasTools ? { tools: params.toolContext } : {}),
    }),
  };
}

/** realtime: native audio speech-to-speech (Gemini Live / OpenAI / Azure OpenAI Realtime). */
export function buildRealtimeSession(params: SessionBuildParams): AgentSessionPair {
  const keys = resolveApiKeys();
  const hasTools = params.toolContext.tools.length > 0;

  let model;
  let parallelStt: stt.STT | undefined;

  if (params.s2sProvider === "gemini") {
    model = createGeminiRealtimeModel({
      ...(keys.google !== undefined ? { apiKey: keys.google } : {}),
      ...(params.s2sModel !== null ? { model: params.s2sModel } : {}),
      language: params.sttLanguageCode,
    });
    // Gemini's native inputAudioTranscription is unreliable across model variants — a parallel
    // Deepgram STT on the user's audio track produces the transcript instead.
    if (keys.deepgram !== undefined) {
      parallelStt = createDeepgramStt({ apiKey: keys.deepgram, language: params.sttLanguageCode });
    }
  } else if (params.s2sProvider === "azure" || isAzureConfigured()) {
    model = createAzureRealtimeModel({
      azureDeployment: params.s2sModel ?? params.llmModel,
      ...(keys.azureKey !== undefined ? { apiKey: keys.azureKey } : {}),
    });
  } else {
    model = createOpenAIRealtimeModel({
      ...(keys.openai !== undefined ? { apiKey: keys.openai } : {}),
      ...(params.s2sModel !== null ? { model: params.s2sModel } : {}),
    });
  }

  return {
    session: new voice.AgentSession({ llm: model }),
    agent: new voice.Agent({ instructions: params.systemPrompt, llm: model, ...(hasTools ? { tools: params.toolContext } : {}) }),
    ...(parallelStt !== undefined ? { parallelStt } : {}),
  };
}

/**
 * half_cascade: realtime STT/LLM combo model + separate TTS. Gemini does not support text-only
 * output (the LiveKit Google plugin always expects Gemini to emit audio), so Gemini requests are
 * redirected to the full realtime path — matching the source project's documented behavior.
 */
export function buildHalfCascadeSession(params: SessionBuildParams): AgentSessionPair {
  if (params.s2sProvider === "gemini") {
    return buildRealtimeSession(params);
  }

  const keys = resolveApiKeys();
  const hasTools = params.toolContext.tools.length > 0;

  const model =
    params.s2sProvider === "azure" || isAzureConfigured()
      ? createAzureRealtimeModel({
          azureDeployment: params.s2sModel ?? params.llmModel,
          ...(keys.azureKey !== undefined ? { apiKey: keys.azureKey } : {}),
        })
      : createOpenAIRealtimeModel({
          ...(keys.openai !== undefined ? { apiKey: keys.openai } : {}),
          ...(params.s2sModel !== null ? { model: params.s2sModel } : {}),
        });

  return {
    session: new voice.AgentSession({ llm: model, tts: buildTts(params) }),
    agent: new voice.Agent({ instructions: params.systemPrompt, llm: model, ...(hasTools ? { tools: params.toolContext } : {}) }),
  };
}

/** Dispatcher — the primary entry point. Each mode builder is independently testable. */
export function buildSessionFromMode(params: SessionBuildParams): AgentSessionPair {
  switch (params.voiceMode) {
    case "cascade":
      return buildCascadeSession(params);
    case "realtime":
      return buildRealtimeSession(params);
    case "half_cascade":
      return buildHalfCascadeSession(params);
  }
}
