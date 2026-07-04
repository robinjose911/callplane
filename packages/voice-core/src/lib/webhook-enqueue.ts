import type { Call, CallEvent, WebhookEndpointRepository, WebhookOutboxRepository } from "@callplane/database";
import { buildWebhookIdempotencyKey, type WebhookDispatcherJobData, type WebhookEventType } from "@callplane/contracts";
import type { Queue } from "bullmq";
import { mapCallOutcomeToWebhookPayload } from "./outcome-mapper.js";

export interface WebhookEnqueueDeps {
  webhookEndpointRepo: WebhookEndpointRepository;
  webhookOutboxRepo: WebhookOutboxRepository;
  webhookDispatcherQueue: Queue<WebhookDispatcherJobData>;
}

/**
 * Called once a call reaches a terminal status: maps the outcome to a webhook payload, then
 * creates one outbox row per enabled endpoint subscribed to that event type and enqueues its
 * dispatch job. A no-op for a non-terminal call (`mapCallOutcomeToWebhookPayload` returns
 * `undefined`) or when no endpoint is subscribed. Idempotent — `webhookOutboxRepo.create()`'s
 * unique `idempotencyKey` means calling this twice for the same call (e.g. a retried job) never
 * creates a duplicate outbox row or double-enqueues a dispatch job.
 */
export async function enqueueWebhooksForCall(call: Call, events: CallEvent[], deps: WebhookEnqueueDeps): Promise<void> {
  const payload = mapCallOutcomeToWebhookPayload(call, events);
  if (!payload) return;

  const endpoints = await deps.webhookEndpointRepo.listAll();
  const subscribed = endpoints.filter(
    (endpoint) => endpoint.isEnabled && endpoint.eventTypes.includes(payload.type as WebhookEventType),
  );

  for (const endpoint of subscribed) {
    // buildWebhookIdempotencyKey's documented "<callSid>:<eventType>" format has no endpoint
    // discriminator — fine for exactly one subscribed endpoint, but with N endpoints subscribed
    // to the same event type, N `create()` calls would collide on the same key and only the
    // first endpoint's outbox row would ever be created (the rest silently return that same
    // row via the unique-constraint fallback, never dispatching to their own endpoint). Appending
    // the endpoint id keeps exactly-once-per-(call, event type) delivery, but per endpoint.
    const idempotencyKey = `${buildWebhookIdempotencyKey(call.callSid, payload.type)}:${endpoint.id}`;
    const { outbox, inserted } = await deps.webhookOutboxRepo.create({
      callSid: call.callSid,
      webhookEndpointId: endpoint.id,
      eventType: payload.type,
      payload,
      idempotencyKey,
    });

    if (inserted) {
      await deps.webhookDispatcherQueue.add(
        "webhook-dispatcher",
        { webhookOutboxId: outbox.id, callSid: call.callSid },
        { jobId: outbox.id },
      );
    }
  }
}
