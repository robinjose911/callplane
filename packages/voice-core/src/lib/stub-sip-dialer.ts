import type { SipDialer, SipDialParams, SipDialResult } from "./sip-dialer.js";
import { SipTrunkError } from "./sip-dialer.js";

/**
 * `SIP_STUB_MODE=true` dialer — the outcome is selected by the last 4 digits of `toNumber`
 * (documented in CLAUDE.md): `…0000` answers, `…0001` busy, `…0002` no-answer, `…0003` trunk
 * failure. Any other suffix answers (the common/happy-path default), so ad-hoc demo numbers
 * without a magic suffix still complete a call.
 *
 * A fresh `StubSipDialer` is constructed per call (see `apps/worker`'s `buildDefaultRunner`), so
 * this instance's `trunkFailureAttempts` counter is naturally scoped to a single call: the
 * `…0003` suffix fails only the first trunk tried, then answers on the next candidate — letting
 * an e2e spec observe a real trunk-1-fails-trunk-2-succeeds failover instead of every trunk
 * failing identically (which would only ever demonstrate "all trunks exhausted").
 */
export class StubSipDialer implements SipDialer {
  private trunkFailureAttempts = 0;

  async dialOut({ toNumber }: SipDialParams): Promise<SipDialResult> {
    if (toNumber.endsWith("0001")) return { outcome: "busy" };
    if (toNumber.endsWith("0002")) return { outcome: "no_answer" };
    if (toNumber.endsWith("0003")) {
      this.trunkFailureAttempts += 1;
      if (this.trunkFailureAttempts === 1) {
        throw new SipTrunkError(`Stub trunk failure for ${toNumber}`);
      }
      return { outcome: "answered", participantSid: "stub-sip-participant" };
    }
    return { outcome: "answered", participantSid: "stub-sip-participant" };
  }
}
