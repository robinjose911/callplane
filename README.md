# callplane

[![CI](https://github.com/robinjose911/callplane/actions/workflows/ci.yml/badge.svg)](https://github.com/robinjose911/callplane/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D22-brightgreen)](https://nodejs.org)

> A production-grade AI voice agent control plane — three voice modes, multi-provider failover,
> SIP telephony, reliable webhooks, cost metering, and a self-service admin console. Runs and demos
> with **zero external API keys** via a stub-first architecture.

Clone it, run one command, and you're placing calls, watching live transcripts, and inspecting
signed webhook deliveries in under two minutes — no Gemini/OpenAI/Deepgram/ElevenLabs/Telnyx
account required.

## Quickstart (Tier 1 — no API keys)

```bash
git clone https://github.com/robinjose911/callplane.git
cd callplane
docker compose --profile full up -d   # Redis + a local LiveKit dev server
npm install
npm run setup                          # env files + db push + seed (idempotent)
turbo dev                              # api:4300, worker, console:4400
```

Open [http://localhost:4400](http://localhost:4400) (`admin` / `dev-local-only-change-me`), go to
**Playground**, pick an agent, and place a call — it joins a real LiveKit room and plays back a
scripted conversation in real time, transcript and all. See it end-to-end in the console's **Calls**
page: live status, transcript, cost breakdown, webhook delivery log, and a playable recording.

Every one of those pieces — the LiveKit room, the Postgres rows, the BullMQ jobs, the webhook HMAC
signature — is real. Only the *AI provider* and *telephony carrier* are stubbed. See
[**Why this exists**](#why-this-exists) below.

## What you get

| Capability | Where |
|---|---|
| 3 voice modes: `realtime` (native speech-to-speech), `cascade` (STT→LLM→TTS), `half_cascade` | Agent configs, console → Agents |
| Multi-provider failover, at call-init (never mid-call, [by design](./docs/adr/0002-failover-at-init-only.md)) | `packages/voice-core` |
| SIP telephony with trunk failover | Console → Trunks, [docs/telephony.md](./docs/telephony.md) |
| ElevenLabs-compatible signed webhooks, retried with backoff, replayable | Console → Webhooks, [docs/webhooks.md](./docs/webhooks.md) |
| Per-call, per-provider-leg cost metering, editable price table | Console → Costs / Settings, [docs/cost-model.md](./docs/cost-model.md) |
| Call recording (pluggable storage adapter) | Call detail page |
| Self-service admin console (Next.js 15) | `apps/console` |

## Feature matrix

| Voice mode | Providers | Notes |
|---|---|---|
| `realtime` | Gemini Live, OpenAI Realtime, Azure OpenAI Realtime | Native speech-to-speech, one provider handles STT+LLM+TTS |
| `cascade` | Deepgram (STT) + OpenAI/Google/Azure (LLM) + ElevenLabs/Cartesia (TTS) | Classic pipeline, swap any leg independently |
| `half_cascade` | Gemini/OpenAI/Azure (STT+LLM combo) + ElevenLabs/Cartesia (TTS) | Realtime understanding, cascaded voice |

## Architecture, in one picture

```mermaid
flowchart LR
    Browser["Browser\n(Playground)"] -->|joins room| LiveKit
    Browser -->|session cookie| Console["apps/console"]
    Console -->|Bearer API key| API["apps/api"]
    API -->|enqueue| Redis[("Redis / BullMQ")]
    Redis --> Worker["apps/worker\n(BullMQ + LiveKit Agent)"]
    Worker -->|joins room| LiveKit["LiveKit"]
    API --> DB[("Postgres")]
    Worker --> DB
```

Full breakdown, including the call lifecycle and the stub-first design, in
[docs/architecture.md](./docs/architecture.md).

## Why this exists

Most voice-agent reference repos either (a) need real API keys before you can see anything work,
or (b) are toy demos that skip the parts that make a *production* control plane hard: reliable
webhook delivery with retries, cost accounting, SIP trunk failover, an admin console non-engineers
can actually use. callplane tries to close that gap — a stack that's honest about what "demo" vs.
"production-grade" means, and stub-first specifically so the demo and the production code path are
the same code, not two implementations that drift apart. See
[ADR 0001](./docs/adr/0001-stub-as-demo-mode.md) for the full reasoning.

**How this compares:**

- **LiveKit Agents examples** — excellent for learning the LiveKit Agents SDK itself, but they're
  single-file scripts, not a multi-tenant control plane with an admin UI, webhook delivery, or cost
  accounting.
- **Pipecat** — a strong pipeline framework for building the agent *runtime* itself; callplane is
  one layer up — the control plane that creates, monitors, and bills calls that a runtime like this
  (or LiveKit Agents, which is what callplane itself uses) executes.
- **Vapi / Retell-style hosted platforms** — closed-source SaaS; callplane is the open-source,
  self-hosted, read-the-whole-stack alternative, at the cost of you operating it yourself.

## Testing philosophy

Every stage of this build is verified by automation — no manual click-through required to prove a
feature works. Real Postgres, real Redis, a real local LiveKit server; only the AI provider SDKs
and the SIP dialer are stubbed. See [`PLAN.md`](./PLAN.md) for the stage-by-stage build log (every
stage: what shipped, what was tested, what was found in code review).

## Docs

- [docs/architecture.md](./docs/architecture.md) — services, call lifecycle, data model, stub design
- [docs/providers.md](./docs/providers.md) — turning on real AI providers (Tier 2)
- [docs/telephony.md](./docs/telephony.md) — SIP trunks, stub magic numbers, real PSTN (Tier 3)
- [docs/webhooks.md](./docs/webhooks.md) — signature verification, retries, replay
- [docs/cost-model.md](./docs/cost-model.md) — metering, price table, unpriced-provider handling
- [docs/adr/](./docs/adr/) — architecture decision records
- [MAINTENANCE.md](./MAINTENANCE.md) — this is a reference snapshot, not a supported product
- [CONTRIBUTING.md](./CONTRIBUTING.md) — local setup, secret scanning

## License

MIT — see [LICENSE](./LICENSE).
