import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma, createLanguageProfileRepository } from "@callplane/database";
import { createLanguageProfileLoader } from "../lib/language-profile-loader.js";

const languageProfileRepo = createLanguageProfileRepository(prisma);
const loader = createLanguageProfileLoader(languageProfileRepo);

const TEST_LANG = "xx-TEST";

beforeAll(async () => {
  await languageProfileRepo.upsertByLanguageCode(TEST_LANG, {
    languageCode: TEST_LANG,
    systemPromptPrefix: "Speak Testish. Use the Testish phonetic alphabet.",
    defaultTtsVoiceId: "testish-voice",
    defaultSttLanguageCode: "xx-TEST-STT",
  });
});

afterAll(async () => {
  await prisma.languageProfile.deleteMany({ where: { languageCode: TEST_LANG } });
});

describe("createLanguageProfileLoader", () => {
  it("loads the exact-match profile when it exists", async () => {
    const context = await loader.loadByCode(TEST_LANG);
    expect(context).toEqual({
      systemPromptPrefix: "Speak Testish. Use the Testish phonetic alphabet.",
      ttsVoiceId: "testish-voice",
      sttLanguageCode: "xx-TEST-STT",
    });
  });

  it("falls back to en-US when the requested code has no profile", async () => {
    const context = await loader.loadByCode("zz-DOES-NOT-EXIST");
    const enUS = await languageProfileRepo.findByLanguageCode("en-US");
    expect(context.systemPromptPrefix).toBe(enUS?.systemPromptPrefix);
  });

  it("returns safe empty defaults if no profile resolves anywhere (never throws)", async () => {
    const emptyRepo: Pick<ReturnType<typeof createLanguageProfileRepository>, "findByLanguageCode"> = {
      findByLanguageCode: async () => null,
    };
    const loaderWithNoProfiles = createLanguageProfileLoader(
      emptyRepo as ReturnType<typeof createLanguageProfileRepository>,
    );

    const context = await loaderWithNoProfiles.loadByCode("zz-NOTHING");
    expect(context).toEqual({ systemPromptPrefix: "", ttsVoiceId: null, sttLanguageCode: "zz-NOTHING" });
  });
});
