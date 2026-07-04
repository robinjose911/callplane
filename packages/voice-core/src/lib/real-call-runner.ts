import type { StubScenario } from "@callplane/contracts";
import type { CallRunner, OnTransition } from "./call-runner.js";
import type { LiveKitClientConfig, LiveKitRoomManager } from "./room-manager.js";
import { StubVoiceSession } from "./stub-voice-session.js";
import { createChildLogger } from "./logger.js";
import type { SipDialer } from "./sip-dialer.js";
import { SipTrunkError } from "./sip-dialer.js";
import type { SipTrunkData, SipTrunkSelector } from "./trunk-selector.js";

/** SIP-channel dependencies — only required when the call's channel is "sip". */
export interface SipDialDeps {
  toNumber: string;
  trunks: SipTrunkData[];
  trunkSelector: SipTrunkSelector;
  sipDialer: SipDialer;
}

/**
 * Replaces `StubCallRunner` behind the same `CallRunner` interface once `CALL_RUNNER=livekit`:
 * creates a real LiveKit room, dials out over SIP first for `channel: "sip"` calls (trying each
 * candidate trunk in turn, releasing a trunk-level failure's slot before retrying the next one),
 * runs the voice session inside the room, and deletes the room on completion or failure so no
 * orphaned rooms accumulate.
 *
 * Only drives `StubVoiceSession` today (`PROVIDER_STUB_MODE` always wins per
 * `resolveVoiceSession`'s contract) — wiring a *real* (non-stub) provider session through here
 * needs the `@livekit/agents` job-dispatch worker process, which is out of this stage's stated
 * "Done when: CALL_RUNNER=livekit + stub session completes a call through a real room" bar.
 */
export class RealCallRunner implements CallRunner {
  private readonly logger;
  /** Tracks the currently-held trunk slot so it's released exactly once, in `run()`'s `finally`. */
  private acquiredTrunkId: string | undefined;

  constructor(
    private readonly callSid: string,
    private readonly roomManager: LiveKitRoomManager,
    private readonly liveKitConfig: LiveKitClientConfig,
    private readonly channel: "sip" | "browser" = "browser",
    private readonly sipDialDeps?: SipDialDeps,
  ) {
    this.logger = createChildLogger({ module: "real-call-runner", callSid });
  }

  async run(scenario: StubScenario | undefined, onTransition: OnTransition): Promise<void> {
    const { roomName } = await this.roomManager.createRoom(this.callSid, { callSid: this.callSid });

    try {
      if (this.channel === "sip") {
        const answered = await this.dialSip(roomName, onTransition);
        if (!answered) return;
      }

      const session = new StubVoiceSession({ ...this.liveKitConfig, roomName, callSid: this.callSid });
      await session.run(scenario, onTransition, {
        alreadyInProgress: this.channel === "sip",
        ...(this.channel === "browser" ? { waitForParticipantIdentity: "user" } : {}),
      });
    } finally {
      if (this.acquiredTrunkId !== undefined && this.sipDialDeps) {
        await this.sipDialDeps.trunkSelector.releaseTrunk(this.acquiredTrunkId).catch((err: unknown) => {
          this.logger.warn({ err, trunkId: this.acquiredTrunkId }, "Failed to release trunk slot during cleanup");
        });
      }
      await this.roomManager.deleteRoom(roomName).catch((err: unknown) => {
        this.logger.warn({ err, roomName }, "Failed to delete LiveKit room during cleanup");
      });
    }
  }

  /** Returns true when the call was answered and the voice session should proceed. */
  private async dialSip(roomName: string, onTransition: OnTransition): Promise<boolean> {
    if (!this.sipDialDeps) {
      throw new Error("RealCallRunner: channel is \"sip\" but no sipDialDeps were provided");
    }
    const { toNumber, trunks, trunkSelector, sipDialer } = this.sipDialDeps;

    await onTransition({ status: "DIALING", eventType: "call_dialing" });

    let candidates = trunks;
    while (candidates.length > 0) {
      const selected = await trunkSelector.selectTrunk(candidates);
      if (!selected) break; // no remaining candidate has capacity

      this.acquiredTrunkId = selected.id;

      try {
        const result = await sipDialer.dialOut({
          roomName,
          toNumber,
          sipTrunkId: selected.livekitTrunkId,
          participantIdentity: "caller",
        });

        if (result.outcome === "answered") {
          await onTransition({ status: "RINGING", eventType: "call_ringing" });
          await onTransition({ status: "IN_PROGRESS", eventType: "call_in_progress" });
          return true; // slot stays held for the call's duration — released in run()'s finally
        }

        // busy/no_answer are callee-side, terminal outcomes — a different trunk can't fix them.
        await trunkSelector.releaseTrunk(selected.id);
        this.acquiredTrunkId = undefined;
        const terminalStatus = result.outcome === "busy" ? "BUSY" : "NO_ANSWER";
        await onTransition({ status: terminalStatus, eventType: "call_failed", payload: { outcome: result.outcome } });
        return false;
      } catch (err) {
        await trunkSelector.releaseTrunk(selected.id);
        this.acquiredTrunkId = undefined;

        if (!(err instanceof SipTrunkError)) throw err;

        await onTransition({
          eventType: "failover_triggered",
          payload: { failedTrunkId: selected.id, reason: err.message },
        });
        candidates = candidates.filter((t) => t.id !== selected.id);
      }
    }

    await onTransition({
      status: "FAILED",
      eventType: "call_initiation_failure",
      payload: { reason: "trunk_unavailable" },
    });
    return false;
  }
}
