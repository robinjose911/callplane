import type { CreateWebhookEndpointInput } from "../repositories/webhook-endpoint.repository.js";

export const WEBHOOK_ENDPOINT_NAMES = {
  DEFAULT: "default-e2e-receiver",
} as const;

/** Points at the e2e webhook receiver (Stage 8). Disabled by default — never fires in earlier stages. */
export const WEBHOOK_ENDPOINT_FIXTURES: CreateWebhookEndpointInput[] = [
  {
    name: WEBHOOK_ENDPOINT_NAMES.DEFAULT,
    url: "http://localhost:4999/webhook",
    secret: "stub-webhook-secret-for-e2e-only",
    isEnabled: false,
    eventTypes: ["post_call_transcription", "call_initiation_failure"],
  },
];
