import {
  type PrismaClient,
  type AgentConfig,
  type VoiceMode,
  type S2sProvider,
  type SttProvider,
  type LlmProvider,
  type TtsProvider,
  type ReasoningEffort,
} from "@prisma/client";

export interface CreateAgentConfigInput {
  name: string;
  voiceMode: VoiceMode;
  s2sProvider?: S2sProvider;
  s2sModel?: string;
  sttProvider?: SttProvider;
  llmProvider?: LlmProvider;
  llmModel?: string;
  ttsProvider?: TtsProvider;
  ttsVoiceId?: string;
  reasoningEffort?: ReasoningEffort;
  prompt: string;
  enableShortFirstResponse?: boolean;
  languageProfileId?: string;
  isActive?: boolean;
}

export interface UpdateAgentConfigInput {
  voiceMode?: VoiceMode;
  s2sProvider?: S2sProvider | null;
  s2sModel?: string | null;
  sttProvider?: SttProvider | null;
  llmProvider?: LlmProvider | null;
  llmModel?: string | null;
  ttsProvider?: TtsProvider | null;
  ttsVoiceId?: string | null;
  reasoningEffort?: ReasoningEffort | null;
  prompt?: string;
  enableShortFirstResponse?: boolean;
  languageProfileId?: string | null;
  isActive?: boolean;
}

export function createAgentConfigRepository(prisma: PrismaClient) {
  return {
    /** All agent configs, ordered by name. */
    async listAll(): Promise<AgentConfig[]> {
      return prisma.agentConfig.findMany({ orderBy: { name: "asc" } });
    },

    /** Look up a config by its human-readable name (the "agentId" used everywhere else). */
    async findByName(name: string): Promise<AgentConfig | null> {
      return prisma.agentConfig.findUnique({ where: { name } });
    },

    /** Throws Prisma P2002 if `name` already exists. */
    async create(input: CreateAgentConfigInput): Promise<AgentConfig> {
      return prisma.agentConfig.create({ data: input });
    },

    /** Upsert-by-name — used by the idempotent seed. */
    async upsertByName(name: string, input: CreateAgentConfigInput): Promise<AgentConfig> {
      return prisma.agentConfig.upsert({
        where: { name },
        create: input,
        update: input,
      });
    },

    /** Throws Prisma P2025 if `name` does not exist. */
    async update(name: string, input: UpdateAgentConfigInput): Promise<AgentConfig> {
      return prisma.agentConfig.update({ where: { name }, data: input });
    },

    /** Throws Prisma P2025 if `name` does not exist. */
    async delete(name: string): Promise<AgentConfig> {
      return prisma.agentConfig.delete({ where: { name } });
    },
  };
}

export type AgentConfigRepository = ReturnType<typeof createAgentConfigRepository>;
