# Cost model

Every completed call gets an itemized cost breakdown, priced from a console-editable price table
— not hardcoded rates, and not a black box.

## How a call is metered

Each voice mode uses a different set of provider "legs":

| Voice mode | Legs metered |
|---|---|
| `realtime` | S2S tokens |
| `cascade` | STT seconds + LLM tokens + TTS characters |
| `half_cascade` | S2S tokens (STT+LLM combo) + TTS characters |

When a call reaches `COMPLETED`, `meterCallUsage` (a pure function,
`packages/voice-core/src/lib/cost-meter.ts`) picks out the legs that apply to that call's agent
config, looks up each leg's rate in the `PriceTable`, and computes `units × pricePerUnit` per leg.
`meterCallCost` then persists one `CallCost` row per priced leg.

In stub mode, usage numbers are fixed per scenario (`demo_greeting`, `demo_booking`) rather than
derived from real token counts — this is what makes the e2e cost assertions exact to the cent
instead of approximate. A real provider integration would report real usage from the provider
SDK's own response metadata; wiring that up for the real (non-stub) call path is tracked as
post-v1 work (see `PLAN.md`'s Stage 11 section).

## The price table

`PriceTable` rows are seeded with illustrative example rates (not real, current provider pricing)
and are fully editable from the console's Settings page. A rate change takes effect on the *next*
call metered — it never retroactively changes already-recorded `CallCost` rows.

One subtlety: `PriceTable.pricePerUnit` is a `Decimal(18,6)` column — a rate with more than 6
fractional digits gets silently rounded by Postgres. If you're entering a rate that needs more
precision than that (e.g. a fractional-cent-per-token LLM price), check what actually got stored
before relying on it for exact accounting.

## Unpriced providers

If an agent config points at a provider with no matching `PriceTable` row (for example, the
seeded `demo-azure-realtime` config — deliberately left unpriced as a live demonstration of this
path), that leg is **not** silently priced at zero. Instead, a `cost_unpriced_leg` `CallEvent` is
recorded, visible in that call's raw-events accordion in the console. It currently does **not**
show up in the `/costs` dashboard's aggregate totals — see `PLAN.md`'s Stage 9 notes for the
schema change (a nullable `costAmount` or a `status` column on `CallCost`) that would be needed to
surface it there too.

## Recording

`RECORDING_MODE=stub` writes a deterministic silent WAV file per completed call through a
`StorageAdapter` abstraction (`packages/voice-core/src/lib/storage-adapter.ts`), currently backed
by a `LocalDiskAdapter` that writes to `RECORDINGS_DIR` (default `/tmp/callplane-recordings` — set
explicitly and identically in both `apps/api/.env` and `apps/worker/.env`, since each process
resolves a relative default against its own working directory otherwise). The recording is
streamed back through `GET /v1/calls/:callSid/recording` and played from an `<audio>` element on
the call detail page. Cloud storage (Azure Blob, or LiveKit's own Cloud Egress for real
provider audio) is tracked as post-v1 work — the `StorageAdapter` interface exists specifically so
that's a drop-in adapter, not a rewrite.

## Aggregates

`/costs` shows an all-time total and a per-provider breakdown (bar chart) across the most recent
500 cost rows. Date-ranged and per-agent-config breakdowns were scoped out of the current build —
`CallCost` only references `callSid`, so a per-config view would need a join through `Call`. Both
are straightforward additions if you need them; they weren't required to prove the underlying
metering logic is correct.
