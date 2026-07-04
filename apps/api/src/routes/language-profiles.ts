import { Router } from "express";
import type { LanguageProfileResponse } from "@callplane/contracts";
import { createLanguageProfileRepository, prisma, type LanguageProfile } from "@callplane/database";
import { requireApiKey } from "../middleware/auth.js";

export const languageProfilesRouter = Router();

const languageProfileRepo = createLanguageProfileRepository(prisma);

function serialize(profile: LanguageProfile): LanguageProfileResponse {
  return {
    id: profile.id,
    languageCode: profile.languageCode,
    systemPromptPrefix: profile.systemPromptPrefix,
    defaultTtsVoiceId: profile.defaultTtsVoiceId,
    defaultSttLanguageCode: profile.defaultSttLanguageCode,
  };
}

languageProfilesRouter.get("/v1/language-profiles", requireApiKey, async (_req, res) => {
  const profiles = await languageProfileRepo.listAll();
  res.json({ languageProfiles: profiles.map(serialize) });
});
