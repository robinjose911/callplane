import {
  type PrismaClient,
  type WebhookOutbox,
  type WebhookEventType,
  WebhookDeliveryStatus,
  Prisma,
} from "@prisma/client";

export interface CreateWebhookOutboxInput {
  callSid: string;
  webhookEndpointId: string;
  eventType: WebhookEventType;
  payload: Record<string, unknown>;
  idempotencyKey: string;
  maxRetries?: number;
}

export interface WebhookOutboxCreateResult {
  outbox: WebhookOutbox;
  /** False when this idempotency key already existed — caller should skip enqueueing a dispatch job. */
  inserted: boolean;
}

export function createWebhookOutboxRepository(prisma: PrismaClient) {
  return {
    async create(input: CreateWebhookOutboxInput): Promise<WebhookOutboxCreateResult> {
      try {
        const outbox = await prisma.webhookOutbox.create({
          data: {
            callSid: input.callSid,
            webhookEndpointId: input.webhookEndpointId,
            eventType: input.eventType,
            payload: input.payload as Prisma.InputJsonValue,
            idempotencyKey: input.idempotencyKey,
            maxRetries: input.maxRetries ?? 10,
          },
        });
        return { outbox, inserted: true };
      } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
          const existing = await prisma.webhookOutbox.findUnique({
            where: { idempotencyKey: input.idempotencyKey },
          });
          if (existing) return { outbox: existing, inserted: false };
        }
        throw e;
      }
    },

    async findPending(): Promise<WebhookOutbox[]> {
      const now = new Date();
      return prisma.webhookOutbox.findMany({
        where: {
          OR: [
            { status: WebhookDeliveryStatus.PENDING },
            { status: WebhookDeliveryStatus.RETRY_PENDING, nextRetryAt: { lte: now } },
          ],
        },
        orderBy: { createdAt: "asc" },
      });
    },

    async findById(id: string): Promise<WebhookOutbox | null> {
      return prisma.webhookOutbox.findUnique({ where: { id } });
    },

    async findByCallSid(callSid: string): Promise<WebhookOutbox[]> {
      return prisma.webhookOutbox.findMany({ where: { callSid }, orderBy: { createdAt: "asc" } });
    },

    async markDelivered(id: string): Promise<WebhookOutbox> {
      return prisma.webhookOutbox.update({ where: { id }, data: { status: WebhookDeliveryStatus.DELIVERED } });
    },

    async markDead(id: string): Promise<WebhookOutbox> {
      return prisma.webhookOutbox.update({ where: { id }, data: { status: WebhookDeliveryStatus.DEAD } });
    },

    /** Atomic increment — safe under concurrent dispatcher retries. */
    async incrementRetry(id: string, nextRetryAt: Date): Promise<WebhookOutbox> {
      return prisma.webhookOutbox.update({
        where: { id },
        data: {
          status: WebhookDeliveryStatus.RETRY_PENDING,
          retryCount: { increment: 1 },
          nextRetryAt,
        },
      });
    },

    /** Resets an entry to PENDING for manual replay — clears nextRetryAt for immediate pickup. */
    async resetForReplay(id: string): Promise<WebhookOutbox> {
      return prisma.webhookOutbox.update({
        where: { id },
        data: { status: WebhookDeliveryStatus.PENDING, nextRetryAt: null },
      });
    },
  };
}

export type WebhookOutboxRepository = ReturnType<typeof createWebhookOutboxRepository>;
