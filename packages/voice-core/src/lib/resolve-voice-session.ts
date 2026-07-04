import { buildSessionFromMode, type AgentSessionPair, type SessionBuildParams } from "./session-builders.js";

/**
 * Resolves a call's voice session: real provider session, or a stub, based on
 * `PROVIDER_STUB_MODE`. **When stub mode is on, this always wins regardless of the agent
 * config's actual voiceMode/provider** — so seeded real-provider configs (e.g.
 * `demo-gemini-realtime`) still demo without any API keys. `buildStubSession` is supplied by
 * the caller (Stage 3.4's real `StubVoiceSession`) rather than imported here, keeping this
 * module free of a dependency on the LiveKit room-joining implementation.
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
