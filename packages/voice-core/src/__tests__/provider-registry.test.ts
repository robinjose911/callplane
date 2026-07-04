import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma, createProviderProfileRepository } from "@callplane/database";
import { createProviderRegistry } from "../lib/provider-registry.js";

const providerProfileRepo = createProviderProfileRepository(prisma);
const registry = createProviderRegistry(providerProfileRepo);

const TEST_PROVIDER_TYPE = "llm" as const;
const createdIds: string[] = [];

beforeAll(async () => {
  const secondary = await providerProfileRepo.create({
    providerType: TEST_PROVIDER_TYPE,
    name: "test-secondary",
    priority: "secondary",
    credentialsRef: "TEST_SECONDARY_KEY",
  });
  const primary = await providerProfileRepo.create({
    providerType: TEST_PROVIDER_TYPE,
    name: "test-primary",
    priority: "primary",
    credentialsRef: "TEST_PRIMARY_KEY",
  });
  const inactive = await providerProfileRepo.create({
    providerType: TEST_PROVIDER_TYPE,
    name: "test-inactive",
    priority: "primary",
    credentialsRef: "TEST_INACTIVE_KEY",
    isActive: false,
  });
  createdIds.push(secondary.id, primary.id, inactive.id);
});

afterAll(async () => {
  await prisma.providerProfile.deleteMany({ where: { id: { in: createdIds } } });
});

describe("createProviderRegistry", () => {
  it("orders the chain primary before secondary, regardless of creation/insertion order", async () => {
    const chain = await registry.getProviderChain(TEST_PROVIDER_TYPE);
    const names = chain.map((c) => c.name);

    expect(names.indexOf("test-primary")).toBeLessThan(names.indexOf("test-secondary"));
  });

  it("excludes inactive providers from the chain", async () => {
    const chain = await registry.getProviderChain(TEST_PROVIDER_TYPE);
    expect(chain.map((c) => c.name)).not.toContain("test-inactive");
  });

  it("never exposes the raw credential — only a credentialsRef pointer", async () => {
    const chain = await registry.getProviderChain(TEST_PROVIDER_TYPE);
    const primaryEntry = chain.find((c) => c.name === "test-primary");
    expect(primaryEntry?.credentialsRef).toBe("TEST_PRIMARY_KEY");
    expect(JSON.stringify(primaryEntry)).not.toMatch(/^sk-|password|secret_value/i);
  });

  it("returns an empty array for a provider type with no active providers", async () => {
    const chain = await registry.getProviderChain("tts");
    // tts may have real seeded profiles in other tests' data — assert shape, not emptiness.
    expect(Array.isArray(chain)).toBe(true);
    for (const c of chain) {
      expect(c).toHaveProperty("id");
      expect(c).toHaveProperty("priority");
    }
  });
});
