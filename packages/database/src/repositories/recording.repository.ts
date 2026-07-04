import { Prisma, type PrismaClient, type Recording } from "@prisma/client";

export interface CreateRecordingInput {
  callSid: string;
  storagePath: string;
  durationSeconds?: number;
  sizeBytes?: bigint;
}

export function createRecordingRepository(prisma: PrismaClient) {
  return {
    /**
     * Idempotent on `callSid` (its @unique column) — two concurrent redeliveries of the same
     * terminal-call job (e.g. a BullMQ retry) both attempting to insert a Recording row is a
     * benign race, not a real conflict, so a P2002 here returns the row that won instead of
     * throwing (matches webhook-outbox.repository.ts's create() convention).
     */
    async create(input: CreateRecordingInput): Promise<Recording> {
      try {
        return await prisma.recording.create({ data: input });
      } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
          const existing = await prisma.recording.findUnique({ where: { callSid: input.callSid } });
          if (existing) return existing;
        }
        throw e;
      }
    },

    async findByCallSid(callSid: string): Promise<Recording | null> {
      return prisma.recording.findUnique({ where: { callSid } });
    },
  };
}

export type RecordingRepository = ReturnType<typeof createRecordingRepository>;
