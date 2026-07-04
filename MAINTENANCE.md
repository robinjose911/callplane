# Maintenance

callplane is a **reference architecture snapshot**, published to demonstrate a particular way of
building a production-grade voice agent control plane. It is not a maintained product, and there is
no support SLA.

## What this means in practice

- Issues and PRs are welcome, but there's no commitment to a response time or a release cadence.
- If you need this to keep working for you long-term, **fork it and own it.** The codebase is
  small and deliberately readable (see `CLAUDE.md`'s coding standards) specifically so that forking
  and adapting it is a reasonable thing to do.
- Dependencies (Next.js, Prisma, BullMQ, LiveKit, provider SDKs) will drift out of date over time.
  There's no guarantee of dependency bumps beyond what's needed while this repo is under active
  development.
- Security: `gitleaks` runs on every push and in CI, but this repo does not undergo a formal
  security audit. Don't point a production telephony/API-key deployment at this code without your
  own review.

## Why publish something with no support SLA?

The value here is the architecture and the patterns — the stub-first demo mode, the transactional
outbox for webhooks, the failover-at-init-only model, config-over-env, the testing philosophy of
zero manual steps — not a hosted service. Reading the code, the `PLAN.md` build log, and the ADRs
in `docs/adr/` should tell you more about how to build something like this than a longer README
ever could.

## Reporting a real bug

If you find a genuine bug (not a missing feature, not a request for real-provider support beyond
what's documented in `docs/providers.md`), open an issue with:

- what you ran (`turbo dev`? `fresh-clone-smoke.sh`? a specific e2e spec?)
- what you expected vs. what happened
- whether it reproduces on a completely fresh clone (rules out local environment drift)

See [`CONTRIBUTING.md`](./CONTRIBUTING.md) for the local setup and secret-scanning conventions.
