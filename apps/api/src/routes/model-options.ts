import { Router } from "express";
import { CreateVoiceModelOptionBodySchema, VoiceModelTypeSchema, type VoiceModelOptionResponse } from "@callplane/contracts";
import { createVoiceModelOptionRepository, prisma, type VoiceModelOption } from "@callplane/database";
import { requireApiKey } from "../middleware/auth.js";
import { sendErrorDefault, sendValidationError } from "../lib/send-error.js";

export const modelOptionsRouter = Router();

const voiceModelOptionRepo = createVoiceModelOptionRepository(prisma);

function serialize(option: VoiceModelOption): VoiceModelOptionResponse {
  return {
    id: option.id,
    name: option.name,
    modelType: option.modelType,
    isBuiltIn: option.isBuiltIn,
    createdAt: option.createdAt.toISOString(),
  };
}

modelOptionsRouter.get("/v1/model-options", requireApiKey, async (req, res) => {
  const typeParsed = req.query["type"] !== undefined ? VoiceModelTypeSchema.safeParse(req.query["type"]) : undefined;
  if (typeParsed && !typeParsed.success) {
    sendErrorDefault(res, "VALIDATION_ERROR", "Invalid type filter — expected \"llm\" or \"s2s\".");
    return;
  }

  const options = typeParsed?.data !== undefined
    ? await voiceModelOptionRepo.listByType(typeParsed.data)
    : await voiceModelOptionRepo.listAll();
  res.json({ modelOptions: options.map(serialize) });
});

modelOptionsRouter.post("/v1/model-options", requireApiKey, async (req, res) => {
  const parsed = CreateVoiceModelOptionBodySchema.safeParse(req.body);
  if (!parsed.success) {
    sendValidationError(res, parsed.error);
    return;
  }

  // Idempotent — "Add custom model" re-submitting an existing name is a no-op, not a conflict.
  const option = await voiceModelOptionRepo.upsertByNameAndType(parsed.data);
  res.status(200).json(serialize(option));
});
