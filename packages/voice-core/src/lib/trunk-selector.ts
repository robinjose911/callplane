/**
 * SIP trunk selector — deterministic trunk selection with per-trunk concurrency limits enforced
 * via Redis distributed counters. Ported from the source project's trunk-selector.ts, genericized.
 *
 * Selection algorithm:
 *   1. Fetch active call count for each candidate trunk from Redis (in parallel).
 *   2. Filter to trunks below their maxConcurrentCalls limit.
 *   3. Sort: least-loaded first, higher weight preferred as tiebreaker.
 *   4. Try atomic slot acquisition on each candidate in order — atomic acquire handles races
 *      between concurrent callers, so this ordering is advisory, not a guarantee of which trunk
 *      wins under contention.
 *   5. Return the first successfully acquired trunk, or null if none have capacity.
 *
 * Redis key: `callplane:trunk:{trunkId}:active_calls`, TTL 30 minutes — a safety net that
 * restores capacity automatically if a worker crashes mid-call and never releases the slot.
 */

/** Minimal Redis client interface for the slot-accounting Lua scripts. ioredis satisfies this structurally. */
export interface TrunkRedisClient {
  eval(script: string, numkeys: number, ...args: string[]): Promise<unknown>;
  get(key: string): Promise<string | null>;
}

/** Trunk data needed for selection, kept independent of Prisma types so voice-core stays DB-agnostic. */
export interface SipTrunkData {
  id: string;
  provider: string;
  livekitTrunkId: string;
  credentialsRef: string;
  maxConcurrentCalls: number;
  weight: number;
}

export interface SelectedTrunk {
  id: string;
  provider: string;
  livekitTrunkId: string;
  credentialsRef: string;
}

export interface SipTrunkSelector {
  /** Atomically acquires a concurrency slot on the best candidate. Null if none have capacity. */
  selectTrunk(trunks: SipTrunkData[]): Promise<SelectedTrunk | null>;
  /** Releases a trunk's slot. Must be called on both call completion and failure paths. */
  releaseTrunk(trunkId: string): Promise<void>;
  /** Current active call count for a trunk — used for selection ordering and admin display. */
  getActiveCount(trunkId: string): Promise<number>;
}

export const TRUNK_SLOT_TTL_SECONDS = 1800;

function trunkCounterKey(trunkId: string): string {
  return `callplane:trunk:${trunkId}:active_calls`;
}

/**
 * Atomic INCR-if-below-max. Returns the new counter value (>= 1) on success, or -1 if at/above
 * max. EXPIRE is set ONLY on the increment that creates the key (newVal == 1) — never refreshed
 * on later acquires. If EXPIRE ran on every acquire, a leaked slot from a crashed worker (the
 * counter stuck one higher than reality) would never actually reach its TTL on a trunk that keeps
 * seeing new traffic, since each new call would keep pushing the expiry forward — defeating the
 * "restores capacity automatically" safety net the TTL exists for.
 */
const ACQUIRE_SLOT_SCRIPT = `
local key = KEYS[1]
local max = tonumber(ARGV[1])
local ttl = tonumber(ARGV[2])
local current = tonumber(redis.call('GET', key) or '0')
if current < max then
  local newVal = redis.call('INCR', key)
  if newVal == 1 then
    redis.call('EXPIRE', key, ttl)
  end
  return newVal
else
  return -1
end
`;

/** Atomic DECR-with-floor-0 — never lets the counter go negative. Returns the new value (>= 0). */
const RELEASE_SLOT_SCRIPT = `
local key = KEYS[1]
local current = tonumber(redis.call('GET', key) or '0')
if current > 0 then
  return redis.call('DECR', key)
else
  redis.call('SET', key, '0')
  return 0
end
`;

export function createSipTrunkSelector(redisClient: TrunkRedisClient): SipTrunkSelector {
  async function getActiveCount(trunkId: string): Promise<number> {
    const value = await redisClient.get(trunkCounterKey(trunkId));
    return value === null ? 0 : parseInt(value, 10);
  }

  async function acquireSlot(trunk: SipTrunkData): Promise<boolean> {
    const result = await redisClient.eval(
      ACQUIRE_SLOT_SCRIPT,
      1,
      trunkCounterKey(trunk.id),
      String(trunk.maxConcurrentCalls),
      String(TRUNK_SLOT_TTL_SECONDS),
    );
    return (result as number) >= 0;
  }

  async function releaseTrunk(trunkId: string): Promise<void> {
    await redisClient.eval(RELEASE_SLOT_SCRIPT, 1, trunkCounterKey(trunkId));
  }

  async function selectTrunk(trunks: SipTrunkData[]): Promise<SelectedTrunk | null> {
    if (trunks.length === 0) return null;

    const trunkCounts = await Promise.all(
      trunks.map(async (trunk) => ({ trunk, activeCount: await getActiveCount(trunk.id) })),
    );

    const candidates = trunkCounts
      .filter(({ trunk, activeCount }) => activeCount < trunk.maxConcurrentCalls)
      .sort((a, b) => {
        if (a.activeCount !== b.activeCount) return a.activeCount - b.activeCount;
        return b.trunk.weight - a.trunk.weight;
      });

    for (const { trunk } of candidates) {
      if (await acquireSlot(trunk)) {
        return {
          id: trunk.id,
          provider: trunk.provider,
          livekitTrunkId: trunk.livekitTrunkId,
          credentialsRef: trunk.credentialsRef,
        };
      }
    }

    return null;
  }

  return { selectTrunk, releaseTrunk, getActiveCount };
}
