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

    /** All cost rows, most recent first — capped at 500 for the console's aggregate dashboard. */
    async listRecent(): Promise<CallCost[]> {
      return prisma.callCost.findMany({ orderBy: { createdAt: "desc" }, take: 500 });
    },
  };
}

export type CallCostRepository = ReturnType<typeof createCallCostRepository>;
