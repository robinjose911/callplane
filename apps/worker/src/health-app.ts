import express, { type Express } from "express";
import { buildHealthPayload } from "@callplane/voice-core";

export function createHealthApp(): Express {
  const app = express();
  app.get("/health", (_req, res) => {
    res.json(buildHealthPayload("callplane-worker"));
  });
  return app;
}
