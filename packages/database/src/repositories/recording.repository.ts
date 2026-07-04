import { type PrismaClient, type Recording } from "@prisma/client";

export interface CreateRecordingInput {
  callSid: string;
  storagePath: string;
  durationSeconds?: number;
  sizeBytes?: bigint;
}

export function createRecordingRepository(prisma: PrismaClient) {
  return {
    async create(input: CreateRecordingInput): Promise<Recording> {
      return prisma.recording.create({ data: input });
    },

    async findByCallSid(callSid: string): Promise<Recording | null> {
      return prisma.recording.findUnique({ where: { callSid } });
    },
  };
}

export type RecordingRepository = ReturnType<typeof createRecordingRepository>;
