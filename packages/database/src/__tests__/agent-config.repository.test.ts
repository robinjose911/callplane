import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "../index.js";
import { createAgentConfigRepository } from "../repositories/agent-config.repository.js";
import { isUniqueConstraintError, isNotFoundError } from "../lib/prisma-errors.js";
import { testId } from "./test-helpers.js";

const repo = createAgentConfigRepository(prisma);
const createdNames: string[] = [];

afterAll(async () => {
  await prisma.agentConfig.deleteMany({ where: { name: { in: createdNames } } });
});

describe("AgentConfigRepository", () => {
  it("creates and finds a config by name", async () => {
    const name = testId("agent");
    createdNames.push(name);

    const created = await repo.create({
      name,
      voiceMode: "cascade",
      sttProvider: "deepgram",
      llmProvider: "openai",
      llmModel: "gpt-4o",
      ttsProvider: "elevenlabs",
      prompt: "You are a helpful assistant.",
    });

    expect(created.name).toBe(name);
    expect(created.voiceMode).toBe("cascade");

    const found = await repo.findByName(name);
    expect(found?.id).toBe(created.id);
  });

  it("returns null for an unknown name", async () => {
    expect(await repo.findByName(testId("missing"))).toBeNull();
  });

  it("rejects a duplicate name with P2002", async () => {
    const name = testId("agent-dup");
    createdNames.push(name);
    const input = { name, voiceMode: "realtime" as const, prompt: "Hi" };

    await repo.create(input);
    await expect(repo.create(input)).rejects.toSatisfy(isUniqueConstraintError);
  });

  it("updates an existing config", async () => {
    const name = testId("agent-update");
    createdNames.push(name);
    await repo.create({ name, voiceMode: "cascade", prompt: "Original prompt" });

    const updated = await repo.update(name, { prompt: "Updated prompt" });
    expect(updated.prompt).toBe("Updated prompt");
  });

  it("throws P2025 updating an unknown name", async () => {
    await expect(repo.update(testId("missing"), { prompt: "x" })).rejects.toSatisfy(isNotFoundError);
  });

  it("deletes a config", async () => {
    const name = testId("agent-delete");
    await repo.create({ name, voiceMode: "cascade", prompt: "To be deleted" });

    await repo.delete(name);
    expect(await repo.findByName(name)).toBeNull();
  });

  it("upsertByName is idempotent — second call with identical input is a no-op change", async () => {
    const name = testId("agent-upsert");
    createdNames.push(name);
    const input = { name, voiceMode: "cascade" as const, prompt: "Seed prompt" };

    const first = await repo.upsertByName(name, input);
    const second = await repo.upsertByName(name, input);

    expect(second.id).toBe(first.id);
    expect(second.updatedAt.getTime()).toBeGreaterThanOrEqual(first.updatedAt.getTime());
  });
});
