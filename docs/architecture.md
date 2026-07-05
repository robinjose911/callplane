# Architecture

callplane is a Turbo monorepo with three long-running services and five shared packages. This
doc explains how a call actually flows through the system, and why the pieces are split the way
they are. Eight diagrams below cover it end to end — services, lifecycle, status transitions,
the stub-first design, failover, SIP telephony, webhook delivery, and the data model.

## Services

```mermaid
%%{init: {
  "theme": "base",
  "themeVariables": {
    "primaryColor": "#F1EFFA",
    "primaryTextColor": "#2A2A2A",
    "primaryBorderColor": "#714EC4",
    "secondaryColor": "#E7F2FF",
    "secondaryBorderColor": "#0E6995",
    "tertiaryColor": "#FFF4E6",
    "tertiaryBorderColor": "#E1AB2F",
    "lineColor": "#5F5F5F",
    "textColor": "#404040",
    "mainBkg": "#F1EFFA",
    "clusterBkg": "#F2F5F7",
    "clusterBorder": "#E0E0E0",
    "edgeLabelBackground": "#FCFCFC",
    "fontFamily": "Inter, -apple-system, sans-serif",
    "fontSize": "14px"
  }
}}%%
flowchart LR
    classDef primary fill:#F1EFFA,stroke:#714EC4,stroke-width:2px,color:#2A2A2A
    classDef secondary fill:#E7F2FF,stroke:#0E6995,stroke-width:2px,color:#2A2A2A
    classDef external fill:#F0F0F0,stroke:#808080,stroke-width:1.5px,color:#404040,stroke-dasharray: 4 2

    subgraph Client
        Browser["Browser (Playground)"]:::primary
        SIP["SIP caller (PSTN)"]:::external
    end

    subgraph Plane["callplane"]
        Console["apps/console\nNext.js admin UI"]:::primary
        API["apps/api\nExpress REST API"]:::primary
        Worker["apps/worker\nBullMQ workers +\nLiveKit Agent Worker"]:::secondary
        DB[("Postgres\nschema: callplane")]:::secondary
        Redis[("Redis\nBullMQ, prefix: callplane")]:::secondary
        LiveKit["LiveKit\nreal-time media server"]:::secondary
    end

    Browser -->|joins room| LiveKit
    Browser -->|REST, session cookie| Console
    Console -->|server-side fetch,\nBearer API key| API
    SIP -->|SIP trunk| LiveKit
    API -->|POST /v1/calls| Redis
    Redis -->|call-executor job| Worker
    Worker -->|joins room, runs agent| LiveKit
    Worker -->|webhook-dispatcher job| Redis
    API --> DB
    Worker --> DB
```

- **`apps/api`** is a stateless Express REST API. It never talks to LiveKit or BullMQ workers
  directly — it validates a request, writes a `Call` row, and enqueues a `call-executor` job.
  Every route requires a Bearer `CALLPLANE_API_KEY`, checked with a constant-time comparison.
- **`apps/worker`** runs two things in one process: BullMQ workers (`call-executor`,
  `webhook-dispatcher`) and the LiveKit Agent Worker (the process LiveKit invokes per-room to run
  the actual voice agent). Splitting these into separate apps was considered and rejected — they
  share the same provider/session code and scaling them independently isn't needed at this stage.
- **`apps/console`** is a Next.js 15 App Router admin UI. It never calls the API directly from the
  browser — every data fetch goes through a Server Component or a thin API proxy route
  (`apps/console/src/app/api/**/route.ts`) that attaches the API key server-side. This means the
  API key never reaches client-side JavaScript, and there's no CORS configuration to get wrong.

## A call's lifecycle

```mermaid
%%{init: {
  "theme": "base",
  "themeVariables": {
    "primaryColor": "#F1EFFA",
    "primaryTextColor": "#2A2A2A",
    "primaryBorderColor": "#714EC4",
    "secondaryColor": "#E7F2FF",
    "secondaryBorderColor": "#0E6995",
    "tertiaryColor": "#FFF4E6",
    "tertiaryBorderColor": "#E1AB2F",
    "lineColor": "#5F5F5F",
    "textColor": "#404040",
    "actorBkg": "#F1EFFA",
    "actorBorder": "#714EC4",
    "fontFamily": "Inter, -apple-system, sans-serif",
    "fontSize": "14px"
  }
}}%%
sequenceDiagram
    participant Client as Client (Playground / API)
    participant API as apps/api
    participant Redis as Redis (BullMQ)
    participant Worker as apps/worker
    participant LiveKit as LiveKit
    participant DB as Postgres
    participant WH as webhook-dispatcher

    Client->>API: POST /v1/calls
    API->>DB: create Call (QUEUED)
    API->>Redis: enqueue call-executor job
    API-->>Client: 200 { callSid, status: QUEUED }

    Redis->>Worker: deliver job
    Worker->>DB: CallEvent (DIALING)
    Worker->>LiveKit: create room, dispatch agent
    LiveKit->>Worker: agent joined
    Worker->>DB: CallEvent (RINGING → IN_PROGRESS)

    loop conversation
        LiveKit->>Worker: transcript segment
        Worker->>DB: CallEvent (transcript)
    end

    LiveKit->>Worker: call ended
    Worker->>DB: Call.status = COMPLETED

    par side effects (independently caught)
        Worker->>Redis: enqueue webhook job
        Worker->>DB: write CallCost
        Worker->>DB: write Recording
    end

    Redis->>WH: deliver webhook job
    WH->>WH: sign payload (ElevenLabs-Signature)
    WH-->>Client: POST post_call_transcription
```

1. **Initiate.** `POST /v1/calls` (from the console's Playground, or any API client) validates the
   request against `packages/contracts`' Zod schemas, resolves the named `AgentConfig`, creates a
   `Call` row in `QUEUED` status, and enqueues a `call-executor` job in BullMQ.
2. **Execute.** The `call-executor` worker picks up the job. It resolves a `CallRunner` — the
   `RealCallRunner` for a live call, or `StubCallRunner`/`StubVoiceSession` when
   `PROVIDER_STUB_MODE=true` (see [Stub-first architecture](#the-stub-first-architecture) below) —
   and walks the call through its lifecycle, appending a `CallEvent` row and updating
   `Call.status` at each transition (`QUEUED → DIALING → RINGING → IN_PROGRESS → COMPLETED`, or
   one of the failure/rejection statuses — see [Call status state machine](#call-status-state-machine)).
3. **Converse.** For a real call, the worker's LiveKit Agent Worker joins the room, opens a
   provider session (Gemini Live / OpenAI Realtime / Azure OpenAI Realtime for `realtime` mode; a
   Deepgram → LLM → ElevenLabs/Cartesia pipeline for `cascade`; a realtime S2S combo + separate TTS
   for `half_cascade`), and streams audio both directions until the call ends.
4. **Wrap up.** Once the call reaches a terminal status, the `call-executor`'s `finally` block runs
   three independent side effects: enqueue any subscribed webhooks
   (`enqueueWebhooksForCall`), meter the call's cost per provider leg (`meterCallCost`), and write
   a recording artifact (`recordCallStub` in stub mode). Each is individually caught and logged —
   one failing never blocks or corrupts the others, or the call's own final status.
5. **Deliver.** The `webhook-dispatcher` worker picks up any enqueued webhook jobs, signs the
   payload (`ElevenLabs-Signature` format — see [Webhook delivery](#webhook-delivery) and
   [webhooks.md](./webhooks.md)), and POSTs it with exponential backoff on failure.

## Call status state machine

```mermaid
%%{init: {
  "theme": "base",
  "themeVariables": {
    "primaryColor": "#F1EFFA",
    "primaryTextColor": "#2A2A2A",
    "primaryBorderColor": "#714EC4",
    "secondaryColor": "#E7F2FF",
    "secondaryBorderColor": "#0E6995",
    "tertiaryColor": "#FFF4E6",
    "tertiaryBorderColor": "#E1AB2F",
    "lineColor": "#5F5F5F",
    "textColor": "#404040",
    "fontFamily": "Inter, -apple-system, sans-serif",
    "fontSize": "14px"
  }
}}%%
stateDiagram-v2
    [*] --> QUEUED
    QUEUED --> DIALING
    DIALING --> RINGING
    DIALING --> FAILED: no trunk/provider available
    RINGING --> IN_PROGRESS
    RINGING --> NO_ANSWER
    RINGING --> BUSY
    IN_PROGRESS --> COMPLETED
    IN_PROGRESS --> CALL_DROPPED
    QUEUED --> CALL_INITIATION_FAILED: all trunks/providers exhausted

    COMPLETED --> [*]
    FAILED --> [*]
    NO_ANSWER --> [*]
    BUSY --> [*]
    CALL_DROPPED --> [*]
    CALL_INITIATION_FAILED --> [*]

    note right of QUEUED
        Every transition writes an
        append-only CallEvent row.
        Illegal transitions throw —
        the state machine is enforced
        in code, not just in docs.
    end note
```

`packages/contracts`' `call-status.ts` is the single source of truth for which transitions are
legal; the worker throws rather than silently writing an out-of-order status. This is what makes
the console's live call monitor trustworthy — the status you see is never a guess.

## The stub-first architecture

Every external dependency — the AI provider SDKs, the SIP dialer, the recording pipeline — has a
stub implementation that's a normal, first-class code path, not test scaffolding bolted on the
side.

```mermaid
%%{init: {
  "theme": "base",
  "themeVariables": {
    "primaryColor": "#F1EFFA",
    "primaryTextColor": "#2A2A2A",
    "primaryBorderColor": "#714EC4",
    "secondaryColor": "#E7F2FF",
    "secondaryBorderColor": "#0E6995",
    "tertiaryColor": "#FFF4E6",
    "tertiaryBorderColor": "#E1AB2F",
    "lineColor": "#5F5F5F",
    "textColor": "#404040",
    "mainBkg": "#F1EFFA",
    "clusterBkg": "#F2F5F7",
    "clusterBorder": "#E0E0E0",
    "edgeLabelBackground": "#FCFCFC",
    "fontFamily": "Inter, -apple-system, sans-serif",
    "fontSize": "14px"
  }
}}%%
flowchart TB
    classDef primary fill:#F1EFFA,stroke:#714EC4,stroke-width:2px,color:#2A2A2A
    classDef secondary fill:#E7F2FF,stroke:#0E6995,stroke-width:2px,color:#2A2A2A
    classDef tertiary fill:#FFF4E6,stroke:#E1AB2F,stroke-width:2px,color:#2A2A2A
    classDef external fill:#F0F0F0,stroke:#808080,stroke-width:1.5px,color:#404040,stroke-dasharray: 4 2

    Worker["call-executor worker"]:::primary --> Iface["CallRunner interface"]:::primary

    Iface --> Real["RealCallRunner"]:::secondary
    Iface --> Stub["StubCallRunner"]:::secondary

    subgraph RealDeps["real, PROVIDER_STUB_MODE=false"]
        direction TB
        RSess["Real provider session\n(Gemini / OpenAI / Azure)"]:::external
        RSip["Real SIP dial\n(Telnyx / Twilio via LiveKit)"]:::external
        RRec["LiveKit Cloud Egress"]:::external
    end

    subgraph StubDeps["stub, PROVIDER_STUB_MODE=true"]
        direction TB
        SSess["StubVoiceSession\nscripted transcript in a\nreal LiveKit room"]:::tertiary
        SSip["StubSipDialer\nmagic-number outcomes"]:::tertiary
        SRec["Stub recorder\nlocal deterministic WAV"]:::tertiary
    end

    Real --> RealDeps
    Stub --> StubDeps

    RealDeps --> Out["Identical CallEvent trail,\ncost rows, webhook payloads"]:::primary
    StubDeps --> Out
```

`PROVIDER_STUB_MODE=true` swaps in `StubVoiceSession`, which joins the real LiveKit room and
publishes a scripted conversation from a named scenario fixture (`demo_greeting`, `demo_booking`,
`demo_failure`) instead of calling a real provider. `SIP_STUB_MODE=true` swaps in
`StubSipDialer`, whose outcome is driven by magic numbers in the dialed phone number (`…0000`
answers, `…0001` busy, `…0002` no-answer, `…0003` fails the first trunk then succeeds on the
next). `RECORDING_MODE=stub` writes a deterministic silent WAV instead of using LiveKit Cloud
Egress.

This means the entire call flow — dial, converse, transcript, webhook, cost, recording — is real
end-to-end except for the one line where a real API key would go. See
[ADR 0001](./adr/0001-stub-as-demo-mode.md) for why this is a permanent architectural decision, not
a temporary testing convenience.

## Failover

Both provider failover (`packages/voice-core/src/lib/failover-resolver.ts`) and SIP trunk failover
(`packages/voice-core/src/lib/trunk-selector.ts`) only happen at call-initiation time — never
mid-call. See [ADR 0002](./adr/0002-failover-at-init-only.md) for the reasoning.

```mermaid
%%{init: {
  "theme": "base",
  "themeVariables": {
    "primaryColor": "#F1EFFA",
    "primaryTextColor": "#2A2A2A",
    "primaryBorderColor": "#714EC4",
    "secondaryColor": "#E7F2FF",
    "secondaryBorderColor": "#0E6995",
    "tertiaryColor": "#FFF4E6",
    "tertiaryBorderColor": "#E1AB2F",
    "lineColor": "#5F5F5F",
    "textColor": "#404040",
    "mainBkg": "#F1EFFA",
    "clusterBkg": "#F2F5F7",
    "clusterBorder": "#E0E0E0",
    "edgeLabelBackground": "#FCFCFC",
    "fontFamily": "Inter, -apple-system, sans-serif",
    "fontSize": "14px"
  }
}}%%
flowchart TD
    classDef primary fill:#F1EFFA,stroke:#714EC4,stroke-width:2px,color:#2A2A2A
    classDef secondary fill:#E7F2FF,stroke:#0E6995,stroke-width:2px,color:#2A2A2A
    classDef tertiary fill:#FFF4E6,stroke:#E1AB2F,stroke-width:2px,color:#2A2A2A
    classDef external fill:#F0F0F0,stroke:#808080,stroke-width:1.5px,color:#404040,stroke-dasharray: 4 2

    Start(["call-init"]):::primary --> Trunk{"trunk-selector.ts:\nnext trunk with capacity"}:::primary

    Trunk -->|"acquire slot"| Dial["Dial via LiveKit SIP"]:::secondary
    Dial -->|"trunk error"| Release["release slot"]:::tertiary --> Trunk
    Trunk -->|"no trunk has capacity"| InitFail["call_initiation_failure\n(trunk-exhausted)"]:::tertiary

    Dial -->|"dialed"| Prov{"failover-resolver.ts:\nnext provider candidate"}:::primary
    Prov -->|"session opens"| Connected["IN_PROGRESS"]:::secondary
    Prov -->|"provider error"| ProvNext["log CallEvent,\ntry next candidate"]:::tertiary --> Prov
    Prov -->|"no candidates left"| InitFail2["call_initiation_failure\n(all-providers-failed)"]:::tertiary

    Note["Both ladders only run\nat call-init — never mid-call.\nEvery attempt is a CallEvent."]:::tertiary
    Connected -.-> Note
    InitFail -.-> Note
    InitFail2 -.-> Note
```

## SIP telephony

A PSTN-originated call takes the same lifecycle as a browser call, but starts with trunk selection
and a LiveKit SIP dial instead of a browser room join. Full detail, including the stub magic
numbers used in tests, in [telephony.md](./telephony.md).

```mermaid
%%{init: {
  "theme": "base",
  "themeVariables": {
    "primaryColor": "#F1EFFA",
    "primaryTextColor": "#2A2A2A",
    "primaryBorderColor": "#714EC4",
    "secondaryColor": "#E7F2FF",
    "secondaryBorderColor": "#0E6995",
    "tertiaryColor": "#FFF4E6",
    "tertiaryBorderColor": "#E1AB2F",
    "lineColor": "#5F5F5F",
    "textColor": "#404040",
    "actorBkg": "#F1EFFA",
    "actorBorder": "#714EC4",
    "fontFamily": "Inter, -apple-system, sans-serif",
    "fontSize": "14px"
  }
}}%%
sequenceDiagram
    participant Caller as PSTN caller
    participant Trunk as SIP trunk (Telnyx/Twilio)
    participant LK as LiveKit SIP bridge
    participant Worker as apps/worker
    participant Selector as trunk-selector.ts
    participant Agent as LiveKit Agent Worker

    Worker->>Selector: acquire trunk slot
    Selector-->>Worker: trunk-1 (capacity ok)
    Worker->>Trunk: create SIP participant (dial toNumber)
    Trunk->>Caller: ring
    Caller-->>Trunk: answer
    Trunk-->>LK: bridge audio
    LK-->>Worker: participant active
    Worker->>Agent: dispatch agent to room
    Agent->>LK: join room
    Agent-->>Caller: greeting (via LiveKit media)

    alt trunk fails (busy/no-answer/error)
        Trunk-->>Worker: failure event
        Worker->>Selector: release slot, acquire next trunk
        Selector-->>Worker: trunk-2
        Worker->>Trunk: retry dial via trunk-2
    end

    Note over Worker,Agent: Every attempt recorded as a CallEvent —\nobservable from the console's call detail page
```

## Webhook delivery

Every terminal call fires a webhook per enabled `WebhookEndpoint`, delivered through an outbox
pattern with exponential backoff and a replayable dead-letter state. Full detail, including the
signature format and a verification snippet, in [webhooks.md](./webhooks.md).

```mermaid
%%{init: {
  "theme": "base",
  "themeVariables": {
    "primaryColor": "#F1EFFA",
    "primaryTextColor": "#2A2A2A",
    "primaryBorderColor": "#714EC4",
    "secondaryColor": "#E7F2FF",
    "secondaryBorderColor": "#0E6995",
    "tertiaryColor": "#FFF4E6",
    "tertiaryBorderColor": "#E1AB2F",
    "lineColor": "#5F5F5F",
    "textColor": "#404040",
    "mainBkg": "#F1EFFA",
    "clusterBkg": "#F2F5F7",
    "clusterBorder": "#E0E0E0",
    "edgeLabelBackground": "#FCFCFC",
    "fontFamily": "Inter, -apple-system, sans-serif",
    "fontSize": "14px"
  }
}}%%
flowchart LR
    classDef primary fill:#F1EFFA,stroke:#714EC4,stroke-width:2px,color:#2A2A2A
    classDef secondary fill:#E7F2FF,stroke:#0E6995,stroke-width:2px,color:#2A2A2A
    classDef tertiary fill:#FFF4E6,stroke:#E1AB2F,stroke-width:2px,color:#2A2A2A
    classDef external fill:#F0F0F0,stroke:#808080,stroke-width:1.5px,color:#404040,stroke-dasharray: 4 2

    Call["Call reaches\nterminal status"]:::primary --> Map["outcome-mapper.ts"]:::primary
    Map --> Outbox[("WebhookOutbox row\nPENDING")]:::secondary
    Outbox --> Dispatch["webhook-dispatcher\nworker"]:::secondary
    Dispatch --> Sign["sign payload:\nElevenLabs-Signature\nt=..,v0=hex(ts.body)"]:::secondary
    Sign --> Post["POST to endpoint\n+ X-Idempotency-Key"]:::secondary

    Post -->|"2xx"| Delivered["DELIVERED"]:::secondary
    Post -->|"error"| Backoff["retryCount++\n(atomic increment)"]:::tertiary
    Backoff --> Wait["wait: 30s x 2^n\ncapped at 8h"]:::tertiary
    Wait --> Dispatch
    Backoff -->|"maxRetries (10) exceeded"| Dead["DEAD"]:::tertiary
    Dead -->|"operator clicks Replay\nin console"| Dispatch
```

## Data model

Nine models drive everything: `AgentConfig` (voice mode + provider selection, editable from the
console), `Call` + `CallEvent` (the append-only lifecycle log), `SipTrunk` (telephony routing,
failover-ordered), `WebhookEndpoint` + `WebhookOutbox` (the delivery outbox pattern — see
[webhooks.md](./webhooks.md)), and `CallCost` + `PriceTable` + `Recording` (metering and
artifacts — see [cost-model.md](./cost-model.md)).

```mermaid
%%{init: {
  "theme": "base",
  "themeVariables": {
    "primaryColor": "#F1EFFA",
    "primaryTextColor": "#2A2A2A",
    "primaryBorderColor": "#714EC4",
    "secondaryColor": "#E7F2FF",
    "secondaryBorderColor": "#0E6995",
    "tertiaryColor": "#FFF4E6",
    "tertiaryBorderColor": "#E1AB2F",
    "lineColor": "#5F5F5F",
    "textColor": "#404040",
    "fontFamily": "Inter, -apple-system, sans-serif",
    "fontSize": "14px"
  }
}}%%
erDiagram
    AgentConfig ||--o{ Call : "configures"
    Call ||--o{ CallEvent : "append-only log"
    Call ||--o{ CallCost : "priced legs"
    Call ||--o| Recording : "artifact"
    Call }o--o{ SipTrunk : "dialed via"
    WebhookEndpoint ||--o{ WebhookOutbox : "delivery attempts"
    Call ||--o{ WebhookOutbox : "triggers"
    PriceTable ||--o{ CallCost : "prices"

    AgentConfig {
        string voiceMode
        string provider
        string model
        string ttsProvider
        string reasoningEffort
        text prompt
    }
    Call {
        uuid callSid
        string channel
        string status
        string agentConfigId
    }
    CallEvent {
        uuid callId
        string type
        json payload
        timestamp createdAt
    }
    SipTrunk {
        string provider
        boolean isActive
        int capacity
    }
    WebhookEndpoint {
        string url
        string secret
        boolean enabled
    }
    WebhookOutbox {
        uuid callId
        string status
        int retryCount
        timestamp nextRetryAt
    }
    CallCost {
        string providerLeg
        decimal unitsUsed
        decimal cost
    }
    PriceTable {
        string provider
        string unit
        decimal unitPrice
    }
    Recording {
        uuid callId
        string storageAdapter
        string path
    }
```

Everything a user would want to tune — agent configs, model choices, webhook endpoints, prices,
trunks — lives in Postgres, editable from the console. Environment variables are reserved for
secrets and infra wiring (`DATABASE_URL`, `REDIS_URL`, `LIVEKIT_URL`, the stub-mode flags, real
provider API keys).
