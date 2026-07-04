import { type PrismaClient, type SipTrunk, type SipTrunkProvider } from "@prisma/client";

export interface CreateSipTrunkInput {
  name: string;
  provider: SipTrunkProvider;
  livekitTrunkId: string;
  credentialsRef: string;
  maxConcurrentCalls?: number;
  weight?: number;
  isActive?: boolean;
}

export interface UpdateSipTrunkInput {
  provider?: SipTrunkProvider;
  livekitTrunkId?: string;
  credentialsRef?: string;
  maxConcurrentCalls?: number;
  weight?: number;
  isActive?: boolean;
}

export function createSipTrunkRepository(prisma: PrismaClient) {
  return {
    async listAll(): Promise<SipTrunk[]> {
      return prisma.sipTrunk.findMany({ orderBy: { name: "asc" } });
    },

    async listActive(): Promise<SipTrunk[]> {
      return prisma.sipTrunk.findMany({ where: { isActive: true }, orderBy: { weight: "desc" } });
    },

    async findByName(name: string): Promise<SipTrunk | null> {
      return prisma.sipTrunk.findUnique({ where: { name } });
    },

    async create(input: CreateSipTrunkInput): Promise<SipTrunk> {
      return prisma.sipTrunk.create({ data: input });
    },

    async upsertByName(name: string, input: CreateSipTrunkInput): Promise<SipTrunk> {
      return prisma.sipTrunk.upsert({ where: { name }, create: input, update: input });
    },

    async update(name: string, input: UpdateSipTrunkInput): Promise<SipTrunk> {
      return prisma.sipTrunk.update({ where: { name }, data: input });
    },

    async setActive(name: string, isActive: boolean): Promise<SipTrunk> {
      return prisma.sipTrunk.update({ where: { name }, data: { isActive } });
    },
  };
}

export type SipTrunkRepository = ReturnType<typeof createSipTrunkRepository>;
