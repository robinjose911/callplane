import { randomUUID } from "node:crypto";
import type { Queue } from "bullmq";
import {
  IDEMPOTENCY_WINDOW_SECONDS,
  TERMINAL_CALL_STATUSES,
  type CallExecutorJobData,
  type CallRequest,
} from "@callplane/contracts";
import type { AgentConfigRepository, CallEventRepository, CallRepository } from "@callplane/database";
import { createChildLogger } from "@callplane/voice-core";

const logger = createChildLogger({ module: "call-initiation" });

export class AgentNotFoundError extends Error {
  constructor(agentId: string) {
    super(`No agent config found for agentId "${agentId}"`);
    this.name = "AgentNotFoundError";
  }
}

export interface InitiateCallResult {
  callSid: string;
  isIdempotent: boolean;
}

/**
 * Core business logic for `POST /v1/calls`. Idempotency is enforced via a unique DB column
 * (`Call.idempotencyKey`), not Redis — matching the source project's actual implementation (the plan text says
 * "via Redis" but the source project's own call-initiation.service.ts uses a Postgres unique constraint; ported
 * the real behavior, not the plan's paraphrase).
 */
export async function initiateCall(
  request: CallRequest,
  agentConfigRepo: AgentConfigRepository,
  callRepo: CallRepository,
  callEventRepo: CallEventRepository,
  callExecutorQueue: Queue<CallExecutorJobData>,
): Promise<InitiateCallResult> {
  const agentConfig = await agentConfigRepo.findByName(request.agentId);
  if (!agentConfig) {
    throw new AgentNotFoundError(request.agentId);
  }

  const idempotencyKey =
    request.channel === "sip" && request.toNumber ? `${request.agentId}:${request.toNumber}` : undefined;

  if (idempotencyKey) {
    const existing = await callRepo.findActiveByIdempotencyKey(idempotencyKey);
    if (existing) {
      const ageMs = Date.now() - existing.createdAt.getTime();
      const isTerminal = (TERMINAL_CALL_STATUSES as readonly string[]).includes(existing.status);
      if (ageMs < IDEMPOTENCY_WINDOW_SECONDS * 1000 && !isTerminal) {
        logger.info({ callSid: existing.callSid }, "Idempotent request — returning existing callSid");
        return { callSid: existing.callSid, isIdempotent: true };
      }
      await callRepo.clearIdempotencyKey(existing.callSid);
    }
  }

  const callSid = randomUUID();

  const call = await callRepo.create({
    callSid,
    agentId: request.agentId,
    channel: request.channel,
    ...(request.toNumber !== undefined ? { toNumber: request.toNumber } : {}),
    ...(request.scenario !== undefined ? { scenario: request.scenario } : {}),
    ...(request.dynamicVariables !== undefined ? { dynamicVariables: request.dynamicVariables } : {}),
    ...(idempotencyKey !== undefined ? { idempotencyKey } : {}),
  });

  await callEventRepo.append({ callSid, eventType: "call_queued" });

  await callExecutorQueue.add(
    "call-executor",
    {
      callSid,
      agentId: request.agentId,
      channel: request.channel,
      toNumber: request.toNumber ?? null,
      scenario: request.scenario ?? null,
      dynamicVariables: request.dynamicVariables ?? {},
    },
    { jobId: callSid },
  );

  logger.info({ callSid, agentId: request.agentId, channel: request.channel }, "Call initiated and enqueued");

  return { callSid: call.callSid, isIdempotent: false };
}
