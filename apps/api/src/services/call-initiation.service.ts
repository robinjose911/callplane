import { randomUUID } from "node:crypto";
import type { Queue } from "bullmq";
import {
  IDEMPOTENCY_WINDOW_SECONDS,
  TERMINAL_CALL_STATUSES,
  type CallExecutorJobData,
  type CallRequest,
} from "@callplane/contracts";
import { isUniqueConstraintError, type AgentConfigRepository, type CallEventRepository, type CallRepository } from "@callplane/database";
import { createChildLogger, prepareBrowserCallRoom, type BrowserRoomInfo } from "@callplane/voice-core";

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
  browserRoom?: BrowserRoomInfo;
}

export interface InitiateCallDeps {
  agentConfigRepo: AgentConfigRepository;
  callRepo: CallRepository;
  callEventRepo: CallEventRepository;
  callExecutorQueue: Queue<CallExecutorJobData>;
}

/**
 * Core business logic for `POST /v1/calls`. Idempotency is enforced via a unique DB column
 * (`Call.idempotencyKey`), not Redis — matching the source project's actual implementation (the plan text says
 * "via Redis" but the source project's own call-initiation.service.ts uses a Postgres unique constraint; ported
 * the real behavior, not the plan's paraphrase).
 */
export async function initiateCall(request: CallRequest, deps: InitiateCallDeps): Promise<InitiateCallResult> {
  const { agentConfigRepo, callRepo, callEventRepo, callExecutorQueue } = deps;
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

  let call;
  try {
    call = await callRepo.create({
      callSid,
      agentId: request.agentId,
      channel: request.channel,
      ...(request.toNumber !== undefined ? { toNumber: request.toNumber } : {}),
      ...(request.scenario !== undefined ? { scenario: request.scenario } : {}),
      ...(request.dynamicVariables !== undefined ? { dynamicVariables: request.dynamicVariables } : {}),
      ...(idempotencyKey !== undefined ? { idempotencyKey } : {}),
    });
  } catch (error) {
    // A concurrent request racing on the same idempotencyKey can both pass the
    // findActiveByIdempotencyKey check above before either has committed — the DB unique
    // constraint lets one insert win and rejects the other with P2002. Return the winner's
    // callSid instead of surfacing a 500 for what is, from the client's perspective, a duplicate.
    if (idempotencyKey !== undefined && isUniqueConstraintError(error)) {
      const winner = await callRepo.findActiveByIdempotencyKey(idempotencyKey);
      if (winner) {
        logger.info({ callSid: winner.callSid }, "Idempotent request — concurrent duplicate resolved via unique constraint");
        return { callSid: winner.callSid, isIdempotent: true };
      }
    }
    throw error;
  }

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

  // The call is already persisted and enqueued at this point — a LiveKit hiccup here must not
  // turn into a 500 for a call that's going to run either way (the worker will still process it;
  // for channel "browser" it'll just have nothing to join). Degrade to a roomless response
  // instead of throwing past the point of no return.
  let browserRoom: BrowserRoomInfo | undefined;
  if (request.channel === "browser") {
    try {
      browserRoom = await prepareBrowserCallRoom(callSid);
    } catch (err) {
      logger.warn({ err, callSid }, "Failed to prepare the browser call's LiveKit room — returning without it");
    }
  }

  return { callSid: call.callSid, isIdempotent: false, ...(browserRoom ? { browserRoom } : {}) };
}
