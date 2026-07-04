import {
  isValidStatusTransition,
  TERMINAL_CALL_STATUSES,
  type CallExecutorJobData,
  type CallStatus,
} from "@callplane/contracts";
import { createCallEventRepository, createCallRepository, prisma, STUB_SCENARIOS } from "@callplane/database";
import type { Worker } from "bullmq";
import {
  createChildLogger,
  createWorker,
  createLiveKitRoomManager,
  StubCallRunner,
  RealCallRunner,
  type CallRunner,
} from "@callplane/voice-core";

const logger = createChildLogger({ worker: "callExecutor" });

const callRepo = createCallRepository(prisma);
const callEventRepo = createCallEventRepository(prisma);

export class IllegalTransitionError extends Error {
  constructor(from: CallStatus, to: CallStatus) {
    super(`Illegal call status transition: ${from} -> ${to}`);
    this.name = "IllegalTransitionError";
  }
}

/**
 * CALL_RUNNER=livekit routes through a real LiveKit room; anything else (default) stays
 * in-process. RealCallRunner only ever drives StubVoiceSession today (see its own doc comment) —
 * it has no real (non-stub) provider session wiring yet. Requiring PROVIDER_STUB_MODE=true
 * alongside CALL_RUNNER=livekit makes that limitation fail loudly instead of an operator
 * expecting real provider calls silently getting the scripted stub conversation instead.
 */
function buildDefaultRunner(callSid: string): CallRunner {
  if (process.env["CALL_RUNNER"] !== "livekit") {
    return new StubCallRunner();
  }

  if (process.env["PROVIDER_STUB_MODE"] !== "true") {
    throw new Error(
      "CALL_RUNNER=livekit requires PROVIDER_STUB_MODE=true — RealCallRunner only drives " +
        "StubVoiceSession today, it has no real (non-stub) provider session wiring yet.",
    );
  }

  const liveKitConfig = {
    livekitUrl: process.env["LIVEKIT_URL"] ?? "ws://localhost:7880",
    apiKey: process.env["LIVEKIT_API_KEY"] ?? "devkey",
    apiSecret: process.env["LIVEKIT_API_SECRET"] ?? "secret",
  };
  const roomManager = createLiveKitRoomManager(liveKitConfig);
  return new RealCallRunner(callSid, roomManager, liveKitConfig);
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
  const activeRunner = runner ?? buildDefaultRunner(call.callSid);

  try {
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
    }
    throw error;
  }
}

export function startCallExecutorWorker(): Worker<CallExecutorJobData> {
  return createWorker<CallExecutorJobData>("call-executor", async (job) => {
    await processCallExecutorJob(job.data);
  });
}
