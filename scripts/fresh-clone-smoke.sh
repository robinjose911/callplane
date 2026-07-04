#!/usr/bin/env bash
# Proves the README quickstart honestly works on a machine that has never seen this repo: clones
# the current branch into a temp directory, runs the quickstart commands verbatim, then runs a
# smoke-level Playwright regression against the freshly-cloned checkout (Playwright's own
# webServer array starts api/worker/console — same mechanism every other e2e run already uses).
#
# The Docker infra (Redis/LiveKit/Postgres) runs on alternate ports/container names so it doesn't
# collide with an already-running normal dev stack's *infra containers* on the same machine — but
# the app ports themselves (api:4300, console:4400) are NOT remapped, since Playwright's
# webServer config hardcodes them. Stop any running `turbo dev` before running this locally; CI
# always runs it in a clean, single-purpose runner where this is a non-issue.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SMOKE_DIR="$(mktemp -d -t callplane-smoke-XXXXXX)"
BRANCH="$(git -C "$REPO_ROOT" rev-parse --abbrev-ref HEAD)"

# Alternate infra ports/container names — never collide with docker-compose.yml's defaults.
export COMPOSE_REDIS_PORT=16379
export COMPOSE_LIVEKIT_PORT=17880
export COMPOSE_LIVEKIT_RTC_PORT=17881
export COMPOSE_LIVEKIT_UDP_RANGE=51000-51100
export COMPOSE_POSTGRES_PORT=15433
export COMPOSE_REDIS_CONTAINER_NAME=callplane-smoke-redis
export COMPOSE_LIVEKIT_CONTAINER_NAME=callplane-smoke-livekit
export COMPOSE_POSTGRES_CONTAINER_NAME=callplane-smoke-postgres

# CRITICAL: without an explicit -p, `docker compose` derives its project name from the current
# directory's basename — which is "callplane" for BOTH this smoke clone (cloned into
# "$SMOKE_DIR/callplane") and the real checkout most developers run their normal dev stack from.
# That collision is not cosmetic: `docker compose down -v` operates on the project, so running it
# from here would silently stop and DELETE THE VOLUMES of a completely unrelated, currently-running
# dev stack. Every compose invocation below is pinned to a distinct project name so this script's
# lifecycle can never touch a container or volume it didn't itself create.
COMPOSE_PROJECT_NAME=callplane-smoke-test
export COMPOSE_PROJECT_NAME

cleanup() {
  echo "--- cleanup ---"
  (cd "$SMOKE_DIR/callplane" 2>/dev/null && docker compose -p "$COMPOSE_PROJECT_NAME" --profile full down -v) || true
  rm -rf "$SMOKE_DIR"
}
trap cleanup EXIT

echo "--- cloning $REPO_ROOT (branch: $BRANCH) into $SMOKE_DIR ---"
git clone --branch "$BRANCH" --single-branch "$REPO_ROOT" "$SMOKE_DIR/callplane"
cd "$SMOKE_DIR/callplane"

echo "--- docker compose --profile full up -d (alternate infra ports, isolated project name) ---"
docker compose -p "$COMPOSE_PROJECT_NAME" --profile full up -d

echo "--- npm install ---"
npm install

echo "--- npm run setup ---"
export DATABASE_URL="postgresql://postgres:postgres@localhost:${COMPOSE_POSTGRES_PORT}/callplane?schema=callplane"
npm run setup

# Workspace packages (@callplane/voice-core, @callplane/database, @callplane/contracts) are
# consumed via their built dist/ output, not their TS source — apps/api's `tsx watch src/index.ts`
# (what Playwright's webServer runs) fails with ERR_MODULE_NOT_FOUND without this.
echo "--- npx turbo build ---"
npx turbo build

echo "--- smoke-level Playwright regression (stage0 + stage6) ---"
(
  cd apps/console
  export REDIS_URL="redis://localhost:${COMPOSE_REDIS_PORT}"
  export LIVEKIT_URL="ws://localhost:${COMPOSE_LIVEKIT_PORT}"
  npx playwright test e2e/stage0-harness.spec.ts e2e/stage6-playground.spec.ts
)

echo ""
echo "=== fresh-clone smoke test passed ==="
