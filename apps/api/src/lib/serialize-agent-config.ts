import type { AgentConfig } from "@callplane/database";
import type { AgentConfigResponse } from "@callplane/contracts";

/** Maps a Prisma AgentConfig row to the wire shape (Date -> ISO string). */
export function serializeAgentConfig(config: AgentConfig): AgentConfigResponse {
  return {
    id: config.id,
    name: config.name,
    voiceMode: config.voiceMode,
    s2sProvider: config.s2sProvider,
    s2sModel: config.s2sModel,
    sttProvider: config.sttProvider,
    llmProvider: config.llmProvider,
    llmModel: config.llmModel,
    ttsProvider: config.ttsProvider,
    ttsVoiceId: config.ttsVoiceId,
    reasoningEffort: config.reasoningEffort,
    prompt: config.prompt,
    languageProfileId: config.languageProfileId,
    isActive: config.isActive,
    createdAt: config.createdAt.toISOString(),
    updatedAt: config.updatedAt.toISOString(),
  };
}
