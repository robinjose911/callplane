import express, { type Express } from "express";
import type { Queue } from "bullmq";
import type { CallExecutorJobData } from "@callplane/contracts";
import { createAgentConfigRepository, createCallEventRepository, createCallRepository, prisma } from "@callplane/database";
import { createQueue } from "@callplane/voice-core";
import { healthRouter } from "./routes/health.js";
import { agentsRouter } from "./routes/agents.js";
import { createCallsRouter, type CallsRouterDeps } from "./routes/calls.js";

let defaultCallExecutorQueue: Queue<CallExecutorJobData> | undefined;

function getDefaultCallExecutorQueue(): Queue<CallExecutorJobData> {
  defaultCallExecutorQueue ??= createQueue<CallExecutorJobData>("call-executor");
  return defaultCallExecutorQueue;
}

export function createApp(callsRouterDeps?: Partial<CallsRouterDeps>): Express {
  const app = express();
  app.use(express.json());
  app.use(healthRouter);
  app.use(agentsRouter);
  app.use(
    createCallsRouter({
      agentConfigRepo: callsRouterDeps?.agentConfigRepo ?? createAgentConfigRepository(prisma),
      callRepo: callsRouterDeps?.callRepo ?? createCallRepository(prisma),
      callEventRepo: callsRouterDeps?.callEventRepo ?? createCallEventRepository(prisma),
      callExecutorQueue: callsRouterDeps?.callExecutorQueue ?? getDefaultCallExecutorQueue(),
    }),
  );
  return app;
}
