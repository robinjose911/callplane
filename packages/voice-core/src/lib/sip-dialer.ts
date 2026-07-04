import { SipClient } from "livekit-server-sdk";
import type { LiveKitClientConfig } from "./room-manager.js";

/** Callee-side outcome of a SIP dial attempt — none of these are trunk failures. */
export type SipDialOutcome = "answered" | "busy" | "no_answer";

export interface SipDialParams {
  roomName: string;
  toNumber: string;
  /** LiveKit SIP outbound trunk ID (from `sip_trunks.livekit_trunk_id`). */
  sipTrunkId: string;
  participantIdentity: string;
}

export interface SipDialResult {
  outcome: SipDialOutcome;
  /** Only present when `outcome === "answered"`. */
  participantSid?: string;
}

/**
 * Thrown only for trunk-level failures (carrier/network/auth issues) — distinct from a callee
 * declining or not answering. The caller (`RealCallRunner`) retries the next trunk on this error,
 * but treats `busy`/`no_answer` as terminal (retrying a different trunk can't un-decline a call).
 */
export class SipTrunkError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SipTrunkError";
  }
}

export interface SipDialer {
  dialOut(params: SipDialParams): Promise<SipDialResult>;
}

function mapToOutcomeOrThrow(err: unknown): SipDialOutcome {
  const msg = err instanceof Error ? err.message.toLowerCase() : String(err).toLowerCase();
  if (msg.includes("busy") || msg.includes("486")) return "busy";
  if (msg.includes("no answer") || msg.includes("480") || msg.includes("487")) return "no_answer";
  throw new SipTrunkError(`SIP trunk-level dial failure: ${err instanceof Error ? err.message : String(err)}`);
}

/**
 * Factory for a real LiveKit SIP dialer. Never actually invoked live in this repo's own loop
 * (`SIP_STUB_MODE=true` always routes through `StubSipDialer` instead) — exists for architectural
 * completeness and is typechecked against the real SDK, matching Stage 3.2's provider factories.
 */
export function createLiveKitSipDialer(config: LiveKitClientConfig): SipDialer {
  const client = new SipClient(config.livekitUrl, config.apiKey, config.apiSecret);

  return {
    async dialOut({ roomName, toNumber, sipTrunkId, participantIdentity }): Promise<SipDialResult> {
      try {
        const participant = await client.createSipParticipant(sipTrunkId, toNumber, roomName, {
          participantIdentity,
          participantName: "Caller",
          waitUntilAnswered: true,
        });
        return { outcome: "answered", participantSid: participant.participantId };
      } catch (err) {
        const outcome = mapToOutcomeOrThrow(err);
        return { outcome };
      }
    },
  };
}
