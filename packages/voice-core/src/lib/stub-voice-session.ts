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
/** See waitForParticipant's comment — a pragmatic post-join settle window before publishing. */
const PARTICIPANT_SETTLE_DELAY_MS = 1500;

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

  /**
   * @param opts.alreadyInProgress Set by `RealCallRunner` for `channel: "sip"` calls whose SIP
   *   dial phase already walked DIALING -> RINGING -> IN_PROGRESS before this session was ever
   *   constructed — re-running `computeStubPreTurnSteps` here would try IN_PROGRESS -> DIALING
   *   again, an illegal transition. When true, skips straight to the turn-walking phase.
   * @param opts.waitForParticipantIdentity Set by `RealCallRunner` for `channel: "browser"` calls
   *   to the browser's own join identity ("user"). The scenario's own turn delays (e.g. 500ms for
   *   `demo_greeting`) are far shorter than a real browser's WebRTC connect+publish time, so
   *   without this the stub session can complete and leave the room before a human ever joins it
   *   — Stage 6's whole "hero demo" would show an empty transcript. Waits up to
   *   `waitForParticipantTimeoutMs` (default 8s) before proceeding regardless, so an API-only
   *   caller that never actually joins a browser (e.g. Stage 3's existing browser-channel specs)
   *   isn't blocked — it just gets the pre-Stage-6 behavior after the timeout elapses.
   */
  async run(
    scenario: StubScenario | undefined,
    onTransition: OnTransition,
    opts: { alreadyInProgress?: boolean; waitForParticipantIdentity?: string; waitForParticipantTimeoutMs?: number } = {},
  ): Promise<void> {
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

    try {
      await room.connect(this.config.livekitUrl, token, { autoSubscribe: false, dynacast: false });

      if (opts.waitForParticipantIdentity) {
        await this.waitForParticipant(room, opts.waitForParticipantIdentity, opts.waitForParticipantTimeoutMs ?? 8000);
      }

      const outcome = scenario?.outcome ?? "completed";

      if (opts.alreadyInProgress && outcome !== "completed" && outcome !== "failed") {
        // Pre-connection outcomes (busy/no_answer/trunk_failure) don't apply once a SIP dial has
        // already answered — CALL_STATUS_TRANSITIONS only allows IN_PROGRESS -> COMPLETED/FAILED/
        // CALL_DROPPED anyway, so this can only ever resolve to FAILED (computeStubFinalStep's own
        // fallback). Logged because a scenario fixture combined with an already-answered SIP call
        // is a misconfiguration — the scenario's own outcome should be "completed"/"failed" for
        // sip-channel calls; busy/no_answer/trunk_failure are meant to come from the SIP dialer.
        this.logger.warn(
          { scenarioOutcome: outcome },
          "Scenario outcome is a pre-connection outcome but the call is already IN_PROGRESS — treating as failed",
        );
      }

      const { steps, walkTurns } = opts.alreadyInProgress
        ? { steps: [], walkTurns: true }
        : computeStubPreTurnSteps(outcome);

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
          // LiveKit's caption/transcription API (publishTranscript above) is track-scoped — this
          // stub never publishes an actual audio track, so a subscribing browser client can't
          // reliably receive it that way. The already-proven-reliable data channel (used for
          // call_ended/call_failed below) carries the same turn content redundantly, and is what
          // the console's Playground UI (Stage 6) actually listens to build its transcript.
          await this.publishDataEvent({ type: "transcript_turn", role: turn.role, text: turn.text });
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

  private async waitForParticipant(room: Room, identity: string, timeoutMs: number): Promise<void> {
    const hasJoined = () => Array.from(room.remoteParticipants.values()).some((p) => p.identity === identity);

    if (hasJoined()) {
      // Joining a LiveKit room and having a stable data/media transport are two different
      // moments — a participant can appear in `remoteParticipants` before its underlying
      // connection has fully settled. A short fixed delay here is a pragmatic guard against
      // publishing the first transcript segment into a transport that silently drops it.
      await sleep(PARTICIPANT_SETTLE_DELAY_MS);
      return;
    }

    const joined = await new Promise<boolean>((resolve) => {
      const onConnect = (participant: { identity: string }): void => {
        if (participant.identity !== identity) return;
        clearTimeout(timer);
        room.off(RoomEvent.ParticipantConnected, onConnect);
        resolve(true);
      };
      const timer = setTimeout(() => {
        room.off(RoomEvent.ParticipantConnected, onConnect);
        this.logger.warn({ identity, timeoutMs }, "Timed out waiting for participant to join — proceeding anyway");
        resolve(false);
      }, timeoutMs);
      room.on(RoomEvent.ParticipantConnected, onConnect);
    });

    if (joined) {
      await sleep(PARTICIPANT_SETTLE_DELAY_MS);
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
