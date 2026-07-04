import type { StubScenario } from "@callplane/contracts";
import type { CallRunner, OnTransition } from "./call-runner.js";
import type { LiveKitClientConfig, LiveKitRoomManager } from "./room-manager.js";
import { StubVoiceSession } from "./stub-voice-session.js";
import { createChildLogger } from "./logger.js";

/**
 * Replaces `StubCallRunner` behind the same `CallRunner` interface once `CALL_RUNNER=livekit`:
 * creates a real LiveKit room, runs the voice session inside it, and deletes the room on
 * completion or failure so no orphaned rooms accumulate.
 *
 * Only drives `StubVoiceSession` today (`PROVIDER_STUB_MODE` always wins per
 * `resolveVoiceSession`'s contract) — wiring a *real* (non-stub) provider session through here
 * needs the `@livekit/agents` job-dispatch worker process, which is out of this stage's stated
 * "Done when: CALL_RUNNER=livekit + stub session completes a call through a real room" bar.
 */
export class RealCallRunner implements CallRunner {
  private readonly logger;

  constructor(
    private readonly callSid: string,
    private readonly roomManager: LiveKitRoomManager,
    private readonly liveKitConfig: LiveKitClientConfig,
  ) {
    this.logger = createChildLogger({ module: "real-call-runner", callSid });
  }

  async run(scenario: StubScenario | undefined, onTransition: OnTransition): Promise<void> {
    const { roomName } = await this.roomManager.createRoom(this.callSid, { callSid: this.callSid });

    try {
      const session = new StubVoiceSession({ ...this.liveKitConfig, roomName, callSid: this.callSid });
      await session.run(scenario, onTransition);
    } finally {
      await this.roomManager.deleteRoom(roomName).catch((err: unknown) => {
        this.logger.warn({ err, roomName }, "Failed to delete LiveKit room during cleanup");
      });
    }
  }
}
