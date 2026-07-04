import type { Call, CallEvent } from "@callplane/database";
import type { TranscriptTurn } from "@callplane/contracts";

/**
 * Builds the `post_call_transcription` webhook's transcript array from `transcript_turn`
 * `CallEvent`s — `time_in_call_secs` is the offset from the call's own `createdAt`, matching
 * ElevenLabs' convention of timing relative to call start rather than an absolute timestamp.
 */
export function extractTranscript(call: Call, events: CallEvent[]): TranscriptTurn[] {
  return events
    .filter((event) => event.eventType === "transcript_turn")
    .map((event) => {
      const payload = event.payload as { role?: "agent" | "user"; text?: string } | null;
      return {
        role: payload?.role ?? "agent",
        message: payload?.text ?? "",
        time_in_call_secs: Math.max(0, Math.floor((event.createdAt.getTime() - call.createdAt.getTime()) / 1000)),
      };
    });
}
