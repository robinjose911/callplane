# Contributing

## Secret scanning

Every push runs [`gitleaks`](https://github.com/gitleaks/gitleaks) via a `pre-push` git hook
(wired through husky, see `.husky/pre-push` → `scripts/secret-scan.sh`) and again in CI. Never
bypass it with `git push --no-verify` — if it flags something, treat it as a real leak until
proven otherwise, and never commit real credentials, tokens, or PSTN numbers. Seed/fixture data
must use obviously-fake values.

## Local setup

See the root `README.md` quickstart. Node `>=22` (see `.nvmrc`), `npm@10`.
