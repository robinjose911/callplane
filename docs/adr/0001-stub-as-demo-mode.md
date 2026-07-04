# ADR 0001: Stubs are a permanent demo/product feature, not test scaffolding

## Status

Accepted.

## Context

Any voice agent stack needs real AI provider API keys, a real telephony trunk, and (usually) real
recording infrastructure to actually do anything. That's a real barrier for anyone evaluating this
repo: cloning it and following a README shouldn't require signing up for four different paid
services before you can see it work.

The obvious first instinct is to build stub/mock implementations purely for automated testing, and
gate them behind `NODE_ENV=test` — the conventional testing-scaffolding pattern.

## Decision

Stub implementations (`StubVoiceSession`, `StubSipDialer`, the stub WAV recorder) are gated behind
their own explicit, product-facing flags — `PROVIDER_STUB_MODE`, `SIP_STUB_MODE`,
`RECORDING_MODE=stub` — which default to **on**, and are never gated behind `NODE_ENV`. They are
real, always-available code paths, documented in the README and `docs/` as the default way to run
this stack, not an internal testing convenience.

This means:

- A stranger cloning the repo gets the full call flow (dial → converse → transcript → webhook →
  cost → recording) working with zero API keys, on the first `turbo dev`.
- The exact same stub code paths that make the demo work are what every automated Playwright spec
  exercises — there's no separate "test mode" implementation to keep in sync with the "real" one.
- Turning on a real provider is a config change (env vars + an agent config edit), not a rebuild or
  a different deployment target.

## Consequences

- Stub logic has to be written to the same quality bar as production code, since it *is*
  production code from a code-review and maintenance perspective.
- The stub dialer's magic-number convention (`…0000`–`…0003`) and the stub scenario names
  (`demo_greeting`, `demo_booking`, `demo_failure`) are part of the public contract — documented in
  `docs/telephony.md`/`docs/architecture.md`, not internal test fixtures that can change silently.
- Real-provider correctness (does a real Gemini/OpenAI/Deepgram/ElevenLabs/Cartesia integration
  actually work end-to-end) is *not* proven by this test suite — only the wiring around it is. A
  real-provider smoke suite is tracked as post-v1 work specifically because it needs live API keys
  and can't run in the always-on CI loop.
