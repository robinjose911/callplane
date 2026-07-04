/**
 * @callplane/database
 *
 * Prisma ORM client, repository factories, and generated types for the `callplane` schema.
 *
 * Usage:
 *   import { prisma, createCallRepository } from "@callplane/database";
 *   const callRepo = createCallRepository(prisma);
 */

export { PrismaClient } from "@prisma/client";

// ─── Singleton Prisma Client ──────────────────────────────────────────────────
// Prevents multiple PrismaClient instances during hot-reload; each app (api, worker) imports
// this shared instance.

import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env["NODE_ENV"] === "production" ? ["error"] : ["error", "warn"],
  });

if (process.env["NODE_ENV"] !== "production") {
  globalForPrisma.prisma = prisma;
}

// ─── Error helpers ─────────────────────────────────────────────────────────────

export { isNotFoundError, isUniqueConstraintError } from "./lib/prisma-errors.js";

// ─── Repository factories ──────────────────────────────────────────────────────

export {
  createAgentConfigRepository,
  type AgentConfigRepository,
  type CreateAgentConfigInput,
  type UpdateAgentConfigInput,
} from "./repositories/agent-config.repository.js";

export {
  createCallRepository,
  type CallRepository,
  type CreateCallInput,
  type CallListFilter,
} from "./repositories/call.repository.js";

export {
  createCallEventRepository,
  type CallEventRepository,
  type AppendCallEventInput,
} from "./repositories/call-event.repository.js";

export {
  createSipTrunkRepository,
  type SipTrunkRepository,
  type CreateSipTrunkInput,
  type UpdateSipTrunkInput,
} from "./repositories/sip-trunk.repository.js";

export {
  createProviderProfileRepository,
  type ProviderProfileRepository,
  type CreateProviderProfileInput,
  type UpdateProviderProfileInput,
} from "./repositories/provider-profile.repository.js";

export {
  createLanguageProfileRepository,
  type LanguageProfileRepository,
  type CreateLanguageProfileInput,
  type UpdateLanguageProfileInput,
} from "./repositories/language-profile.repository.js";

export {
  createWebhookEndpointRepository,
  type WebhookEndpointRepository,
  type CreateWebhookEndpointInput,
  type UpdateWebhookEndpointInput,
} from "./repositories/webhook-endpoint.repository.js";

export {
  createWebhookOutboxRepository,
  type WebhookOutboxRepository,
  type CreateWebhookOutboxInput,
  type WebhookOutboxCreateResult,
} from "./repositories/webhook-outbox.repository.js";

export {
  createCallCostRepository,
  type CallCostRepository,
  type CreateCallCostInput,
} from "./repositories/call-cost.repository.js";

export {
  createPriceTableRepository,
  type PriceTableRepository,
  type UpsertPriceInput,
} from "./repositories/price-table.repository.js";

export {
  createRecordingRepository,
  type RecordingRepository,
  type CreateRecordingInput,
} from "./repositories/recording.repository.js";

// ─── Re-exported Prisma types ───────────────────────────────────────────────────

export type {
  AgentConfig,
  Call,
  CallEvent,
  SipTrunk,
  ProviderProfile,
  LanguageProfile,
  WebhookEndpoint,
  WebhookOutbox,
  CallCost,
  PriceTable,
  Recording,
} from "@prisma/client";

export {
  VoiceMode,
  S2sProvider,
  SttProvider,
  LlmProvider,
  TtsProvider,
  ReasoningEffort,
  Channel,
  CallStatus,
  SipTrunkProvider,
  ProviderType,
  ProviderPriority,
  WebhookEventType,
  WebhookDeliveryStatus,
} from "@prisma/client";

// ─── Seed fixtures ──────────────────────────────────────────────────────────────
// Single source of truth for fixture names/ids — specs import these constants rather than
// hardcoding strings, so a rename here can't silently desync a spec.

export { AGENT_CONFIG_NAMES, AGENT_CONFIG_FIXTURES } from "./fixtures/agent-configs.js";
export { SIP_TRUNK_NAMES, SIP_TRUNK_FIXTURES } from "./fixtures/sip-trunks.js";
export { LANGUAGE_PROFILE_FIXTURES } from "./fixtures/language-profiles.js";
export { WEBHOOK_ENDPOINT_NAMES, WEBHOOK_ENDPOINT_FIXTURES } from "./fixtures/webhook-endpoint.js";
export { PRICE_TABLE_FIXTURES } from "./fixtures/price-table.js";
export { STUB_SCENARIO_NAMES, STUB_SCENARIOS } from "./fixtures/stub-scenarios.js";
export { seed } from "./seed.js";
