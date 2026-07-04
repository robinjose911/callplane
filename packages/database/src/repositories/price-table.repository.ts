import { type PrismaClient, type PriceTable } from "@prisma/client";

export interface UpsertPriceInput {
  provider: string;
  providerType: string;
  unitType: string;
  pricePerUnit: number;
  currency?: string;
}

export function createPriceTableRepository(prisma: PrismaClient) {
  return {
    async listAll(): Promise<PriceTable[]> {
      return prisma.priceTable.findMany({ orderBy: [{ providerType: "asc" }, { provider: "asc" }] });
    },

    async findByProvider(provider: string, providerType: string, unitType: string): Promise<PriceTable | null> {
      return prisma.priceTable.findUnique({
        where: { provider_providerType_unitType: { provider, providerType, unitType } },
      });
    },

    async upsert(input: UpsertPriceInput): Promise<PriceTable> {
      const key = { provider: input.provider, providerType: input.providerType, unitType: input.unitType };
      return prisma.priceTable.upsert({
        where: { provider_providerType_unitType: key },
        create: input,
        update: input,
      });
    },
  };
}

export type PriceTableRepository = ReturnType<typeof createPriceTableRepository>;
