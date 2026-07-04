import { Router, type Request, type Response } from "express";
import type { Queue } from "bullmq";
import { CallRequestSchema, CallStatusSchema, type CallExecutorJobData } from "@callplane/contracts";
import type { AgentConfigRepository, Call, CallEventRepository, CallRepository } from "@callplane/database";
import { requireApiKey } from "../middleware/auth.js";
import { sendErrorDefault, sendValidationError } from "../lib/send-error.js";
import { AgentNotFoundError, initiateCall } from "../services/call-initiation.service.js";
import { serializeCall, serializeCallEvent } from "../lib/serialize-call.js";
import { parsePaginationOrRespond, toOffset } from "../lib/pagination-query.js";
import { requireParam } from "../lib/require-param.js";

export interface CallsRouterDeps {
  agentConfigRepo: AgentConfigRepository;
  callRepo: CallRepository;
  callEventRepo: CallEventRepository;
  /** Lazy — only resolved on the first request that actually needs it (see app.ts). */
  getCallExecutorQueue: () => Queue<CallExecutorJobData>;
}

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
