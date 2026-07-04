import { Router } from "express";
import type { Queue } from "bullmq";
import { CallRequestSchema, CallStatusSchema, type CallExecutorJobData } from "@callplane/contracts";
import type { AgentConfigRepository, CallEventRepository, CallRepository } from "@callplane/database";
import { requireApiKey } from "../middleware/auth.js";
import { sendErrorDefault } from "../lib/send-error.js";
import { AgentNotFoundError, initiateCall } from "../services/call-initiation.service.js";
import { serializeCall, serializeCallEvent } from "../lib/serialize-call.js";
import { PaginationQuerySchema, toOffset } from "../lib/pagination-query.js";

export interface CallsRouterDeps {
  agentConfigRepo: AgentConfigRepository;
  callRepo: CallRepository;
  callEventRepo: CallEventRepository;
  callExecutorQueue: Queue<CallExecutorJobData>;
}

export function createCallsRouter(deps: CallsRouterDeps): Router {
  const router = Router();

  router.post("/v1/calls", requireApiKey, async (req, res, next) => {
    const parsed = CallRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      sendErrorDefault(
        res,
        "VALIDATION_ERROR",
        "Invalid request body.",
        parsed.error.issues.map((issue) => ({ field: issue.path.join("."), message: issue.message })),
      );
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
      const result = await initiateCall(
        parsed.data,
        deps.agentConfigRepo,
        deps.callRepo,
        deps.callEventRepo,
        deps.callExecutorQueue,
      );
      res.status(200).json({ callSid: result.callSid, status: "QUEUED" });
    } catch (error) {
      if (error instanceof AgentNotFoundError) {
        sendErrorDefault(res, "NOT_FOUND", error.message);
        return;
      }
      next(error);
    }
  });

  router.get("/v1/calls/:callSid/events", requireApiKey, async (req, res) => {
    const callSid = req.params["callSid"] as string;
    const call = await deps.callRepo.findBySid(callSid);
    if (!call) {
      sendErrorDefault(res, "NOT_FOUND", `No call found with callSid "${callSid}"`);
      return;
    }

    const pageParsed = PaginationQuerySchema.safeParse(req.query);
    if (!pageParsed.success) {
      sendErrorDefault(res, "VALIDATION_ERROR", "Invalid pagination query.");
      return;
    }

    const { page, limit } = pageParsed.data;
    const events = await deps.callEventRepo.findBySid(call.callSid, { limit, offset: toOffset(page, limit) });
    res.json({ events: events.map(serializeCallEvent), page, limit });
  });

  router.get("/v1/calls/:callSid", requireApiKey, async (req, res) => {
    const callSid = req.params["callSid"] as string;
    const call = await deps.callRepo.findBySid(callSid);
    if (!call) {
      sendErrorDefault(res, "NOT_FOUND", `No call found with callSid "${callSid}"`);
      return;
    }
    res.json(serializeCall(call));
  });

  router.get("/v1/calls", requireApiKey, async (req, res) => {
    const pageParsed = PaginationQuerySchema.safeParse(req.query);
    if (!pageParsed.success) {
      sendErrorDefault(res, "VALIDATION_ERROR", "Invalid pagination query.");
      return;
    }

    const statusParsed = req.query["status"] !== undefined ? CallStatusSchema.safeParse(req.query["status"]) : undefined;
    if (statusParsed && !statusParsed.success) {
      sendErrorDefault(res, "VALIDATION_ERROR", "Invalid status filter.");
      return;
    }

    const { page, limit } = pageParsed.data;
    const calls = await deps.callRepo.list({
      ...(statusParsed?.data !== undefined ? { status: statusParsed.data } : {}),
      limit,
      offset: toOffset(page, limit),
    });
    res.json({ calls: calls.map(serializeCall), page, limit });
  });

  return router;
}
