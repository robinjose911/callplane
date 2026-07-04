import { Router } from "express";
import { CreateAgentConfigBodySchema, UpdateAgentConfigBodySchema } from "@callplane/contracts";
import { createAgentConfigRepository, isNotFoundError, isUniqueConstraintError, prisma } from "@callplane/database";
import { requireApiKey } from "../middleware/auth.js";
import { sendErrorDefault, sendValidationError } from "../lib/send-error.js";
import { serializeAgentConfig } from "../lib/serialize-agent-config.js";
import { requireParam } from "../lib/require-param.js";

export const agentsRouter = Router();

const agentConfigRepo = createAgentConfigRepository(prisma);

agentsRouter.get("/v1/agents", requireApiKey, async (_req, res) => {
  const configs = await agentConfigRepo.listAll();
  res.json({ agents: configs.map(serializeAgentConfig) });
});

agentsRouter.get("/v1/agents/:name", requireApiKey, async (req, res) => {
  const name = requireParam(req, "name");
  const config = await agentConfigRepo.findByName(name);
  if (!config) {
    sendErrorDefault(res, "NOT_FOUND", `No agent config found with name "${name}"`);
    return;
  }
  res.json(serializeAgentConfig(config));
});

agentsRouter.post("/v1/agents", requireApiKey, async (req, res, next) => {
  const parsed = CreateAgentConfigBodySchema.safeParse(req.body);
  if (!parsed.success) {
    sendValidationError(res, parsed.error);
    return;
  }

  const {
    name,
    voiceMode,
    prompt,
    s2sProvider,
    s2sModel,
    sttProvider,
    llmProvider,
    llmModel,
    ttsProvider,
    ttsVoiceId,
    reasoningEffort,
    enableShortFirstResponse,
    languageProfileId,
    isActive,
  } = parsed.data;

  try {
    const config = await agentConfigRepo.create({
      name,
      voiceMode,
      prompt,
      ...(s2sProvider !== undefined ? { s2sProvider } : {}),
      ...(s2sModel !== undefined ? { s2sModel } : {}),
      ...(sttProvider !== undefined ? { sttProvider } : {}),
      ...(llmProvider !== undefined ? { llmProvider } : {}),
      ...(llmModel !== undefined ? { llmModel } : {}),
      ...(ttsProvider !== undefined ? { ttsProvider } : {}),
      ...(ttsVoiceId !== undefined ? { ttsVoiceId } : {}),
      ...(reasoningEffort !== undefined ? { reasoningEffort } : {}),
      ...(enableShortFirstResponse !== undefined ? { enableShortFirstResponse } : {}),
      ...(languageProfileId !== undefined ? { languageProfileId } : {}),
      ...(isActive !== undefined ? { isActive } : {}),
    });
    res.status(200).json(serializeAgentConfig(config));
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      sendErrorDefault(res, "CONFLICT", `An agent config named "${name}" already exists.`);
      return;
    }
    next(error);
  }
});

agentsRouter.patch("/v1/agents/:name", requireApiKey, async (req, res, next) => {
  const name = requireParam(req, "name");
  const parsed = UpdateAgentConfigBodySchema.safeParse(req.body);
  if (!parsed.success) {
    sendValidationError(res, parsed.error);
    return;
  }

  const {
    voiceMode,
    prompt,
    s2sProvider,
    s2sModel,
    sttProvider,
    llmProvider,
    llmModel,
    ttsProvider,
    ttsVoiceId,
    reasoningEffort,
    enableShortFirstResponse,
    languageProfileId,
    isActive,
  } = parsed.data;

  try {
    const config = await agentConfigRepo.update(name, {
      ...(voiceMode !== undefined ? { voiceMode } : {}),
      ...(prompt !== undefined ? { prompt } : {}),
      ...(s2sProvider !== undefined ? { s2sProvider } : {}),
      ...(s2sModel !== undefined ? { s2sModel } : {}),
      ...(sttProvider !== undefined ? { sttProvider } : {}),
      ...(llmProvider !== undefined ? { llmProvider } : {}),
      ...(llmModel !== undefined ? { llmModel } : {}),
      ...(ttsProvider !== undefined ? { ttsProvider } : {}),
      ...(ttsVoiceId !== undefined ? { ttsVoiceId } : {}),
      ...(reasoningEffort !== undefined ? { reasoningEffort } : {}),
      ...(enableShortFirstResponse !== undefined ? { enableShortFirstResponse } : {}),
      ...(languageProfileId !== undefined ? { languageProfileId } : {}),
      ...(isActive !== undefined ? { isActive } : {}),
    });
    res.json(serializeAgentConfig(config));
  } catch (error) {
    if (isNotFoundError(error)) {
      sendErrorDefault(res, "NOT_FOUND", `No agent config found with name "${name}"`);
      return;
    }
    next(error);
  }
});

agentsRouter.delete("/v1/agents/:name", requireApiKey, async (req, res, next) => {
  const name = requireParam(req, "name");
  try {
    await agentConfigRepo.delete(name);
    res.status(204).end();
  } catch (error) {
    if (isNotFoundError(error)) {
      sendErrorDefault(res, "NOT_FOUND", `No agent config found with name "${name}"`);
      return;
    }
    next(error);
  }
});
