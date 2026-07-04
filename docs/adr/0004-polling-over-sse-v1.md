# ADR 0004: The live call monitor polls; it doesn't use SSE/WebSockets, in v1

## Status

Accepted for v1. Revisit post-v1 (tracked in `PLAN.md`'s Stage 11 section).

## Context

The console's call detail page needs to show a call's status, transcript, cost, and webhook
delivery state updating live while a call is in progress. The two standard approaches are
server-push (Server-Sent Events or WebSockets) or client polling.

## Decision

v1 uses plain polling: the call detail page's client component re-fetches call state, events,
cost, and webhook delivery status every 1000ms while the call is non-terminal, and stops once the
call reaches a terminal status and its dependent data (webhook deliveries, in particular) has
settled.

## Consequences

- **Simpler to build and reason about correctly.** Every poll tick is a plain request/response —
  no persistent connection lifecycle to manage, no reconnection logic, no server-side subscription
  bookkeeping. The actual complexity that emerged during development (an empty-array vacuous-truth
  bug in the "are deliveries settled" check, a stop condition that needed to be re-checked inside
  the running interval itself, not just on effect re-evaluation) was already non-trivial with plain
  polling — SSE/WebSockets would add a second layer of state machine on top of that.
- **Good enough for this stack's actual load.** A handful of engineers watching a handful of demo
  calls in a console is not a scenario where 1-second polling meaningfully taxes the API server —
  this is not a customer-facing dashboard serving thousands of concurrent live-call viewers.
- **The real cost is at scale**: polling means N open browser tabs watching calls is N times the
  request rate, growing linearly with viewers rather than being broadcast from one server-side
  event source. If this stack were extended toward genuinely high concurrent viewer counts, SSE (a
  natural fit — one-directional, server-to-client, works over plain HTTP) would be the next step.
- **Explicitly scoped as v1-only**: this ADR exists so a future contributor doesn't have to
  reverse-engineer whether polling was an oversight or a decision — it was a decision, made for the
  reasons above, and the SSE upgrade is intentionally deferred, not forgotten.
