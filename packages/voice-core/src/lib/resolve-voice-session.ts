import { buildSessionFromMode, type AgentSessionPair, type SessionBuildParams } from "./session-builders.js";

/**
 * Resolves a call's voice session: real provider session, or a stub, based on
 * `PROVIDER_STUB_MODE`. **When stub mode is on, this always wins regardless of the agent
 * config's actual voiceMode/provider** — so seeded real-provider configs (e.g.
 * `demo-gemini-realtime`) still demo without any API keys. `buildStubSession` is supplied by
 * the caller rather than imported here, keeping this module free of a dependency on the LiveKit
 * room-joining implementation.
 *
 * **Not yet wired to a caller.** Stage 3.4's `RealCallRunner` only ever drives `StubVoiceSession`
 * directly (`CALL_RUNNER=livekit` requires `PROVIDER_STUB_MODE=true`, enforced in
 * `apps/worker/src/workers/call-executor.worker.ts`) — it doesn't have `SessionBuildParams`
 * (mode/provider/prompt) available yet, since `CallRunner.run()` only carries a `StubScenario`.
 * This function is the intended integration point for whenever a later stage plumbs `AgentConfig`
 * through to the worker and adds a real (non-stub) session path; until then, treat it as tested
 * but unused scaffolding, not a load-bearing call site.
 */
export function resolveVoiceSession<StubSession>(
  params: SessionBuildParams,
  buildStubSession: () => StubSession,
  isStubMode: () => boolean = () => process.env["PROVIDER_STUB_MODE"] === "true",
): AgentSessionPair | StubSession {
  if (isStubMode()) {
    return buildStubSession();
  }
  return buildSessionFromMode(params);
}
