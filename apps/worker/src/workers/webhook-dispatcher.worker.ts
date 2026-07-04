import type { Worker } from "bullmq";
import type { WebhookDispatcherJobData } from "@callplane/contracts";
import { createWebhookEndpointRepository, createWebhookOutboxRepository, prisma } from "@callplane/database";
import { createChildLogger, createQueue, createWorker, signWebhookPayload } from "@callplane/voice-core";

const logger = createChildLogger({ worker: "webhookDispatcher" });

const webhookEndpointRepo = createWebhookEndpointRepository(prisma);
const webhookOutboxRepo = createWebhookOutboxRepository(prisma);
const webhookDispatcherQueue = createQueue<WebhookDispatcherJobData>("webhook-dispatcher");

/** 30s base, doubling, capped at 8h — matches CLAUDE.md's stated backoff ladder. */
const BASE_DELAY_MS = 30_000;
const MAX_DELAY_MS = 8 * 60 * 60 * 1000;

function nextBackoffMs(retryCount: number): number {
  return Math.min(BASE_DELAY_MS * 2 ** retryCount, MAX_DELAY_MS);
}

/**
 * The `webhook-dispatcher` job processor — extracted as a standalone function so unit tests can
 * call it directly against real repositories + a mocked `fetch`, without a live BullMQ/Redis
 * connection (matching call-executor.worker.ts's own test pattern).
 */
export async function processWebhookDispatcherJob(data: WebhookDispatcherJobData): Promise<void> {
  const outbox = await webhookOutboxRepo.findById(data.webhookOutboxId);
  if (!outbox) {
    logger.warn({ webhookOutboxId: data.webhookOutboxId }, "webhook-dispatcher: outbox row not found, skipping");
    return;
  }
  if (outbox.status === "DELIVERED" || outbox.status === "DEAD") {
    logger.info({ webhookOutboxId: outbox.id, status: outbox.status }, "webhook-dispatcher: already terminal, no-op");
    return;
  }

  const endpoint = await webhookEndpointRepo.findByIdWithSecret(outbox.webhookEndpointId);
  if (!endpoint || !endpoint.isEnabled) {
    logger.info({ webhookOutboxId: outbox.id }, "webhook-dispatcher: endpoint missing or disabled, skipping delivery");
    return;
  }

  const bodyString = JSON.stringify(outbox.payload);
  const timestampSeconds = Math.floor(Date.now() / 1000);
  const signature = signWebhookPayload(endpoint.secret, bodyString, timestampSeconds);

  try {
    const response = await fetch(endpoint.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "ElevenLabs-Signature": signature,
        "X-Idempotency-Key": outbox.idempotencyKey,
      },
      body: bodyString,
    });

    if (response.ok) {
      await webhookOutboxRepo.markDelivered(outbox.id);
      return;
    }
    throw new Error(`Webhook endpoint responded with HTTP ${response.status}`);
  } catch (err) {
    const attemptsSoFar = outbox.retryCount + 1;
    if (attemptsSoFar >= outbox.maxRetries) {
      logger.warn({ webhookOutboxId: outbox.id, err }, "webhook-dispatcher: max retries reached, marking DEAD");
      await webhookOutboxRepo.markDead(outbox.id);
      return;
    }

    const delayMs = nextBackoffMs(outbox.retryCount);
    const nextRetryAt = new Date(Date.now() + delayMs);
    await webhookOutboxRepo.incrementRetry(outbox.id, nextRetryAt);

    logger.warn({ webhookOutboxId: outbox.id, err, delayMs, attempt: attemptsSoFar }, "webhook-dispatcher: delivery failed, scheduling retry");
    // BullMQ rejects custom job IDs containing ":" — hyphen-delimited instead.
    await webhookDispatcherQueue.add("webhook-dispatcher", data, { delay: delayMs, jobId: `${outbox.id}-retry-${attemptsSoFar}` });
  }
}

export function startWebhookDispatcherWorker(): Worker<WebhookDispatcherJobData> {
  return createWorker<WebhookDispatcherJobData>("webhook-dispatcher", async (job) => {
    await processWebhookDispatcherJob(job.data);
  });
}
