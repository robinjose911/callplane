import express, { type Express } from "express";
import type { Queue } from "bullmq";
import type { CallExecutorJobData } from "@callplane/contracts";
import {
  createAgentConfigRepository,
  createCallEventRepository,
  createCallRepository,
  createSipTrunkRepository,
  prisma,
  type SipTrunkRepository,
} from "@callplane/database";
import { createQueue } from "@callplane/voice-core";
import { healthRouter } from "./routes/health.js";
import { agentsRouter } from "./routes/agents.js";
import { createCallsRouter, type CallsRouterDeps } from "./routes/calls.js";
import { createTrunksRouter } from "./routes/trunks.js";
import { errorHandler } from "./middleware/error-handler.js";

export interface CreateAppOverrides {
  agentConfigRepo?: CallsRouterDeps["agentConfigRepo"];
  callRepo?: CallsRouterDeps["callRepo"];
  callEventRepo?: CallsRouterDeps["callEventRepo"];
  /** A resolved queue instance (e.g. a mock) — bypasses the lazy real-Redis default entirely. */
  callExecutorQueue?: Queue<CallExecutorJobData>;
  sipTrunkRepo?: SipTrunkRepository;
}

let defaultCallExecutorQueue: Queue<CallExecutorJobData> | undefined;

/**
 * Constructed lazily so routes/tests that never POST /v1/calls (health, agents) never open a
 * real Redis connection just because createApp() was called — this queue is only touched the
 * first time a request actually reaches the calls router's POST handler.
 */
function getDefaultCallExecutorQueue(): Queue<CallExecutorJobData> {
  defaultCallExecutorQueue ??= createQueue<CallExecutorJobData>("call-executor");
  return defaultCallExecutorQueue;
}

export function createApp(overrides?: CreateAppOverrides): Express {
  const app = express();
  app.use(express.json());
  app.use(healthRouter);
  app.use(agentsRouter);
  app.use(
    createCallsRouter({
      agentConfigRepo: overrides?.agentConfigRepo ?? createAgentConfigRepository(prisma),
      callRepo: overrides?.callRepo ?? createCallRepository(prisma),
      callEventRepo: overrides?.callEventRepo ?? createCallEventRepository(prisma),
      getCallExecutorQueue: () => overrides?.callExecutorQueue ?? getDefaultCallExecutorQueue(),
    }),
  );
  app.use(createTrunksRouter(overrides?.sipTrunkRepo ?? createSipTrunkRepository(prisma)));
  app.use(errorHandler);
  return app;
}
