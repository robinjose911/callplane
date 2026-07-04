import { type PrismaClient, type VoiceModelOption, type VoiceModelType } from "@prisma/client";

export interface CreateVoiceModelOptionInput {
  name: string;
  modelType: VoiceModelType;
  isBuiltIn?: boolean;
}

export function createVoiceModelOptionRepository(prisma: PrismaClient) {
  return {
    async listByType(modelType: VoiceModelType): Promise<VoiceModelOption[]> {
      return prisma.voiceModelOption.findMany({ where: { modelType }, orderBy: { name: "asc" } });
    },

    async listAll(): Promise<VoiceModelOption[]> {
      return prisma.voiceModelOption.findMany({ orderBy: [{ modelType: "asc" }, { name: "asc" }] });
    },

    /** Throws Prisma P2002 if the (name, modelType) pair already exists. */
    async create(input: CreateVoiceModelOptionInput): Promise<VoiceModelOption> {
      return prisma.voiceModelOption.create({ data: input });
    },

    /** Idempotent — used by the "Add custom model" affordance so re-adding an existing name is a no-op, not an error. */
    async upsertByNameAndType(input: CreateVoiceModelOptionInput): Promise<VoiceModelOption> {
      return prisma.voiceModelOption.upsert({
        where: { name_modelType: { name: input.name, modelType: input.modelType } },
        create: input,
        update: {},
      });
    },
  };
}

export type VoiceModelOptionRepository = ReturnType<typeof createVoiceModelOptionRepository>;
