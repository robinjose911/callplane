import type { CreateVoiceModelOptionInput } from "../repositories/voice-model-option.repository.js";

/** Built-in model names shown in the console's agent-config editor dropdowns. */
export const VOICE_MODEL_OPTION_FIXTURES: CreateVoiceModelOptionInput[] = [
  { name: "gemini-2.0-flash-live-001", modelType: "s2s", isBuiltIn: true },
  { name: "gpt-realtime", modelType: "s2s", isBuiltIn: true },
  { name: "gpt-realtime-mini", modelType: "s2s", isBuiltIn: true },
  { name: "gpt-4o", modelType: "llm", isBuiltIn: true },
  { name: "gpt-4o-mini", modelType: "llm", isBuiltIn: true },
  { name: "gemini-2.0-flash-001", modelType: "llm", isBuiltIn: true },
];
