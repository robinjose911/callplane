# Webhooks

callplane delivers call-lifecycle events to your own HTTP endpoint via a signed webhook —
deliberately compatible with ElevenLabs' webhook signature format, so if you already have webhook
verification code written for ElevenLabs, it works here unchanged.

## Registering an endpoint

Webhook endpoints are Postgres rows (`WebhookEndpoint`), created and edited from the console's
Webhooks page or via `POST /v1/webhook-endpoints` — never environment variables. Each endpoint has
a URL, a secret (used to sign every delivery), a set of subscribed event types, and an
`isEnabled` flag. Secrets are redacted (`****`) on every read path.

The registered URL is checked against a narrow SSRF guard: it rejects link-local/cloud-metadata
addresses (`169.254.0.0/16`) specifically, but deliberately still allows `localhost` and private
IPs — this is a local-first stack whose own webhook receiver is commonly the same machine running
the demo. See the code comment on `isNotMetadataUrl` in `packages/contracts/src/admin.ts` for the
full reasoning.

## Event types

| Event | Fires when |
|---|---|
| `post_call_transcription` | A call reaches `COMPLETED` — payload includes the full transcript and per-turn timing |
| `call_initiation_failure` | A call ends in `FAILED`, `NO_ANSWER`, `BUSY`, or `CALL_DROPPED` — payload includes a best-effort `reason` (`trunk_unavailable`, `busy`, `no_answer`, `provider_error`, or `unknown`) |

## Signature verification

Every delivery carries two headers:

- `ElevenLabs-Signature: t=<unix-seconds>,v0=<hex-hmac-sha256>` — the HMAC-SHA256 of the string
  `<unix-seconds>.<raw-request-body>`, keyed by the endpoint's secret.
- `X-Idempotency-Key` — unique per (call, event type, endpoint); safe to use for de-duplication if
  your receiver might see a delivery more than once (see Retries below).

Verify it like this (Node.js, but the same shape works in any language):

```js
import { createHmac, timingSafeEqual } from "node:crypto";

function verify(rawBody, signatureHeader, secret) {
  const [tPart, v0Part] = signatureHeader.split(",");
  const timestamp = tPart.split("=")[1];
  const expected = createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");
  const received = v0Part.split("=")[1];
  return timingSafeEqual(Buffer.from(expected), Buffer.from(received));
}
```

Always verify against the **raw request body bytes**, before any JSON parsing — the signature
covers the exact string that was sent.

## Delivery, retries, and replay

Deliveries use a transactional outbox pattern (`WebhookOutbox`): the row is written in the same
step as the triggering event, then a separate `webhook-dispatcher` BullMQ worker picks it up and
POSTs it. A failed delivery (non-2xx response, or a network error) is retried with exponential
backoff (`min(30s * 2^retryCount, 8 hours)`), up to a configured `maxRetries`, after which the
delivery is marked `DEAD`.

Both `DEAD` and already-`DELIVERED` entries can be manually replayed from the call detail page in
the console (or `POST /v1/webhook-outbox/:id/replay`) — useful if your receiver was down and you
want to re-fetch a delivery after fixing it, without waiting for the retry schedule.

## Local testing

There's no `DELETE /v1/webhook-endpoints` route by design — endpoints can only be created/edited/
disabled, matching how you'd manage this in production (soft-disable, don't hard-delete
historical delivery data). If you're registering test endpoints against a local receiver, disable
them when you're done rather than expecting them to be removable.
