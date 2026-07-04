import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { Redis } from "ioredis";
import { createSipTrunkSelector, type SipTrunkData } from "../lib/trunk-selector.js";

const redis = new Redis(process.env["REDIS_URL"] ?? "redis://localhost:6379");
const selector = createSipTrunkSelector(redis);

function trunk(overrides: Partial<SipTrunkData> = {}): SipTrunkData {
  return {
    id: `trunk-${crypto.randomUUID()}`,
    provider: "generic",
    livekitTrunkId: "lk-trunk-1",
    credentialsRef: "TEST_CREDS",
    maxConcurrentCalls: 5,
    weight: 100,
    ...overrides,
  };
}

const acquiredTrunkIds = new Set<string>();

afterEach(async () => {
  for (const id of acquiredTrunkIds) {
    await redis.del(`callplane:trunk:${id}:active_calls`);
  }
  acquiredTrunkIds.clear();
});

beforeAll(async () => {
  await redis.ping();
});

afterAll(async () => {
  redis.disconnect();
});

describe("createSipTrunkSelector", () => {
  it("selects the only candidate when it has capacity", async () => {
    const t = trunk();
    acquiredTrunkIds.add(t.id);

    const result = await selector.selectTrunk([t]);

    expect(result).toMatchObject({ id: t.id, provider: t.provider, livekitTrunkId: t.livekitTrunkId });
    expect(await selector.getActiveCount(t.id)).toBe(1);
  });

  it("prefers the least-loaded trunk, then higher weight as tiebreaker", async () => {
    const busy = trunk({ maxConcurrentCalls: 10 });
    const idle = trunk({ maxConcurrentCalls: 10, weight: 50 });
    acquiredTrunkIds.add(busy.id);
    acquiredTrunkIds.add(idle.id);

    // Load up `busy` with 3 active calls; `idle` stays at 0.
    for (let i = 0; i < 3; i++) await selector.selectTrunk([busy]);

    const result = await selector.selectTrunk([busy, idle]);
    expect(result?.id).toBe(idle.id);
  });

  it("falls through to the next trunk once the first is at capacity", async () => {
    const full = trunk({ maxConcurrentCalls: 1 });
    const backup = trunk();
    acquiredTrunkIds.add(full.id);
    acquiredTrunkIds.add(backup.id);

    await selector.selectTrunk([full]); // fills full's only slot

    const result = await selector.selectTrunk([full, backup]);
    expect(result?.id).toBe(backup.id);
  });

  it("returns null when every candidate is at capacity", async () => {
    const t = trunk({ maxConcurrentCalls: 1 });
    acquiredTrunkIds.add(t.id);
    await selector.selectTrunk([t]);

    const result = await selector.selectTrunk([t]);
    expect(result).toBeNull();
  });

  it("returns null for an empty candidate list", async () => {
    expect(await selector.selectTrunk([])).toBeNull();
  });

  it("releaseTrunk decrements the counter, restoring capacity", async () => {
    const t = trunk({ maxConcurrentCalls: 1 });
    acquiredTrunkIds.add(t.id);

    await selector.selectTrunk([t]);
    expect(await selector.selectTrunk([t])).toBeNull(); // at capacity

    await selector.releaseTrunk(t.id);
    expect(await selector.selectTrunk([t])).not.toBeNull(); // capacity restored
  });

  it("only sets the counter's TTL on the acquire that creates the key, never refreshing it on later acquires", async () => {
    const t = trunk({ maxConcurrentCalls: 5 });
    acquiredTrunkIds.add(t.id);
    const key = `callplane:trunk:${t.id}:active_calls`;

    await selector.selectTrunk([t]); // creates the key — sets TTL to 1800s
    const ttlAfterFirst = await redis.ttl(key);
    expect(ttlAfterFirst).toBeGreaterThan(0);

    // Simulate time having passed by shrinking the TTL directly.
    await redis.expire(key, 5);

    await selector.selectTrunk([t]); // second acquire on the same (already-existing) key
    const ttlAfterSecond = await redis.ttl(key);

    // If EXPIRE were re-issued on every acquire (the bug), this would jump back to ~1800.
    expect(ttlAfterSecond).toBeLessThanOrEqual(5);
  });

  it("releaseTrunk never lets the counter go negative", async () => {
    const t = trunk();
    acquiredTrunkIds.add(t.id);

    await selector.releaseTrunk(t.id);
    await selector.releaseTrunk(t.id);

    expect(await selector.getActiveCount(t.id)).toBe(0);
  });

  it("10 concurrent acquires against a 5-slot trunk never oversubscribe", async () => {
    const t = trunk({ maxConcurrentCalls: 5 });
    acquiredTrunkIds.add(t.id);

    const results = await Promise.all(Array.from({ length: 10 }, () => selector.selectTrunk([t])));
    const successes = results.filter((r) => r !== null);

    expect(successes).toHaveLength(5);
    expect(await selector.getActiveCount(t.id)).toBe(5);
  });
});
