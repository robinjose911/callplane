import { Router } from "express";

export const healthRouter = Router();

healthRouter.get("/health", (_req, res) => {
  res.json({
    ok: true,
    service: process.env["SERVICE_NAME"] ?? "callplane-api",
    stubMode: process.env["PROVIDER_STUB_MODE"] === "true",
  });
});
