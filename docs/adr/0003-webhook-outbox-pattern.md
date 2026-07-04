# ADR 0003: Webhook delivery uses a transactional outbox, not fire-and-forget

## Status

Accepted.

## Context

A naive webhook implementation calls the customer's endpoint synchronously (or fires an
async HTTP request) at the moment an event happens, and doesn't record that it happened. If the
call fails — network blip, the customer's server is temporarily down, a timeout — that delivery is
just gone. There's no record it was ever attempted, no way to retry, and no way for the customer to
ask "what deliveries have you sent me, and did they succeed?"

## Decision

Every webhook delivery is first written as a row in `WebhookOutbox` (callSid, endpoint, event
type, payload, an idempotency key, retry count, status), in the *same* step that decided the
delivery should happen — before any HTTP request is attempted. A separate `webhook-dispatcher`
BullMQ worker then picks up outbox rows and performs the actual delivery, updating the row's status
as it goes (`PENDING → DELIVERED`, or `PENDING → RETRY_PENDING → ... → DEAD` after exhausting
retries).

## Consequences

- **Nothing is lost.** Even if the dispatcher worker crashes mid-delivery, or Redis has a blip, the
  outbox row already exists in Postgres — the job can be re-enqueued and delivery attempted again.
- **Retries are principled**, not "try once and give up": exponential backoff
  (`min(30s * 2^retryCount, 8 hours)`) up to a configurable `maxRetries`, after which the row is
  marked `DEAD` rather than retried forever.
- **Idempotency is built in**, not bolted on: each outbox row's idempotency key is
  `<callSid>:<eventType>:<endpointId>` (extended beyond the two-part `<callSid>:<eventType>` format
  to disambiguate multiple endpoints subscribed to the same event), sent as `X-Idempotency-Key` on
  every delivery, so a customer's receiver can safely de-duplicate if a delivery is somehow
  attempted twice.
- **Replay is a first-class operation**, not a manual database fix: both `DEAD` and already-
  `DELIVERED` outbox rows can be replayed from the console or via
  `POST /v1/webhook-outbox/:id/replay`, which resets the row and re-enqueues it — useful after
  fixing a receiver that was down, without waiting out the backoff schedule.
- **The cost is one more table and one more worker** compared to fire-and-forget — a deliberate
  trade for a customer-facing reliability guarantee ("we will keep trying, and you can ask what we
  tried") that a synchronous webhook call can't make.
