# ADR 0002: Failover happens at call-initiation only, never mid-call

## Status

Accepted.

## Context

Two independent things can fail when placing a call: the AI provider session (an S2S/LLM/STT/TTS
API can be down or rate-limited) and the SIP trunk (a telephony carrier can reject a call or be
unreachable). Both have multiple configured candidates in priority order, so a natural question is:
if the *currently in-progress* provider or trunk fails partway through a live conversation, should
the system automatically re-route to the next candidate and keep the call alive?

## Decision

No. Both `packages/voice-core/src/lib/failover-resolver.ts` (provider selection) and
`packages/voice-core/src/lib/trunk-selector.ts` (SIP trunk selection) only run once, at the moment
a call is first being dialed. Once a call reaches `IN_PROGRESS`, a failure of the provider session
or the trunk ends that call — it is never silently re-routed to a different provider or trunk
mid-conversation.

## Consequences

- **Simpler to reason about.** A call's provider and trunk are fixed for its entire lifetime,
  visible in its `CallEvent` trail. There's no scenario where "which provider handled this call"
  has more than one answer.
- **No mid-call state-transfer problem.** Re-routing a live conversation mid-call would require
  transferring conversation state (transcript history, in-progress LLM context) to a brand new
  provider session — a genuinely hard problem (different providers have different context formats,
  different latency characteristics, different failure semantics) that this repo does not attempt
  to solve.
- **A mid-call failure is a real, visible failure**, not silently masked by a failover that might
  itself introduce a jarring conversational discontinuity (a different voice, a lost turn, a
  multi-second gap) that could be worse than simply ending the call.
- **The trade-off is real**: a customer-facing production deployment might prefer the resilience of
  mid-call failover over a dropped call, accepting the discontinuity. That's a legitimate design
  point this repo doesn't build for — if you need it, it would need to be layered on top,
  understanding the state-transfer problem above.
- Both failover paths are exercised end-to-end: `e2e/stage4-sip-failover.spec.ts` proves a trunk
  that fails on the first candidate succeeds on the next at call-init time, and there's no code
  path that attempts to re-select mid-call — the call executor's state machine simply doesn't have
  a "re-dial mid-call" transition.
