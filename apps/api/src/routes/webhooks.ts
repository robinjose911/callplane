import { Router } from "express";
import type { Queue } from "bullmq";
import {
  CreateWebhookEndpointBodySchema,
  UpdateWebhookEndpointBodySchema,
  type WebhookDispatcherJobData,
} from "@callplane/contracts";
import {
  isNotFoundError,
  isUniqueConstraintError,
  type WebhookEndpointRepository,
  type WebhookOutboxRepository,
} from "@callplane/database";
import { requireApiKey } from "../middleware/auth.js";
import { sendErrorDefault, sendValidationError } from "../lib/send-error.js";
import { serializeWebhookEndpoint, serializeWebhookOutboxEntry } from "../lib/serialize-webhook.js";
import { requireParam } from "../lib/require-param.js";

export interface WebhooksRouterDeps {
  webhookEndpointRepo: WebhookEndpointRepository;
  webhookOutboxRepo: WebhookOutboxRepository;
  getWebhookDispatcherQueue: () => Queue<WebhookDispatcherJobData>;
}

export function createWebhooksRouter(deps: WebhooksRouterDeps): Router {
  const router = Router();
  const { webhookEndpointRepo, webhookOutboxRepo } = deps;

  router.get("/v1/webhook-endpoints", requireApiKey, async (_req, res) => {
    const endpoints = await webhookEndpointRepo.listAll();
    res.json({ endpoints: endpoints.map(serializeWebhookEndpoint) });
  });

  router.post("/v1/webhook-endpoints", requireApiKey, async (req, res, next) => {
    const parsed = CreateWebhookEndpointBodySchema.safeParse(req.body);
    if (!parsed.success) {
      sendValidationError(res, parsed.error);
      return;
    }

    const { name, url, secret, isEnabled, eventTypes } = parsed.data;
    try {
      const endpoint = await webhookEndpointRepo.create({
        name,
        url,
        secret,
        eventTypes,
        ...(isEnabled !== undefined ? { isEnabled } : {}),
      });
      res.status(200).json(serializeWebhookEndpoint(endpoint));
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        sendErrorDefault(res, "CONFLICT", `A webhook endpoint named "${name}" already exists.`);
        return;
      }
      next(error);
    }
  });

  router.patch("/v1/webhook-endpoints/:name", requireApiKey, async (req, res, next) => {
    const name = requireParam(req, "name");
    const parsed = UpdateWebhookEndpointBodySchema.safeParse(req.body);
    if (!parsed.success) {
      sendValidationError(res, parsed.error);
      return;
    }

    const { url, secret, isEnabled, eventTypes } = parsed.data;
    try {
      const endpoint = await webhookEndpointRepo.update(name, {
        ...(url !== undefined ? { url } : {}),
        ...(secret !== undefined ? { secret } : {}),
        ...(isEnabled !== undefined ? { isEnabled } : {}),
        ...(eventTypes !== undefined ? { eventTypes } : {}),
      });
      res.json(serializeWebhookEndpoint(endpoint));
    } catch (error) {
      if (isNotFoundError(error)) {
        sendErrorDefault(res, "NOT_FOUND", `No webhook endpoint found with name "${name}"`);
        return;
      }
      next(error);
    }
  });

  router.get("/v1/webhook-outbox", requireApiKey, async (req, res) => {
    const callSid = typeof req.query["callSid"] === "string" ? req.query["callSid"] : undefined;
    if (!callSid) {
      sendErrorDefault(res, "VALIDATION_ERROR", "?callSid= is required.");
      return;
    }
    const entries = await webhookOutboxRepo.findByCallSid(callSid);
    res.json({ entries: entries.map(serializeWebhookOutboxEntry) });
  });

  router.post("/v1/webhook-outbox/:id/replay", requireApiKey, async (req, res) => {
    const id = requireParam(req, "id");
    const entry = await webhookOutboxRepo.findById(id);
    if (!entry) {
      sendErrorDefault(res, "NOT_FOUND", `No webhook outbox entry found with id "${id}"`);
      return;
    }

    const reset = await webhookOutboxRepo.resetForReplay(id);
    await deps.getWebhookDispatcherQueue().add(
      "webhook-dispatcher",
      { webhookOutboxId: reset.id, callSid: reset.callSid },
      { jobId: `${reset.id}-replay-${Date.now()}` },
    );
    res.json(serializeWebhookOutboxEntry(reset));
  });

  return router;
}
