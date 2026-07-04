# Telephony (SIP trunks)

By default (`SIP_STUB_MODE=true`), no telephony account is needed — outbound "calls" are simulated
by a stub dialer whose outcome is driven by magic numbers in the dialed phone number. This doc
covers both the stub behavior (Tier 1, always on) and real PSTN trunk setup (Tier 3).

## Stub dialer magic numbers

When `SIP_STUB_MODE=true`, `StubSipDialer` inspects the last 4 digits of the dialed E.164 number
instead of actually dialing anything:

| Suffix | Outcome |
|---|---|
| `…0000` (or any other unlisted suffix) | Answers normally |
| `…0001` | Busy |
| `…0002` | No answer |
| `…0003` | Fails on the first trunk tried, then succeeds on the next candidate trunk — this is how the failover path is demonstrated without a real telephony provider |

These are exercised directly from the console's Playground/New Call dialog and by
`e2e/stage4-sip-failover.spec.ts` / `e2e/stage7-outbound.spec.ts`.

## SIP trunks are config, not env vars

Per this repo's D6 convention, SIP trunks are Postgres rows (`SipTrunk`), created and edited from
the console's Trunks page — never environment variables. A trunk row holds the provider's SIP
credentials, a priority order (for failover), and an `isActive` flag. Trunk credentials are
redacted (`****`) on every API read path; this is a tested invariant, not a convention you can
accidentally regress without a test catching it.

## Failover is call-initiation only

If the highest-priority active trunk fails to answer, `trunk-selector.ts` tries the next one in
priority order — but only when the call is first being dialed. Once a call is `IN_PROGRESS` on a
given trunk, a mid-call trunk failure ends that call; it is never silently re-routed to a different
trunk mid-conversation. See [ADR 0002](./adr/0002-failover-at-init-only.md) for why.

## Turning on a real PSTN trunk (Tier 3)

1. Get SIP trunk credentials from a real provider (Telnyx, Twilio Elastic SIP Trunking, etc.).
2. In the console, go to Trunks → New Trunk, and enter the provider's SIP URI, credentials, and a
   priority. Set `SIP_STUB_MODE=false` in `apps/api/.env` and `apps/worker/.env`, and restart.
3. Place an outbound call from the Playground or via `POST /v1/calls` with a real E.164 `toNumber`
   — LiveKit's SIP integration dials out through the configured trunk.

This repo does not include LiveKit's direct-trunk (BYO-SIP-gateway) mode — see
[Stage 11 in `PLAN.md`](../PLAN.md#stage-11-post-v1-recorded-not-built-here) for that and other
post-v1 telephony work.
