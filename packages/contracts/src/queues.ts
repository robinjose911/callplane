import type { Channel } from "./calls.js";

/**
 * Queue job data types, shared between the API (producer) and worker (consumer). Import in
 * both apps so a payload shape change is a compile error on both sides of the queue boundary.
 */

/** Enqueued by the API into the `call-executor` BullMQ queue (always via the prefixed factory). */
export interface CallExecutorJobData {
  callSid: string;
  agentId: string;
  channel: Channel;
  toNumber: string | null;
  scenario: string | null;
  dynamicVariables: Record<string, unknown>;
}

/** Enqueued by the call-executor into the `webhook-dispatcher` BullMQ queue. */
export interface WebhookDispatcherJobData {
  webhookOutboxId: string;
  callSid: string;
}
