import type { ProviderProfileRepository, ProviderType } from "@callplane/database";

export type { ProviderType };

/** A single entry in a provider failover chain. */
export interface ProviderChainEntry {
  id: string;
  /** Provider name, e.g. "gemini-live", "deepgram", "openai", "elevenlabs". */
  name: string;
  /** "primary" | "secondary". */
  priority: string;
  /** Logical reference to credentials (env var name or secret ID) — never the raw secret. */
  credentialsRef: string;
}

export interface ProviderRegistry {
  /**
   * Ordered failover chain for a provider type: primary first, secondary second. Only active
   * providers are included (filtered at the DB query level). Empty array if none are active.
   */
  getProviderChain(type: ProviderType): Promise<ProviderChainEntry[]>;
}

/** Creates a ProviderRegistry backed by the `provider_profiles` DB table. */
export function createProviderRegistry(providerProfileRepo: ProviderProfileRepository): ProviderRegistry {
  return {
    async getProviderChain(type: ProviderType): Promise<ProviderChainEntry[]> {
      const profiles = await providerProfileRepo.listByType(type);
      return profiles.map((profile) => ({
        id: profile.id,
        name: profile.name,
        priority: profile.priority,
        credentialsRef: profile.credentialsRef,
      }));
    },
  };
}
