import { type PrismaClient, type CallEvent, Prisma } from "@prisma/client";

export interface AppendCallEventInput {
  callSid: string;
  eventType: string;
  payload?: Record<string, unknown>;
}

/** CallEvent is append-only — this repository exposes no update/delete path. */
export function createCallEventRepository(prisma: PrismaClient) {
  return {
    async append(input: AppendCallEventInput): Promise<CallEvent> {
      return prisma.callEvent.create({
        data: {
          callSid: input.callSid,
          eventType: input.eventType,
          payload: input.payload !== undefined ? (input.payload as Prisma.InputJsonValue) : Prisma.DbNull,
        },
      });
    },

    /** Events for a call, in chronological (append) order. Returns all when no page is given. */
    async findBySid(callSid: string, page?: { limit: number; offset: number }): Promise<CallEvent[]> {
      return prisma.callEvent.findMany({
        where: { callSid },
        orderBy: { createdAt: "asc" },
        ...(page !== undefined ? { take: page.limit, skip: page.offset } : {}),
      });
    },
  };
}

export type CallEventRepository = ReturnType<typeof createCallEventRepository>;
