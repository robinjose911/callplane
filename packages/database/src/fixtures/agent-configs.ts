import type { CreateAgentConfigInput } from "../repositories/agent-config.repository.js";

/**
 * The 6 seeded agent configs — cover the D5 matrix (3 voice modes × ≥2 providers). Every
 * e2e spec references these by name; import the name constants below rather than hardcoding
 * strings, so a rename here doesn't silently desync specs.
 */
export const AGENT_CONFIG_NAMES = {
  GEMINI_REALTIME: "demo-gemini-realtime",
  OPENAI_REALTIME: "demo-openai-realtime",
  AZURE_REALTIME: "demo-azure-realtime",
  CASCADE: "demo-cascade",
  CASCADE_CARTESIA: "demo-cascade-cartesia",
  HALF_CASCADE: "demo-half-cascade",
} as const;

const PROMPT = "You are a friendly callplane demo agent. Keep responses short and conversational.";

export const AGENT_CONFIG_FIXTURES: CreateAgentConfigInput[] = [
  {
    name: AGENT_CONFIG_NAMES.GEMINI_REALTIME,
    voiceMode: "realtime",
    s2sProvider: "gemini",
    s2sModel: "gemini-2.0-flash-live",
    prompt: PROMPT,
  },
  {
    name: AGENT_CONFIG_NAMES.OPENAI_REALTIME,
    voiceMode: "realtime",
    s2sProvider: "openai",
    s2sModel: "gpt-realtime",
    prompt: PROMPT,
  },
  {
    name: AGENT_CONFIG_NAMES.AZURE_REALTIME,
    voiceMode: "realtime",
    s2sProvider: "azure",
    s2sModel: "gpt-realtime",
    prompt: PROMPT,
  },
  {
    name: AGENT_CONFIG_NAMES.CASCADE,
    voiceMode: "cascade",
    sttProvider: "deepgram",
    llmProvider: "openai",
    llmModel: "gpt-4o",
    ttsProvider: "elevenlabs",
    prompt: PROMPT,
  },
  {
    name: AGENT_CONFIG_NAMES.CASCADE_CARTESIA,
    voiceMode: "cascade",
    sttProvider: "deepgram",
    llmProvider: "openai",
    llmModel: "gpt-4o",
    ttsProvider: "cartesia",
    prompt: PROMPT,
  },
  {
    name: AGENT_CONFIG_NAMES.HALF_CASCADE,
    voiceMode: "half_cascade",
    s2sProvider: "gemini",
    s2sModel: "gemini-2.0-flash-live",
    ttsProvider: "elevenlabs",
    prompt: PROMPT,
  },
];
