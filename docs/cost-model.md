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
`StorageAdapter` abstraction (`packages/voice-core/src/lib/storage-adapter.ts`). Which
implementation is used is picked by `buildStorageAdapter()` (`packages/voice-core/src/lib/
build-storage-adapter.ts`) based on `STORAGE_ADAPTER`:

- **`STORAGE_ADAPTER` unset or `local`** (the default) — a `LocalDiskAdapter` that writes to
  `RECORDINGS_DIR` (default `/tmp/callplane-recordings` — set explicitly and identically in both
  `apps/api/.env` and `apps/worker/.env`, since each process resolves a relative default against
  its own working directory otherwise).
- **`STORAGE_ADAPTER=azure-blob`** — an `AzureBlobAdapter` (`packages/voice-core/src/lib/
  azure-blob-adapter.ts`), requiring `AZURE_STORAGE_CONNECTION_STRING` and
  `AZURE_STORAGE_CONTAINER` to also be set (both in `apps/api/.env` and `apps/worker/.env`).
  Unit-tested against a mocked `ContainerClient`, the same pattern used for every real AI provider
  integration in this repo — there's no real-Azure-account integration test, matching how real
  provider correctness is out of scope for this stack's automated test suite (see
  [docs/providers.md](./providers.md)).

Either way, the recording is streamed back through `GET /v1/calls/:callSid/recording` and played
from an `<audio>` element on the call detail page — the route doesn't know or care which adapter
produced the bytes. LiveKit's own Cloud Egress (for capturing *real* provider audio, not the stub's
silent WAV) remains tracked as separate post-v1 work.

## Aggregates

`/costs` shows an all-time total and a per-provider breakdown (bar chart) across the most recent
500 cost rows. Date-ranged and per-agent-config breakdowns were scoped out of the current build —
`CallCost` only references `callSid`, so a per-config view would need a join through `Call`. Both
are straightforward additions if you need them; they weren't required to prove the underlying
metering logic is correct.
