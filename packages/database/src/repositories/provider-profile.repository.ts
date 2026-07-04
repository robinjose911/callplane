import {
  type PrismaClient,
  type ProviderProfile,
  type ProviderType,
  type ProviderPriority,
} from "@prisma/client";

export interface CreateProviderProfileInput {
  providerType: ProviderType;
  name: string;
  priority: ProviderPriority;
  credentialsRef: string;
  isActive?: boolean;
}

export interface UpdateProviderProfileInput {
  providerType?: ProviderType;
  name?: string;
  priority?: ProviderPriority;
  credentialsRef?: string;
  isActive?: boolean;
}

export function createProviderProfileRepository(prisma: PrismaClient) {
  return {
    async listAll(): Promise<ProviderProfile[]> {
      return prisma.providerProfile.findMany({ orderBy: [{ providerType: "asc" }, { priority: "asc" }] });
    },

    async listByType(providerType: ProviderType): Promise<ProviderProfile[]> {
      return prisma.providerProfile.findMany({
        where: { providerType, isActive: true },
        orderBy: { priority: "asc" },
      });
    },

    async findById(id: string): Promise<ProviderProfile | null> {
      return prisma.providerProfile.findUnique({ where: { id } });
    },

    async create(input: CreateProviderProfileInput): Promise<ProviderProfile> {
      return prisma.providerProfile.create({ data: input });
    },

    async update(id: string, input: UpdateProviderProfileInput): Promise<ProviderProfile> {
      return prisma.providerProfile.update({ where: { id }, data: input });
    },
  };
}

export type ProviderProfileRepository = ReturnType<typeof createProviderProfileRepository>;
