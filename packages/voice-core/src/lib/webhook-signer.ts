import { createHmac } from "node:crypto";

/**
 * Builds the `ElevenLabs-Signature` header value: `t=<unix-seconds>,v0=<hex-hmac-sha256>` over
 * the string `<unix-seconds>.<raw-body>` — this exact format is documented in CLAUDE.md as a
 * compatibility feature (drop-in for existing ElevenLabs webhook verifiers), not an arbitrary
 * choice. `body` must be the exact bytes sent over the wire (the caller signs, then sends the
 * same string) so the receiver's signature check lines up byte-for-byte.
 */
export function signWebhookPayload(secret: string, body: string, timestampSeconds: number): string {
  const hex = createHmac("sha256", secret).update(`${timestampSeconds}.${body}`).digest("hex");
  return `t=${timestampSeconds},v0=${hex}`;
}
