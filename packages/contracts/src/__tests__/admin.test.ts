import { describe, expect, it } from "vitest";
import { CreateAgentConfigBodySchema, VoiceModeSchema } from "../admin.js";

describe("VoiceModeSchema", () => {
  it("accepts the three public voice modes", () => {
    for (const mode of ["cascade", "half_cascade", "realtime"]) {
      expect(VoiceModeSchema.safeParse(mode).success).toBe(true);
    }
  });

  it("rejects the source project's internal mode names", () => {
    expect(VoiceModeSchema.safeParse("semi_cascade").success).toBe(false);
    expect(VoiceModeSchema.safeParse("realtime_s2s").success).toBe(false);
  });
});

describe("CreateAgentConfigBodySchema", () => {
  it("accepts a valid realtime config", () => {
    const result = CreateAgentConfigBodySchema.safeParse({
      name: "demo-gemini-realtime",
      voiceMode: "realtime",
      s2sProvider: "gemini",
      s2sModel: "gemini-2.0-flash-live",
      prompt: "You are a helpful assistant.",
    });
    expect(result.success).toBe(true);
  });

  it("accepts a valid cascade config", () => {
    const result = CreateAgentConfigBodySchema.safeParse({
      name: "demo-cascade",
      voiceMode: "cascade",
      sttProvider: "deepgram",
      llmProvider: "openai",
      llmModel: "gpt-4o",
      ttsProvider: "elevenlabs",
      prompt: "You are a helpful assistant.",
    });
    expect(result.success).toBe(true);
  });

  it("rejects a config missing the required prompt", () => {
    const result = CreateAgentConfigBodySchema.safeParse({
      name: "demo-cascade",
      voiceMode: "cascade",
    });
    expect(result.success).toBe(false);
  });
});
