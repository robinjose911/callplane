# Providers (Tier 2 — real AI provider setup)

By default (`PROVIDER_STUB_MODE=true`), no provider account or API key is needed — see the
[README quickstart](../README.md) and [`architecture.md`](./architecture.md#the-stub-first-architecture).
This doc is for turning on real AI providers and having actual conversations.

## Supported providers by voice mode

| Voice mode | Provider slot | Supported values | Set via |
|---|---|---|---|
| `realtime` | `s2sProvider` | `gemini`, `openai`, `azure` | Agent config (console → Agents) |
| `cascade` | `sttProvider` | `deepgram` | Agent config |
| `cascade` | `llmProvider` | `openai`, `google`, `azure` | Agent config |
| `cascade` / `half_cascade` | `ttsProvider` | `elevenlabs`, `cartesia` | Agent config |
| `half_cascade` | `s2sProvider` | `gemini`, `openai`, `azure` (STT+LLM combo) | Agent config |

Every agent's provider selection is a Postgres row (`AgentConfig`), editable from the console's
Agents page — not an environment variable. Env vars only carry the *credentials* a provider SDK
needs to authenticate.

## Turning on a real provider

1. Set the matching API key in `apps/worker/.env` (the worker process is what actually opens
   provider sessions):

   | Provider | Env var(s) |
   |---|---|
   | Gemini Live | `GOOGLE_API_KEY` |
   | OpenAI Realtime / OpenAI LLM | `OPENAI_API_KEY` |
   | Azure OpenAI Realtime | `AZURE_OPENAI_ENDPOINT`, `AZURE_OPENAI_DEPLOYMENT`, and `AZURE_OPENAI_API_KEY` |
   | Deepgram (STT) | `DEEPGRAM_API_KEY` |
   | ElevenLabs (TTS) | `ELEVENLABS_API_KEY` |
   | Cartesia (TTS) | `CARTESIA_API_KEY` |

2. Set `PROVIDER_STUB_MODE=false` in both `apps/api/.env` and `apps/worker/.env`.
3. Restart `turbo dev`.
4. Create or edit an agent config in the console pointing at the provider you configured, and run
   a call from the Playground.

**Azure is the one provider that doesn't fall back to a bare env var by convention** — the
constructor is called with an explicit, conditionally-spread `apiKey` (only included if
`AZURE_OPENAI_API_KEY` is set), rather than relying on the Azure SDK's own environment-variable
auto-detection. If you configure an Azure agent and calls fail with an auth error, double-check
`AZURE_OPENAI_API_KEY` is actually set — it will not silently pick up a differently-named Azure
env var.

## Mixing stub and real providers

`PROVIDER_STUB_MODE` is a single process-wide flag, not per-agent — you can't run one agent
against a real provider while another still uses the stub in the same running process. If you want
to keep demoing the stub scenarios while testing a real provider, run a second local instance of
`apps/worker` with its own `.env` (different `WORKER_HEALTH_PORT`), or just toggle the flag and
restart between sessions.

## Cost implications

Every provider leg (S2S tokens, STT seconds, LLM tokens, TTS characters) is priced from the
`PriceTable` — console-editable under Settings, seeded with illustrative example rates, not real
provider pricing. See [`cost-model.md`](./cost-model.md) for how metering works and why a provider
with no matching price row shows as explicitly unpriced rather than silently free.
