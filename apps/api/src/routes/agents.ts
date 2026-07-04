import { Router } from "express";
import { createAgentConfigRepository, prisma } from "@callplane/database";
import { serializeAgentConfig } from "../lib/serialize-agent-config.js";

export const agentsRouter = Router();

const agentConfigRepo = createAgentConfigRepository(prisma);

agentsRouter.get("/v1/agents", async (_req, res) => {
  const configs = await agentConfigRepo.listAll();
  res.json({ agents: configs.map(serializeAgentConfig) });
});
