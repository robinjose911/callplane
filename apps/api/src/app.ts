import express, { type Express } from "express";
import { healthRouter } from "./routes/health.js";
import { agentsRouter } from "./routes/agents.js";

export function createApp(): Express {
  const app = express();
  app.use(express.json());
  app.use(healthRouter);
  app.use(agentsRouter);
  return app;
}
