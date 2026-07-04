import express, { type Express } from "express";
import type { Queue } from "bullmq";
import type { CallExecutorJobData, WebhookDispatcherJobData } from "@callplane/contracts";
import {
  createAgentConfigRepository,
  createCallCostRepository,
  createCallEventRepository,
  createCallRepository,
  createPriceTableRepository,
  createRecordingRepository,
  createSipTrunkRepository,
  createWebhookEndpointRepository,
  createWebhookOutboxRepository,
  prisma,
  type SipTrunkRepository,
} from "@callplane/database";
import { createLocalDiskAdapter, createQueue, type StorageAdapter } from "@callplane/voice-core";
import { healthRouter } from "./routes/health.js";
import { agentsRouter } from "./routes/agents.js";
import { modelOptionsRouter } from "./routes/model-options.js";
import { languageProfilesRouter } from "./routes/language-profiles.js";
import { createCallsRouter, type CallsRouterDeps } from "./routes/calls.js";
import { createTrunksRouter } from "./routes/trunks.js";
import { createWebhooksRouter } from "./routes/webhooks.js";
import { createPriceTableRouter } from "./routes/price-table.js";
import { errorHandler } from "./middleware/error-handler.js";

export interface CreateAppOverrides {
  agentConfigRepo?: CallsRouterDeps["agentConfigRepo"];
  callRepo?: CallsRouterDeps["callRepo"];
  callEventRepo?: CallsRouterDeps["callEventRepo"];
  /** A resolved queue instance (e.g. a mock) — bypasses the lazy real-Redis default entirely. */
  callExecutorQueue?: Queue<CallExecutorJobData>;
  webhookDispatcherQueue?: Queue<WebhookDispatcherJobData>;
  sipTrunkRepo?: SipTrunkRepository;
  storageAdapter?: StorageAdapter;
}

let defaultCallExecutorQueue: Queue<CallExecutorJobData> | undefined;
let defaultWebhookDispatcherQueue: Queue<WebhookDispatcherJobData> | undefined;

/**
 * Constructed lazily so routes/tests that never POST /v1/calls (health, agents) never open a
 * real Redis connection just because createApp() was called — this queue is only touched the
 * first time a request actually reaches the calls router's POST handler.
 */
function getDefaultCallExecutorQueue(): Queue<CallExecutorJobData> {
  defaultCallExecutorQueue ??= createQueue<CallExecutorJobData>("call-executor");
  return defaultCallExecutorQueue;
}

/** Same lazy-construction reasoning as the call-executor queue above, for the replay route. */
function getDefaultWebhookDispatcherQueue(): Queue<WebhookDispatcherJobData> {
  defaultWebhookDispatcherQueue ??= createQueue<WebhookDispatcherJobData>("webhook-dispatcher");
  return defaultWebhookDispatcherQueue;
}

let defaultStorageAdapter: StorageAdapter | undefined;

/**
 * Lazily constructed, and reads RECORDINGS_DIR at call time rather than at module load — a test
 * that sets process.env["RECORDINGS_DIR"] in beforeAll and then calls createApp() needs this to
 * see that value; a module-level `const` evaluated on import would have already baked in
 * whatever was set (or unset) before the test file's imports ran.
 */
function getDefaultStorageAdapter(): StorageAdapter {
  defaultStorageAdapter ??= createLocalDiskAdapter(process.env["RECORDINGS_DIR"] ?? "./data/recordings");
  return defaultStorageAdapter;
}

export function createApp(overrides?: CreateAppOverrides): Express {
  const app = express();
  app.use(express.json());
  app.use(healthRouter);
  app.use(agentsRouter);
  app.use(modelOptionsRouter);
  app.use(languageProfilesRouter);
  app.use(
    createCallsRouter({
      agentConfigRepo: overrides?.agentConfigRepo ?? createAgentConfigRepository(prisma),
      callRepo: overrides?.callRepo ?? createCallRepository(prisma),
      callEventRepo: overrides?.callEventRepo ?? createCallEventRepository(prisma),
      callCostRepo: createCallCostRepository(prisma),
      webhookOutboxRepo: createWebhookOutboxRepository(prisma),
      recordingRepo: createRecordingRepository(prisma),
      storageAdapter: overrides?.storageAdapter ?? getDefaultStorageAdapter(),
      getCallExecutorQueue: () => overrides?.callExecutorQueue ?? getDefaultCallExecutorQueue(),
    }),
  );
  app.use(createTrunksRouter(overrides?.sipTrunkRepo ?? createSipTrunkRepository(prisma)));
  app.use(
    createWebhooksRouter({
      webhookEndpointRepo: createWebhookEndpointRepository(prisma),
      webhookOutboxRepo: createWebhookOutboxRepository(prisma),
      getWebhookDispatcherQueue: () => overrides?.webhookDispatcherQueue ?? getDefaultWebhookDispatcherQueue(),
    }),
  );
  app.use(createPriceTableRouter(createPriceTableRepository(prisma)));
  app.use(errorHandler);
  return app;
}
