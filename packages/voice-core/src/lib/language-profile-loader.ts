import type { LanguageProfileRepository } from "@callplane/database";

/** Resolved language context — consumed by the prompt builder and (later) STT/TTS wiring. */
export interface LanguageContext {
  systemPromptPrefix: string;
  ttsVoiceId: string | null;
  sttLanguageCode: string;
}

export interface LanguageProfileLoader {
  /**
   * Resolution order: exact match for `languageCode` → fall back to `en-US` → safe empty
   * defaults if neither exists in the DB (never throws — a missing language profile degrades
   * to no phonetic prefix, not a broken call).
   */
  loadByCode(languageCode: string): Promise<LanguageContext>;
}

export function createLanguageProfileLoader(
  languageProfileRepo: LanguageProfileRepository,
): LanguageProfileLoader {
  return {
    async loadByCode(languageCode: string): Promise<LanguageContext> {
      let profile = await languageProfileRepo.findByLanguageCode(languageCode);

      if (!profile && languageCode !== "en-US") {
        profile = await languageProfileRepo.findByLanguageCode("en-US");
      }

      if (!profile) {
        return { systemPromptPrefix: "", ttsVoiceId: null, sttLanguageCode: languageCode };
      }

      return {
        systemPromptPrefix: profile.systemPromptPrefix,
        ttsVoiceId: profile.defaultTtsVoiceId,
        sttLanguageCode: profile.defaultSttLanguageCode ?? languageCode,
      };
    },
  };
}
