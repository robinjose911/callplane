import { Router } from "express";
import type { Queue } from "bullmq";
import { CallRequestSchema, type CallExecutorJobData } from "@callplane/contracts";
import type { AgentConfigRepository, CallEventRepository, CallRepository } from "@callplane/database";
import { requireApiKey } from "../middleware/auth.js";
import { sendErrorDefault } from "../lib/send-error.js";
import { AgentNotFoundError, initiateCall } from "../services/call-initiation.service.js";

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

  return router;
}
