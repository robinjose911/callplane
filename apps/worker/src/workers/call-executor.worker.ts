import {
  isValidStatusTransition,
  TERMINAL_CALL_STATUSES,
  type CallExecutorJobData,
  type CallStatus,
  type WebhookDispatcherJobData,
} from "@callplane/contracts";
import {
  createCallEventRepository,
  createCallRepository,
  createSipTrunkRepository,
  createWebhookEndpointRepository,
  createWebhookOutboxRepository,
  prisma,
  STUB_SCENARIOS,
} from "@callplane/database";
import type { Worker } from "bullmq";
import {
  createChildLogger,
  createQueue,
  createWorker,
  buildCallRunner,
  enqueueWebhooksForCall,
  type CallRunner,
} from "@callplane/voice-core";

const logger = createChildLogger({ worker: "callExecutor" });

const callRepo = createCallRepository(prisma);
const callEventRepo = createCallEventRepository(prisma);
const sipTrunkRepo = createSipTrunkRepository(prisma);
const webhookEndpointRepo = createWebhookEndpointRepository(prisma);
const webhookOutboxRepo = createWebhookOutboxRepository(prisma);
const webhookDispatcherQueue = createQueue<WebhookDispatcherJobData>("webhook-dispatcher");

export class IllegalTransitionError extends Error {
  constructor(from: CallStatus, to: CallStatus) {
    super(`Illegal call status transition: ${from} -> ${to}`);
    this.name = "IllegalTransitionError";
  }
}

/**
 * The `call-executor` job processor — extracted as a standalone function so unit tests can
 * call it directly against real repositories without a live BullMQ/Redis connection.
 */
export async function processCallExecutorJob(
  data: CallExecutorJobData,
  runner?: CallRunner,
): Promise<void> {
  const call = await callRepo.findBySid(data.callSid);
  if (!call) {
    logger.warn({ callSid: data.callSid }, "call-executor: call not found, skipping");
    return;
  }

  if ((TERMINAL_CALL_STATUSES as readonly CallStatus[]).includes(call.status)) {
    logger.info({ callSid: call.callSid, status: call.status }, "call-executor: stale job, already terminal, no-op");
    return;
  }

  let currentStatus: CallStatus = call.status;
  const scenario = data.scenario ? STUB_SCENARIOS[data.scenario] : undefined;

  try {
    const activeRunner = runner ?? (await buildCallRunner(data, { sipTrunkRepo }));

    await activeRunner.run(scenario, async (transition) => {
      await callEventRepo.append({
        callSid: call.callSid,
        eventType: transition.eventType,
        ...(transition.payload !== undefined ? { payload: transition.payload } : {}),
      });

      if (transition.status !== undefined && transition.status !== currentStatus) {
        if (!isValidStatusTransition(currentStatus, transition.status)) {
          throw new IllegalTransitionError(currentStatus, transition.status);
        }
        await callRepo.updateStatus(call.callSid, transition.status);
        currentStatus = transition.status;
      }
    });
  } catch (error) {
    logger.error({ callSid: call.callSid, err: error }, "call-executor: runner failed");
    await callEventRepo.append({
      callSid: call.callSid,
      eventType: "call_failed",
      payload: { error: error instanceof Error ? error.message : String(error) },
    });
    if (isValidStatusTransition(currentStatus, "FAILED")) {
      await callRepo.updateStatus(call.callSid, "FAILED");
      currentStatus = "FAILED";
    }
    throw error;
  } finally {
    // Runs whether the runner succeeded or threw — a FAILED call needs its
    // call_initiation_failure webhook exactly as much as a COMPLETED one needs its
    // post_call_transcription webhook. enqueueWebhooksForCall no-ops for a non-terminal status.
    if ((TERMINAL_CALL_STATUSES as readonly CallStatus[]).includes(currentStatus)) {
      const [finalCall, events] = await Promise.all([
        callRepo.findBySid(call.callSid),
        callEventRepo.findBySid(call.callSid),
      ]);
      if (finalCall) {
        await enqueueWebhooksForCall(finalCall, events, {
          webhookEndpointRepo,
          webhookOutboxRepo,
          webhookDispatcherQueue,
        }).catch((err: unknown) => {
          logger.error({ callSid: call.callSid, err }, "call-executor: failed to enqueue webhooks");
        });
      }
    }
  }
}

export function startCallExecutorWorker(): Worker<CallExecutorJobData> {
  return createWorker<CallExecutorJobData>("call-executor", async (job) => {
    await processCallExecutorJob(job.data);
  });
}
