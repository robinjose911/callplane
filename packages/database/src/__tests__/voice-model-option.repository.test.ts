import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "../index.js";
import { createVoiceModelOptionRepository } from "../repositories/voice-model-option.repository.js";

const repo = createVoiceModelOptionRepository(prisma);
const createdIds: string[] = [];

afterAll(async () => {
  await prisma.voiceModelOption.deleteMany({ where: { id: { in: createdIds } } });
});

describe("createVoiceModelOptionRepository", () => {
  it("listByType returns only options of the requested type", async () => {
    const created = await repo.create({ name: `test-llm-${crypto.randomUUID()}`, modelType: "llm" });
    createdIds.push(created.id);

    const llmOptions = await repo.listByType("llm");
    expect(llmOptions.map((o) => o.id)).toContain(created.id);

    const s2sOptions = await repo.listByType("s2s");
    expect(s2sOptions.map((o) => o.id)).not.toContain(created.id);
  });

  it("upsertByNameAndType is idempotent — re-adding the same name+type is a no-op, not an error", async () => {
    const name = `test-model-${crypto.randomUUID()}`;
    const first = await repo.upsertByNameAndType({ name, modelType: "s2s" });
    createdIds.push(first.id);

    const second = await repo.upsertByNameAndType({ name, modelType: "s2s" });
    expect(second.id).toBe(first.id);

    const all = await repo.listByType("s2s");
    expect(all.filter((o) => o.name === name)).toHaveLength(1);
  });

  it("the same name is allowed for both llm and s2s (compound uniqueness)", async () => {
    const name = `test-shared-name-${crypto.randomUUID()}`;
    const llmOption = await repo.create({ name, modelType: "llm" });
    const s2sOption = await repo.create({ name, modelType: "s2s" });
    createdIds.push(llmOption.id, s2sOption.id);

    expect(llmOption.id).not.toBe(s2sOption.id);
  });

  it("create throws on a duplicate (name, modelType) pair", async () => {
    const name = `test-dup-${crypto.randomUUID()}`;
    const created = await repo.create({ name, modelType: "llm" });
    createdIds.push(created.id);

    await expect(repo.create({ name, modelType: "llm" })).rejects.toThrow();
  });
});
