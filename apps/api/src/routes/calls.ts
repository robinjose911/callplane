import { Router, type Request, type Response } from "express";
import type { Queue } from "bullmq";
import { CallRequestSchema, CallStatusSchema, type CallExecutorJobData } from "@callplane/contracts";
import type {
  AgentConfigRepository,
  Call,
  CallCostRepository,
  CallEventRepository,
  CallRepository,
  RecordingRepository,
  WebhookOutboxRepository,
} from "@callplane/database";
import type { StorageAdapter } from "@callplane/voice-core";
import { requireApiKey } from "../middleware/auth.js";
import { sendErrorDefault, sendValidationError } from "../lib/send-error.js";
import { AgentNotFoundError, initiateCall } from "../services/call-initiation.service.js";
import { serializeCall, serializeCallCost, serializeCallEvent } from "../lib/serialize-call.js";
import { parsePaginationOrRespond, toOffset } from "../lib/pagination-query.js";
import { requireParam } from "../lib/require-param.js";
import { buildCallStreamSnapshot, type CallStreamState } from "../lib/call-stream-snapshot.js";

export interface CallsRouterDeps {
  agentConfigRepo: AgentConfigRepository;
  callRepo: CallRepository;
  callEventRepo: CallEventRepository;
  callCostRepo: CallCostRepository;
  webhookOutboxRepo: WebhookOutboxRepository;
  recordingRepo: RecordingRepository;
  storageAdapter: StorageAdapter;
  /** Lazy — only resolved on the first request that actually needs it (see app.ts). */
  getCallExecutorQueue: () => Queue<CallExecutorJobData>;
}

/** How often the SSE stream re-polls the DB for a snapshot — matches the console's prior
 * client-side polling interval so migrating to SSE doesn't change perceived latency. */
const STREAM_POLL_MS = 1000;

async function loadCallOrRespond(deps: CallsRouterDeps, req: Request, res: Response): Promise<Call | undefined> {
  const callSid = requireParam(req, "callSid");
  const call = await deps.callRepo.findBySid(callSid);
  if (!call) {
    sendErrorDefault(res, "NOT_FOUND", `No call found with callSid "${callSid}"`);
    return undefined;
  }
  return call;
}

export function createCallsRouter(deps: CallsRouterDeps): Router {
  const router = Router();

  router.post("/v1/calls", requireApiKey, async (req, res, next) => {
    const parsed = CallRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      sendValidationError(res, parsed.error);
      return;
    }

    const isStubMode = process.env["PROVIDER_STUB_MODE"] === "true";
    if (parsed.data.scenario !== undefined && !isStubMode) {
      sendErrorDefault(res, "VALIDATION_ERROR", "scenario is only accepted when PROVIDER_STUB_MODE is enabled.", [
        { field: "scenario", message: "not accepted outside stub mode" },
      ]);
      return;
    }

    try {
      const result = await initiateCall(parsed.data, {
        agentConfigRepo: deps.agentConfigRepo,
        callRepo: deps.callRepo,
        callEventRepo: deps.callEventRepo,
        callExecutorQueue: deps.getCallExecutorQueue(),
      });
      res.status(200).json({
        callSid: result.callSid,
        status: "QUEUED",
        ...(result.browserRoom ? result.browserRoom : {}),
      });
    } catch (error) {
      if (error instanceof AgentNotFoundError) {
        sendErrorDefault(res, "NOT_FOUND", error.message);
        return;
      }
      next(error);
    }
  });

  router.get("/v1/calls/:callSid/events", requireApiKey, async (req, res) => {
    const call = await loadCallOrRespond(deps, req, res);
    if (!call) return;

    const page = parsePaginationOrRespond(req, res);
    if (!page) return;

    const events = await deps.callEventRepo.findBySid(call.callSid, {
      limit: page.limit,
      offset: toOffset(page.page, page.limit),
    });
    res.json({ events: events.map(serializeCallEvent), page: page.page, limit: page.limit });
  });

  router.get("/v1/calls/:callSid", requireApiKey, async (req, res) => {
    const call = await loadCallOrRespond(deps, req, res);
    if (!call) return;
    res.json(serializeCall(call));
  });

  router.get("/v1/calls/:callSid/cost", requireApiKey, async (req, res) => {
    const call = await loadCallOrRespond(deps, req, res);
    if (!call) return;
    const costs = await deps.callCostRepo.findByCallSid(call.callSid);
    res.json({ costs: costs.map(serializeCallCost) });
  });

  // Server-Sent Events replacement for the console's prior 1s client-side polling (ADR 0004) —
  // one connection carries status/events/costs/webhookDeliveries/hasRecording together instead of
  // 4-5 separate requests per tick, and the connection self-closes once the call has settled.
  router.get("/v1/calls/:callSid/stream", requireApiKey, async (req, res) => {
    const call = await loadCallOrRespond(deps, req, res);
    if (!call) return;

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();

    let closed = false;
    req.on("close", () => {
      closed = true;
    });

    const state: CallStreamState = { noDeliveriesGraceTicks: 0 };

    const tick = async () => {
      if (closed) return;
      const result = await buildCallStreamSnapshot(call.callSid, deps, state);
      if (closed) return;
      if (!result) {
        res.end();
        return;
      }
      res.write(`data: ${JSON.stringify(result.snapshot)}\n\n`);
      if (result.shouldStop) {
        res.end();
        return;
      }
      setTimeout(() => void tick(), STREAM_POLL_MS);
    };

    void tick();
  });

  router.head("/v1/calls/:callSid/recording", requireApiKey, async (req, res) => {
    const callSid = requireParam(req, "callSid");
    const call = await deps.callRepo.findBySid(callSid);
    if (!call) {
      res.sendStatus(404);
      return;
    }
    const recording = await deps.recordingRepo.findByCallSid(call.callSid);
    res.sendStatus(recording ? 200 : 404);
  });

  router.get("/v1/calls/:callSid/recording", requireApiKey, async (req, res, next) => {
    const call = await loadCallOrRespond(deps, req, res);
    if (!call) return;

    const recording = await deps.recordingRepo.findByCallSid(call.callSid);
    if (!recording) {
      sendErrorDefault(res, "NOT_FOUND", `No recording available yet for call "${call.callSid}"`);
      return;
    }

    try {
      const stream = await deps.storageAdapter.getStream(recording.storagePath);
      res.setHeader("Content-Type", "audio/wav");
      stream.on("error", (error) => {
        // A read error after streaming has already started can't be reported via the normal
        // JSON error envelope — headers and possibly body bytes are already flushed, so calling
        // into errorHandler's res.status().json() would throw ERR_HTTP_HEADERS_SENT. Just log
        // and end the connection.
        if (res.headersSent) {
          res.destroy(error);
          return;
        }
        next(error);
      });
      stream.pipe(res);
    } catch (error) {
      next(error);
    }
  });

  router.get("/v1/costs", requireApiKey, async (_req, res) => {
    const costs = await deps.callCostRepo.listRecent();
    res.json({ costs: costs.map(serializeCallCost) });
  });

  router.get("/v1/calls", requireApiKey, async (req, res) => {
    const page = parsePaginationOrRespond(req, res);
    if (!page) return;

    const statusParsed = req.query["status"] !== undefined ? CallStatusSchema.safeParse(req.query["status"]) : undefined;
    if (statusParsed && !statusParsed.success) {
      sendErrorDefault(res, "VALIDATION_ERROR", "Invalid status filter.");
      return;
    }

    const calls = await deps.callRepo.list({
      ...(statusParsed?.data !== undefined ? { status: statusParsed.data } : {}),
      limit: page.limit,
      offset: toOffset(page.page, page.limit),
    });
    res.json({ calls: calls.map(serializeCall), page: page.page, limit: page.limit });
  });

  return router;
}
