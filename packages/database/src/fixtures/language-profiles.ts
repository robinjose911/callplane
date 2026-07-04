import type { CreateLanguageProfileInput } from "../repositories/language-profile.repository.js";

export const LANGUAGE_PROFILE_FIXTURES: CreateLanguageProfileInput[] = [
  {
    languageCode: "en-US",
    systemPromptPrefix: "Speak English (US). Use standard English phonetic spelling for names.",
    defaultTtsVoiceId: "en-us-default",
    defaultSttLanguageCode: "en-US",
  },
  {
    languageCode: "de-DE",
    systemPromptPrefix: "Sprich Deutsch. Verwende die deutsche Alphabet-Aussprache für Namen.",
    defaultTtsVoiceId: "de-de-default",
    defaultSttLanguageCode: "de-DE",
  },
  {
    languageCode: "fr-FR",
    systemPromptPrefix: "Parlez français. Utilisez l'alphabet phonétique français pour les noms.",
    defaultTtsVoiceId: "fr-fr-default",
    defaultSttLanguageCode: "fr-FR",
  },
];
