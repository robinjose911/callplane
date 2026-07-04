import type { CallEventRepository } from "@callplane/database";
import { createChildLogger } from "./logger.js";
import type { ProviderChainEntry } from "./provider-registry.js";

export type { ProviderChainEntry };

export interface FailoverOptions {
  callSid: string;
  callEventRepo: CallEventRepository;
}

/** Thrown when every provider in the chain fails to initialize. */
export class AllProvidersFailedError extends Error {
  public readonly providerType: string;
  public readonly errors: Error[];

  constructor(providerType: string, errors: Error[]) {
    const detail = errors.map((e) => e.message).join("; ");
    super(`All providers failed for type "${providerType}": ${detail}`);
    this.name = "AllProvidersFailedError";
    this.providerType = providerType;
    this.errors = errors;
  }
}

/**
 * Tries each provider in `chain` in order via `initFn`. First success wins and short-circuits
 * the rest of the chain. Each failure appends a `failover_triggered` CallEvent and moves to the
 * next candidate. If the entire chain is exhausted, throws `AllProvidersFailedError` — this is
 * call-init-only failover (never mid-call), per CLAUDE.md's locked architectural decision.
 */
export async function resolveProvider<T>(
  chain: ProviderChainEntry[],
  initFn: (entry: ProviderChainEntry) => Promise<T>,
  opts: FailoverOptions,
): Promise<T> {
  const { callSid, callEventRepo } = opts;
  const resolverLogger = createChildLogger({ module: "failover-resolver", callSid });

  const errors: Error[] = [];

  for (const entry of chain) {
    try {
      const result = await initFn(entry);

      if (errors.length > 0) {
        resolverLogger.info(
          { resolvedProvider: entry.name, attemptCount: errors.length + 1 },
          "Provider failover resolved successfully",
        );
      }

      return result;
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      errors.push(error);

      resolverLogger.warn(
        { failedProvider: entry.name, error: error.message },
        "Provider init failed — recording failover_triggered and trying next",
      );

      await callEventRepo.append({
        callSid,
        eventType: "failover_triggered",
        payload: {
          failedProvider: entry.name,
          failedProviderId: entry.id,
          failedProviderPriority: entry.priority,
          reason: error.message,
        },
      });
    }
  }

  const providerName = chain[0]?.name ?? "unknown";
  throw new AllProvidersFailedError(providerName, errors);
}
