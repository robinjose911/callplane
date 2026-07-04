/**
 * Idempotent seed — safe to run any number of times (upsert-by-name). Populates the fixtures
 * every later stage and every e2e spec builds on: 6 agent configs (D5 matrix), 2 stub SIP
 * trunks, 3 language profiles, 1 default (disabled) webhook endpoint, and a default price table.
 *
 * Run: npm run db:seed --workspace=@callplane/database
 */
import { prisma } from "./index.js";
import { createAgentConfigRepository } from "./repositories/agent-config.repository.js";
import { createSipTrunkRepository } from "./repositories/sip-trunk.repository.js";
import { createLanguageProfileRepository } from "./repositories/language-profile.repository.js";
import { createWebhookEndpointRepository } from "./repositories/webhook-endpoint.repository.js";
import { createPriceTableRepository } from "./repositories/price-table.repository.js";
import { createVoiceModelOptionRepository } from "./repositories/voice-model-option.repository.js";
import { AGENT_CONFIG_FIXTURES } from "./fixtures/agent-configs.js";
import { SIP_TRUNK_FIXTURES } from "./fixtures/sip-trunks.js";
import { LANGUAGE_PROFILE_FIXTURES } from "./fixtures/language-profiles.js";
import { WEBHOOK_ENDPOINT_FIXTURES } from "./fixtures/webhook-endpoint.js";
import { PRICE_TABLE_FIXTURES } from "./fixtures/price-table.js";
import { VOICE_MODEL_OPTION_FIXTURES } from "./fixtures/voice-model-options.js";

export async function seed(): Promise<void> {
  const agentConfigRepo = createAgentConfigRepository(prisma);
  const sipTrunkRepo = createSipTrunkRepository(prisma);
  const languageProfileRepo = createLanguageProfileRepository(prisma);
  const webhookEndpointRepo = createWebhookEndpointRepository(prisma);
  const priceTableRepo = createPriceTableRepository(prisma);
  const voiceModelOptionRepo = createVoiceModelOptionRepository(prisma);

  for (const fixture of AGENT_CONFIG_FIXTURES) {
    await agentConfigRepo.upsertByName(fixture.name, fixture);
  }

  for (const fixture of SIP_TRUNK_FIXTURES) {
    await sipTrunkRepo.upsertByName(fixture.name, fixture);
  }

  for (const fixture of LANGUAGE_PROFILE_FIXTURES) {
    await languageProfileRepo.upsertByLanguageCode(fixture.languageCode, fixture);
  }

  for (const fixture of WEBHOOK_ENDPOINT_FIXTURES) {
    await webhookEndpointRepo.upsertByName(fixture.name, fixture);
  }

  for (const fixture of PRICE_TABLE_FIXTURES) {
    await priceTableRepo.upsert(fixture);
  }

  for (const fixture of VOICE_MODEL_OPTION_FIXTURES) {
    await voiceModelOptionRepo.upsertByNameAndType(fixture);
  }
}

const isMainModule = process.argv[1] && import.meta.url === new URL(process.argv[1], "file:").href;

if (isMainModule) {
  seed()
    .then(() => {
      console.log("Seed complete.");
      return prisma.$disconnect();
    })
    .catch(async (error: unknown) => {
      console.error("Seed failed:", error);
      await prisma.$disconnect();
      process.exit(1);
    });
}
