import { Router } from "express";
import { CreateSipTrunkBodySchema, UpdateSipTrunkBodySchema, SetTrunkStatusBodySchema } from "@callplane/contracts";
import type { SipTrunkRepository } from "@callplane/database";
import { requireApiKey } from "../middleware/auth.js";
import { sendErrorDefault, sendValidationError } from "../lib/send-error.js";
import { serializeSipTrunk } from "../lib/serialize-sip-trunk.js";
import { requireParam } from "../lib/require-param.js";

export function createTrunksRouter(sipTrunkRepo: SipTrunkRepository): Router {
  const router = Router();

  router.get("/v1/trunks", requireApiKey, async (_req, res) => {
    const trunks = await sipTrunkRepo.listAll();
    res.json({ trunks: trunks.map(serializeSipTrunk) });
  });

  router.get("/v1/trunks/:name", requireApiKey, async (req, res) => {
    const name = requireParam(req, "name");
    const trunk = await sipTrunkRepo.findByName(name);
    if (!trunk) {
      sendErrorDefault(res, "NOT_FOUND", `No SIP trunk found with name "${name}"`);
      return;
    }
    res.json(serializeSipTrunk(trunk));
  });

  router.post("/v1/trunks", requireApiKey, async (req, res, next) => {
    const parsed = CreateSipTrunkBodySchema.safeParse(req.body);
    if (!parsed.success) {
      sendValidationError(res, parsed.error);
      return;
    }

    try {
      const { name, provider, livekitTrunkId, credentialsRef, maxConcurrentCalls, weight, isActive } = parsed.data;
      const trunk = await sipTrunkRepo.create({
        name,
        provider,
        livekitTrunkId,
        credentialsRef,
        ...(maxConcurrentCalls !== undefined ? { maxConcurrentCalls } : {}),
        ...(weight !== undefined ? { weight } : {}),
        ...(isActive !== undefined ? { isActive } : {}),
      });
      res.status(200).json(serializeSipTrunk(trunk));
    } catch (error) {
      next(error);
    }
  });

  router.patch("/v1/trunks/:name", requireApiKey, async (req, res, next) => {
    const name = requireParam(req, "name");
    const parsed = UpdateSipTrunkBodySchema.safeParse(req.body);
    if (!parsed.success) {
      sendValidationError(res, parsed.error);
      return;
    }

    try {
      const { provider, livekitTrunkId, credentialsRef, maxConcurrentCalls, weight, isActive } = parsed.data;
      const trunk = await sipTrunkRepo.update(name, {
        ...(provider !== undefined ? { provider } : {}),
        ...(livekitTrunkId !== undefined ? { livekitTrunkId } : {}),
        ...(credentialsRef !== undefined ? { credentialsRef } : {}),
        ...(maxConcurrentCalls !== undefined ? { maxConcurrentCalls } : {}),
        ...(weight !== undefined ? { weight } : {}),
        ...(isActive !== undefined ? { isActive } : {}),
      });
      res.json(serializeSipTrunk(trunk));
    } catch (error) {
      next(error);
    }
  });

  router.patch("/v1/trunks/:name/status", requireApiKey, async (req, res, next) => {
    const name = requireParam(req, "name");
    const parsed = SetTrunkStatusBodySchema.safeParse(req.body);
    if (!parsed.success) {
      sendErrorDefault(res, "VALIDATION_ERROR", "Invalid request body — expected { isActive: boolean }.");
      return;
    }

    try {
      const trunk = await sipTrunkRepo.setActive(name, parsed.data.isActive);
      res.json(serializeSipTrunk(trunk));
    } catch (error) {
      next(error);
    }
  });

  return router;
}
