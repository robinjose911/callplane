import { Room, RoomEvent } from "@livekit/rtc-node";
import { AccessToken } from "livekit-server-sdk";
import type { CallStatus, StubScenario } from "@callplane/contracts";
import {
  computeStubFinalStep,
  computeStubPreTurnSteps,
  type CallTransition,
  type OnTransition,
} from "./call-runner.js";
import { createChildLogger } from "./logger.js";

const DATA_TOPIC = "callplane-events";
const AGENT_IDENTITY = "agent";
const TERMINAL_STATUSES: ReadonlySet<CallStatus> = new Set(["COMPLETED", "FAILED", "BUSY", "NO_ANSWER"]);

export interface StubVoiceSessionConfig {
  livekitUrl: string;
  apiKey: string;
  apiSecret: string;
  roomName: string;
  callSid: string;
}

/**
 * Joins a **real** LiveKit room as participant `agent` and plays back a scripted conversation —
 * a scripted agent standing in for a real provider session (see `resolveVoiceSession`). Publishes
 * each turn as a LiveKit transcription segment (for a future console live-monitor UI) and as a
 * structured data message on the `callplane-events` topic (the reliable channel `RealCallRunner`
 * actually parses to persist `CallEvent`s / drive the call's status).
 *
 * The outcome->status decision tree is shared with `StubCallRunner` via `computeStubPreTurnSteps`/
 * `computeStubFinalStep` (call-runner.ts) — this class only adds the LiveKit publish side effects
 * and turn/disconnect timing around those steps, never re-deriving the transition rules itself.
 *
 * Turn pacing honors each turn's `delayMs`, except a `user` turn's wait is short-circuited the
 * instant a `user_spoke` data message arrives (Stage 6's browser widget will send this) — so the
 * scenario completes autonomously in an API-only test today, and will feel responsive once a real
 * browser participant is in the room. A room disconnect is detected both mid-turn and — since a
 * call may have no scenario/turns at all — right after the turn-walking phase, so a dropped call
 * is never misreported as COMPLETED/FAILED.
 */
export class StubVoiceSession {
  private room: Room | undefined;
  private readonly logger;

  constructor(private readonly config: StubVoiceSessionConfig) {
    this.logger = createChildLogger({ module: "stub-voice-session", callSid: config.callSid });
  }

  async run(scenario: StubScenario | undefined, onTransition: OnTransition): Promise<void> {
    const room = new Room();
    this.room = room;

    let dropped = false;
    let userSpokeResolve: (() => void) | undefined;
    room.on(RoomEvent.DataReceived, (payload: Uint8Array, _participant, _kind, topic) => {
      if (topic !== DATA_TOPIC) return;
      const message: unknown = JSON.parse(Buffer.from(payload).toString("utf-8"));
      if (typeof message === "object" && message !== null && (message as { type?: string }).type === "user_spoke") {
        userSpokeResolve?.();
      }
    });

    let droppedResolve: (() => void) | undefined;
    const droppedPromise = new Promise<void>((resolve) => {
      droppedResolve = resolve;
    });
    room.on(RoomEvent.Disconnected, () => {
      dropped = true;
      droppedResolve?.();
    });

    const token = await this.buildToken();
    await room.connect(this.config.livekitUrl, token, { autoSubscribe: false, dynacast: false });

    try {
      const outcome = scenario?.outcome ?? "completed";
      const { steps, walkTurns } = computeStubPreTurnSteps(outcome);

      for (const step of steps) {
        await this.applyStep(step, outcome, onTransition);
      }

      if (walkTurns && scenario) {
        for (const turn of scenario.turns) {
          const waitForUserSpoke =
            turn.role === "user"
              ? new Promise<void>((resolve) => {
                  userSpokeResolve = resolve;
                })
              : undefined;

          await Promise.race(
            [sleep(turn.delayMs), waitForUserSpoke, droppedPromise].filter((p): p is Promise<void> => p !== undefined),
          );

          if (dropped || !room.isConnected) break;

          await this.publishTranscript(turn.role, turn.text);
          await onTransition({
            eventType: "transcript_turn",
            payload: { role: turn.role, text: turn.text, delayMs: turn.delayMs },
          });
        }
      }

      // Checked here (not just inside the turn loop above) so a scenario-less call, or one whose
      // outcome never walks turns at all, still reports CALL_DROPPED instead of a false COMPLETED.
      if (walkTurns && (dropped || !room.isConnected)) {
        await onTransition({ status: "CALL_DROPPED", eventType: "call_dropped" });
        return;
      }

      if (walkTurns) {
        await this.applyStep(computeStubFinalStep(outcome), outcome, onTransition);
      }
    } finally {
      await room.disconnect().catch((err: unknown) => {
        this.logger.warn({ err }, "Error disconnecting stub voice session from room");
      });
    }
  }

  private async applyStep(step: CallTransition, outcome: string, onTransition: OnTransition): Promise<void> {
    if (step.status !== undefined && TERMINAL_STATUSES.has(step.status)) {
      await this.publishDataEvent({ type: step.status === "COMPLETED" ? "call_ended" : "call_failed", outcome });
    }
    await onTransition(step);
  }

  private async buildToken(): Promise<string> {
    const token = new AccessToken(this.config.apiKey, this.config.apiSecret, { identity: AGENT_IDENTITY });
    token.addGrant({ room: this.config.roomName, roomJoin: true });
    return token.toJwt();
  }

  private async publishTranscript(role: "agent" | "user", text: string): Promise<void> {
    if (!this.room?.localParticipant) return;
    await this.room.localParticipant.publishTranscription({
      participantIdentity: role === "agent" ? AGENT_IDENTITY : "caller",
      trackSid: "",
      segments: [{ id: crypto.randomUUID(), text, startTime: 0n, endTime: 0n, language: "en", final: true }],
    });
  }

  private async publishDataEvent(payload: Record<string, unknown>): Promise<void> {
    if (!this.room?.localParticipant) return;
    const data = new TextEncoder().encode(JSON.stringify(payload));
    await this.room.localParticipant.publishData(data, { reliable: true, topic: DATA_TOPIC });
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
