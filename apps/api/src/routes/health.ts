import { Router } from "express";
import { buildHealthPayload } from "@callplane/voice-core";

export const healthRouter = Router();

healthRouter.get("/health", (_req, res) => {
  res.json(buildHealthPayload("callplane-api"));
});
