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

    /** All events for a call, in chronological order. */
    async findBySid(callSid: string): Promise<CallEvent[]> {
      return prisma.callEvent.findMany({
        where: { callSid },
        orderBy: { createdAt: "asc" },
      });
    },
  };
}

export type CallEventRepository = ReturnType<typeof createCallEventRepository>;
