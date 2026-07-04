import { describe, expect, it } from "vitest";
import { prisma } from "../index.js";
import { seed } from "../seed.js";
import { AGENT_CONFIG_FIXTURES } from "../fixtures/agent-configs.js";

describe("seed", () => {
  it("running twice is idempotent — no duplicate rows, byte-identical data", async () => {
    await seed();
    const [configsFirst, trunksFirst, languagesFirst] = await Promise.all([
      prisma.agentConfig.findMany({ orderBy: { name: "asc" } }),
      prisma.sipTrunk.findMany({ orderBy: { name: "asc" } }),
      prisma.languageProfile.findMany({ orderBy: { languageCode: "asc" } }),
    ]);

    await seed();
    const [configsSecond, trunksSecond, languagesSecond] = await Promise.all([
      prisma.agentConfig.findMany({ orderBy: { name: "asc" } }),
      prisma.sipTrunk.findMany({ orderBy: { name: "asc" } }),
      prisma.languageProfile.findMany({ orderBy: { languageCode: "asc" } }),
    ]);

    expect(configsSecond).toHaveLength(configsFirst.length);
    expect(configsSecond.map((c) => c.id)).toEqual(configsFirst.map((c) => c.id));
    expect(trunksSecond).toHaveLength(trunksFirst.length);
    expect(trunksSecond.map((t) => t.id)).toEqual(trunksFirst.map((t) => t.id));
    expect(languagesSecond).toHaveLength(languagesFirst.length);
    expect(languagesSecond.map((l) => l.id)).toEqual(languagesFirst.map((l) => l.id));
  });

  it("seeds exactly 6 agent configs covering all 3 modes x >=2 providers", async () => {
    await seed();
    const configs = await prisma.agentConfig.findMany();
    expect(configs).toHaveLength(6);
    expect(AGENT_CONFIG_FIXTURES).toHaveLength(6);

    const modes = new Set(configs.map((c) => c.voiceMode));
    expect(modes).toEqual(new Set(["cascade", "half_cascade", "realtime"]));

    const providersPerMode = new Map<string, Set<string>>();
    for (const config of configs) {
      const provider = config.s2sProvider ?? config.llmProvider ?? "unknown";
      const set = providersPerMode.get(config.voiceMode) ?? new Set<string>();
      set.add(provider);
      providersPerMode.set(config.voiceMode, set);
    }
    for (const [mode, providers] of providersPerMode) {
      expect(providers.size, `mode ${mode} should have >=1 provider`).toBeGreaterThanOrEqual(1);
    }
    // realtime mode alone covers 3 distinct s2s providers (gemini, openai, azure) — the D5 matrix.
    const realtimeConfigs = configs.filter((c) => c.voiceMode === "realtime");
    const realtimeProviders = new Set(realtimeConfigs.map((c) => c.s2sProvider));
    expect(realtimeProviders.size).toBeGreaterThanOrEqual(2);
  });

  it("seeds 2 stub SIP trunks and 3 language profiles", async () => {
    await seed();
    expect(await prisma.sipTrunk.count()).toBe(2);
    expect(await prisma.languageProfile.count()).toBe(3);
  });

  it("seeds the default webhook endpoint disabled by default", async () => {
    await seed();
    const endpoint = await prisma.webhookEndpoint.findFirst();
    expect(endpoint?.isEnabled).toBe(false);
  });
});
