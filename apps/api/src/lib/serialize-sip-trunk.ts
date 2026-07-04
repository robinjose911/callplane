import type { SipTrunk } from "@callplane/database";
import type { SipTrunkResponse } from "@callplane/contracts";

/**
 * Maps a Prisma SipTrunk row to the wire shape. `credentialsRef` is redacted to `"****"` on
 * every read path — public-repo hygiene, matching the webhook-secret redaction convention, even
 * though `credentialsRef` is only a pointer (env var name / secret ID), never the raw credential.
 */
export function serializeSipTrunk(trunk: SipTrunk): SipTrunkResponse {
  return {
    id: trunk.id,
    name: trunk.name,
    provider: trunk.provider,
    livekitTrunkId: trunk.livekitTrunkId,
    credentialsRef: "****",
    maxConcurrentCalls: trunk.maxConcurrentCalls,
    weight: trunk.weight,
    isActive: trunk.isActive,
    createdAt: trunk.createdAt.toISOString(),
    updatedAt: trunk.updatedAt.toISOString(),
  };
}
