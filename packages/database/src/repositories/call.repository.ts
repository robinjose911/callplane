import { type PrismaClient, type Call, type Channel, type CallStatus, Prisma } from "@prisma/client";

export interface CreateCallInput {
  callSid: string;
  agentId: string;
  channel: Channel;
  toNumber?: string;
  scenario?: string;
  dynamicVariables?: Record<string, unknown>;
  idempotencyKey?: string;
}

export interface CallListFilter {
  status?: CallStatus;
  limit?: number;
  offset?: number;
}

export function createCallRepository(prisma: PrismaClient) {
  return {
    async create(input: CreateCallInput): Promise<Call> {
      return prisma.call.create({
        data: {
          callSid: input.callSid,
          agentId: input.agentId,
          channel: input.channel,
          toNumber: input.toNumber ?? null,
          scenario: input.scenario ?? null,
          dynamicVariables:
            input.dynamicVariables !== undefined
              ? (input.dynamicVariables as Prisma.InputJsonValue)
              : Prisma.DbNull,
          idempotencyKey: input.idempotencyKey ?? null,
        },
      });
    },

    async findBySid(callSid: string): Promise<Call | null> {
      return prisma.call.findUnique({ where: { callSid } });
    },

    /** Non-terminal call matching the same idempotency key within the window (see calls.ts contract). */
    async findActiveByIdempotencyKey(idempotencyKey: string): Promise<Call | null> {
      return prisma.call.findUnique({ where: { idempotencyKey } });
    },

    async updateStatus(callSid: string, status: CallStatus): Promise<Call> {
      return prisma.call.update({ where: { callSid }, data: { status } });
    },

    /** Clears the idempotency key once a call reaches a terminal status, freeing it for reuse. */
    async clearIdempotencyKey(callSid: string): Promise<Call> {
      return prisma.call.update({ where: { callSid }, data: { idempotencyKey: null } });
    },

    async list(filter: CallListFilter = {}): Promise<Call[]> {
      return prisma.call.findMany({
        ...(filter.status !== undefined ? { where: { status: filter.status } } : {}),
        orderBy: { createdAt: "desc" },
        take: filter.limit ?? 50,
        skip: filter.offset ?? 0,
      });
    },
  };
}

export type CallRepository = ReturnType<typeof createCallRepository>;
