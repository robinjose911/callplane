import express, { type Express } from "express";

export function createHealthApp(): Express {
  const app = express();
  app.get("/health", (_req, res) => {
    res.json({
      ok: true,
      service: process.env["SERVICE_NAME"] ?? "callplane-worker",
      stubMode: process.env["PROVIDER_STUB_MODE"] === "true",
    });
  });
  return app;
}
