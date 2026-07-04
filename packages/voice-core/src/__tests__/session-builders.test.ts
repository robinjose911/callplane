import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const calls: Record<string, unknown[][]> = {};
function record(name: string, args: unknown[]): void {
  (calls[name] ??= []).push(args);
}
function lastCall(name: string): unknown[] | undefined {
  return calls[name]?.at(-1);
}

vi.mock("@livekit/agents", () => ({
  voice: {
    AgentSession: vi.fn().mockImplementation((...args: unknown[]) => {
      record("AgentSession", args);
      return { __type: "AgentSession", args };
    }),
    Agent: vi.fn().mockImplementation((...args: unknown[]) => {
      record("Agent", args);
      return { __type: "Agent", args };
    }),
  },
}));

vi.mock("@livekit/agents-plugin-google", () => ({
  LLM: vi.fn().mockImplementation((...args: unknown[]) => {
    record("GoogleLLM", args);
    return { __type: "GoogleLLM" };
  }),
  realtime: {
    RealtimeModel: vi.fn().mockImplementation((...args: unknown[]) => {
      record("GoogleRealtimeModel", args);
      return { __type: "GoogleRealtimeModel" };
    }),
  },
}));

vi.mock("@livekit/agents-plugin-openai", () => ({
  LLM: vi.fn().mockImplementation((...args: unknown[]) => {
    record("OpenAILLM", args);
    return { __type: "OpenAILLM" };
  }),
  realtime: {
    RealtimeModel: vi.fn().mockImplementation((...args: unknown[]) => {
      record("OpenAIRealtimeModel", args);
      return { __type: "OpenAIRealtimeModel", ...(args[0] as object) };
    }),
  },
}));

vi.mock("@livekit/agents-plugin-deepgram", () => ({
  STT: vi.fn().mockImplementation((...args: unknown[]) => {
    record("DeepgramSTT", args);
    return { __type: "DeepgramSTT" };
  }),
}));

vi.mock("@livekit/agents-plugin-elevenlabs", () => ({
  TTS: vi.fn().mockImplementation((...args: unknown[]) => {
    record("ElevenLabsTTS", args);
    return { __type: "ElevenLabsTTS" };
  }),
}));

vi.mock("@livekit/agents-plugin-cartesia", () => ({
  TTS: vi.fn().mockImplementation((...args: unknown[]) => {
    record("CartesiaTTS", args);
    return { __type: "CartesiaTTS" };
  }),
}));

vi.mock("openai", () => ({
  AzureOpenAI: vi.fn().mockImplementation((...args: unknown[]) => {
    record("AzureOpenAI", args);
    return { __type: "AzureOpenAI" };
  }),
}));

const {
  buildCascadeSession,
  buildRealtimeSession,
  buildHalfCascadeSession,
  buildSessionFromMode,
} = await import("../lib/session-builders.js");
const { isAzureConfigured } = await import("../lib/realtime-agent.js");
const { resolveVoiceSession } = await import("../lib/resolve-voice-session.js");

const baseParams = {
  llmModel: "",
  s2sProvider: null,
  s2sModel: null,
  systemPrompt: "You are helpful.",
  sttLanguageCode: "en-US",
  ttsVoiceId: null,
  ttsProvider: "elevenlabs" as const,
  // The real llm.ToolContext exposes a `.tools` array; session-builders.ts only reads that.
  toolContext: { tools: [] } as unknown as import("@livekit/agents").llm.ToolContext,
};

describe("session-builders", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    for (const key of Object.keys(calls)) delete calls[key];
    delete process.env["AZURE_OPENAI_API_KEY"];
    delete process.env["AZURE_OPENAI_ENDPOINT"];
    delete process.env["GOOGLE_API_KEY"];
    delete process.env["OPENAI_API_KEY"];
    delete process.env["DEEPGRAM_API_KEY"];
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  describe("buildCascadeSession", () => {
    it("routes a gemini-* llmModel to the Gemini chat LLM", () => {
      buildCascadeSession({ ...baseParams, voiceMode: "cascade", llmModel: "gemini-2.0-flash-001" });

      expect(lastCall("GoogleLLM")?.[0]).toMatchObject({ model: "gemini-2.0-flash-001" });
      expect(calls["AzureOpenAI"]).toBeUndefined();
    });

    it("routes any non-gemini llmModel to Azure LLM with deployment = llmModel", () => {
      buildCascadeSession({ ...baseParams, voiceMode: "cascade", llmModel: "gpt-4o" });

      expect(lastCall("AzureOpenAI")?.[0]).toMatchObject({ deployment: "gpt-4o" });
      expect(lastCall("OpenAILLM")?.[0]).toMatchObject({ model: "gpt-4o" });
    });

    it("always wires Deepgram STT", () => {
      buildCascadeSession({ ...baseParams, voiceMode: "cascade", llmModel: "gpt-4o" });
      expect(calls["DeepgramSTT"]).toHaveLength(1);
    });

    it("uses ElevenLabs TTS by default", () => {
      buildCascadeSession({ ...baseParams, voiceMode: "cascade", llmModel: "gpt-4o", ttsProvider: "elevenlabs" });
      expect(calls["ElevenLabsTTS"]).toHaveLength(1);
      expect(calls["CartesiaTTS"]).toBeUndefined();
    });

    it("uses Cartesia TTS when ttsProvider is cartesia", () => {
      buildCascadeSession({ ...baseParams, voiceMode: "cascade", llmModel: "gpt-4o", ttsProvider: "cartesia" });
      expect(calls["CartesiaTTS"]).toHaveLength(1);
      expect(calls["ElevenLabsTTS"]).toBeUndefined();
    });
  });

  describe("buildRealtimeSession", () => {
    it("routes s2sProvider=gemini to the Gemini realtime model", () => {
      buildRealtimeSession({ ...baseParams, voiceMode: "realtime", s2sProvider: "gemini", s2sModel: "gemini-2.0-flash-live-001" });
      expect(lastCall("GoogleRealtimeModel")?.[0]).toMatchObject({ model: "gemini-2.0-flash-live-001" });
    });

    it("adds a parallel Deepgram STT for Gemini when DEEPGRAM_API_KEY is set", () => {
      process.env["DEEPGRAM_API_KEY"] = "dg-key";
      const result = buildRealtimeSession({ ...baseParams, voiceMode: "realtime", s2sProvider: "gemini", s2sModel: "gemini-x" });
      expect(result.parallelStt).toBeDefined();
      expect(calls["DeepgramSTT"]).toHaveLength(1);
    });

    it("omits parallel STT for Gemini when DEEPGRAM_API_KEY is not set", () => {
      const result = buildRealtimeSession({ ...baseParams, voiceMode: "realtime", s2sProvider: "gemini", s2sModel: "gemini-x" });
      expect(result.parallelStt).toBeUndefined();
    });

    it("routes s2sProvider=openai to the direct OpenAI realtime model when Azure is not configured", () => {
      buildRealtimeSession({ ...baseParams, voiceMode: "realtime", s2sProvider: "openai", s2sModel: "gpt-realtime" });
      expect(lastCall("OpenAIRealtimeModel")?.[0]).toMatchObject({ model: "gpt-realtime" });
      expect((lastCall("OpenAIRealtimeModel")?.[0] as Record<string, unknown>)["azureDeployment"]).toBeUndefined();
    });

    it("routes s2sProvider=azure to the Azure realtime model with azureDeployment = s2sModel", () => {
      process.env["AZURE_OPENAI_API_KEY"] = "az-key";
      process.env["AZURE_OPENAI_ENDPOINT"] = "https://example.openai.azure.com";
      buildRealtimeSession({ ...baseParams, voiceMode: "realtime", s2sProvider: "azure", s2sModel: "gpt-realtime-deployment" });
      expect(lastCall("OpenAIRealtimeModel")?.[0]).toMatchObject({ azureDeployment: "gpt-realtime-deployment" });
    });

    it("Azure fallback: even with s2sProvider=openai, isAzureConfigured() being true routes to Azure", () => {
      process.env["AZURE_OPENAI_API_KEY"] = "az-key";
      process.env["AZURE_OPENAI_ENDPOINT"] = "https://example.openai.azure.com";
      expect(isAzureConfigured()).toBe(true);

      buildRealtimeSession({ ...baseParams, voiceMode: "realtime", s2sProvider: "openai", s2sModel: "gpt-realtime-deployment" });
      expect(lastCall("OpenAIRealtimeModel")?.[0]).toMatchObject({ azureDeployment: "gpt-realtime-deployment" });
    });

    it("Azure fallback: partial Azure config (key but no endpoint) falls back to direct OpenAI", () => {
      process.env["AZURE_OPENAI_API_KEY"] = "az-key";
      expect(isAzureConfigured()).toBe(false);

      buildRealtimeSession({ ...baseParams, voiceMode: "realtime", s2sProvider: "openai", s2sModel: "gpt-realtime" });
      expect((lastCall("OpenAIRealtimeModel")?.[0] as Record<string, unknown>)["azureDeployment"]).toBeUndefined();
    });
  });

  describe("buildHalfCascadeSession", () => {
    it("redirects a gemini s2sProvider to the full realtime path (native audio, no separate TTS)", () => {
      buildHalfCascadeSession({ ...baseParams, voiceMode: "half_cascade", s2sProvider: "gemini", s2sModel: "gemini-x" });
      expect(calls["GoogleRealtimeModel"]).toHaveLength(1);
      expect(calls["ElevenLabsTTS"]).toBeUndefined();
    });

    it("wires a separate TTS alongside the realtime model for non-Gemini providers", () => {
      buildHalfCascadeSession({ ...baseParams, voiceMode: "half_cascade", s2sProvider: "openai", s2sModel: "gpt-realtime", ttsProvider: "elevenlabs" });
      expect(calls["OpenAIRealtimeModel"]).toHaveLength(1);
      expect(calls["ElevenLabsTTS"]).toHaveLength(1);
    });
  });

  describe("buildSessionFromMode dispatcher", () => {
    it("routes all 3 modes x {gemini, openai, azure} to the right factory with the right model/deployment", () => {
      const matrix: Array<[string, "gemini" | "openai" | "azure" | null, string]> = [
        ["cascade", null, "gemini-2.0-flash-001"],
        ["cascade", null, "gpt-4o"],
        ["realtime", "gemini", "gemini-live-x"],
        ["realtime", "openai", "gpt-realtime"],
        ["realtime", "azure", "gpt-realtime-deployment"],
        ["half_cascade", "gemini", "gemini-live-x"],
        ["half_cascade", "openai", "gpt-realtime"],
      ];

      for (const [voiceMode, s2sProvider, modelOrDeployment] of matrix) {
        for (const key of Object.keys(calls)) delete calls[key];
        if (s2sProvider === "azure") {
          process.env["AZURE_OPENAI_API_KEY"] = "az-key";
          process.env["AZURE_OPENAI_ENDPOINT"] = "https://example.openai.azure.com";
        } else {
          delete process.env["AZURE_OPENAI_API_KEY"];
          delete process.env["AZURE_OPENAI_ENDPOINT"];
        }

        const result = buildSessionFromMode({
          ...baseParams,
          voiceMode: voiceMode as never,
          llmModel: modelOrDeployment,
          s2sProvider,
          s2sModel: modelOrDeployment,
        });

        expect(result.agent).toBeDefined();
        expect(result.session).toBeDefined();
      }
    });
  });

  describe("resolveVoiceSession stub-mode override", () => {
    it("returns the stub session when PROVIDER_STUB_MODE is on, regardless of config", () => {
      const stub = { __type: "stub" };
      const result = resolveVoiceSession(
        { ...baseParams, voiceMode: "realtime", s2sProvider: "gemini", s2sModel: "gemini-x" },
        () => stub,
        () => true,
      );
      expect(result).toBe(stub);
      expect(calls["GoogleRealtimeModel"]).toBeUndefined();
    });

    it("returns the real session when PROVIDER_STUB_MODE is off", () => {
      const stub = { __type: "stub" };
      const result = resolveVoiceSession(
        { ...baseParams, voiceMode: "cascade", llmModel: "gpt-4o" },
        () => stub,
        () => false,
      );
      expect(result).not.toBe(stub);
      expect(calls["AzureOpenAI"]).toHaveLength(1);
    });
  });
});
