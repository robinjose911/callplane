import { type PrismaClient, type LanguageProfile } from "@prisma/client";

export interface CreateLanguageProfileInput {
  languageCode: string;
  systemPromptPrefix: string;
  defaultTtsVoiceId?: string;
  defaultSttLanguageCode?: string;
}

export interface UpdateLanguageProfileInput {
  systemPromptPrefix?: string;
  defaultTtsVoiceId?: string | null;
  defaultSttLanguageCode?: string | null;
}

export function createLanguageProfileRepository(prisma: PrismaClient) {
  return {
    async listAll(): Promise<LanguageProfile[]> {
      return prisma.languageProfile.findMany({ orderBy: { languageCode: "asc" } });
    },

    async findByLanguageCode(languageCode: string): Promise<LanguageProfile | null> {
      return prisma.languageProfile.findUnique({ where: { languageCode } });
    },

    async create(input: CreateLanguageProfileInput): Promise<LanguageProfile> {
      return prisma.languageProfile.create({ data: input });
    },

    async upsertByLanguageCode(
      languageCode: string,
      input: CreateLanguageProfileInput,
    ): Promise<LanguageProfile> {
      return prisma.languageProfile.upsert({ where: { languageCode }, create: input, update: input });
    },

    async update(languageCode: string, input: UpdateLanguageProfileInput): Promise<LanguageProfile> {
      return prisma.languageProfile.update({ where: { languageCode }, data: input });
    },
  };
}

export type LanguageProfileRepository = ReturnType<typeof createLanguageProfileRepository>;
