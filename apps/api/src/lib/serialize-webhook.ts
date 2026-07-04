import type { WebhookEndpoint, WebhookOutbox } from "@callplane/database";
import type { WebhookEndpointResponse, WebhookOutboxEntryResponse } from "@callplane/contracts";

/** `endpoint.secret` is already redacted to "****" by the repository — this just shapes the wire response. */
export function serializeWebhookEndpoint(endpoint: WebhookEndpoint): WebhookEndpointResponse {
  return {
    id: endpoint.id,
    name: endpoint.name,
    url: endpoint.url,
    secret: endpoint.secret,
    isEnabled: endpoint.isEnabled,
    eventTypes: endpoint.eventTypes,
    createdAt: endpoint.createdAt.toISOString(),
    updatedAt: endpoint.updatedAt.toISOString(),
  };
}

export function serializeWebhookOutboxEntry(entry: WebhookOutbox): WebhookOutboxEntryResponse {
  return {
    id: entry.id,
    callSid: entry.callSid,
    webhookEndpointId: entry.webhookEndpointId,
    eventType: entry.eventType,
    status: entry.status,
    retryCount: entry.retryCount,
    maxRetries: entry.maxRetries,
    nextRetryAt: entry.nextRetryAt?.toISOString() ?? null,
    createdAt: entry.createdAt.toISOString(),
    updatedAt: entry.updatedAt.toISOString(),
  };
}
