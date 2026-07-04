import type { CallExecutorJobData } from "@callplane/contracts";
import type { SipTrunkRepository } from "@callplane/database";
import type { CallRunner } from "./call-runner.js";
import { StubCallRunner } from "./stub-call-runner.js";
import { RealCallRunner } from "./real-call-runner.js";
import { createLiveKitRoomManager } from "./room-manager.js";
import { createSipTrunkSelector } from "./trunk-selector.js";
import { createLiveKitSipDialer, type SipDialer } from "./sip-dialer.js";
import { StubSipDialer } from "./stub-sip-dialer.js";
import { getSharedRedisConnection } from "./queue.js";

export interface BuildCallRunnerDeps {
  sipTrunkRepo: SipTrunkRepository;
}

/**
 * Selects the `CallRunner` for a `call-executor` job. `CALL_RUNNER=livekit` routes through a real
 * LiveKit room (`RealCallRunner`); anything else (the default) stays in-process (`StubCallRunner`).
 *
 * `RealCallRunner` only ever drives `StubVoiceSession` today — it has no real (non-stub) provider
 * session wiring yet. Requiring `PROVIDER_STUB_MODE=true` alongside `CALL_RUNNER=livekit` makes
 * that limitation fail loudly instead of an operator expecting real provider calls silently
 * getting the scripted stub conversation instead.
 */
export async function buildCallRunner(data: CallExecutorJobData, deps: BuildCallRunnerDeps): Promise<CallRunner> {
  if (process.env["CALL_RUNNER"] !== "livekit") {
    return new StubCallRunner();
  }

  if (process.env["PROVIDER_STUB_MODE"] !== "true") {
    throw new Error(
      "CALL_RUNNER=livekit requires PROVIDER_STUB_MODE=true — RealCallRunner only drives " +
        "StubVoiceSession today, it has no real (non-stub) provider session wiring yet.",
    );
  }

  const liveKitConfig = {
    livekitUrl: process.env["LIVEKIT_URL"] ?? "ws://localhost:7880",
    apiKey: process.env["LIVEKIT_API_KEY"] ?? "devkey",
    apiSecret: process.env["LIVEKIT_API_SECRET"] ?? "secret",
  };
  const roomManager = createLiveKitRoomManager(liveKitConfig);

  if (data.channel !== "sip") {
    return new RealCallRunner(data.callSid, roomManager, liveKitConfig, "browser");
  }

  if (data.toNumber === null) {
    throw new Error(`RealCallRunner: sip-channel call ${data.callSid} has no toNumber`);
  }

  const trunks = await deps.sipTrunkRepo.listActive();
  const trunkSelector = createSipTrunkSelector(getSharedRedisConnection());
  const sipDialer: SipDialer =
    process.env["SIP_STUB_MODE"] === "true" ? new StubSipDialer() : createLiveKitSipDialer(liveKitConfig);

  return new RealCallRunner(data.callSid, roomManager, liveKitConfig, "sip", {
    toNumber: data.toNumber,
    trunks: trunks.map((t) => ({
      id: t.id,
      provider: t.provider,
      livekitTrunkId: t.livekitTrunkId,
      credentialsRef: t.credentialsRef,
      maxConcurrentCalls: t.maxConcurrentCalls,
      weight: t.weight,
    })),
    trunkSelector,
    sipDialer,
  });
}
