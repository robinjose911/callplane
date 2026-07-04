import { type PrismaClient, type CallCost } from "@prisma/client";

export interface CreateCallCostInput {
  callSid: string;
  provider: string;
  providerType: string;
  units: number;
  unitType: string;
  costAmount: number;
  currency?: string;
}

export function createCallCostRepository(prisma: PrismaClient) {
  return {
    async create(input: CreateCallCostInput): Promise<CallCost> {
      return prisma.callCost.create({ data: input });
    },

    async findByCallSid(callSid: string): Promise<CallCost[]> {
      return prisma.callCost.findMany({ where: { callSid }, orderBy: { createdAt: "asc" } });
    },
  };
}

export type CallCostRepository = ReturnType<typeof createCallCostRepository>;
