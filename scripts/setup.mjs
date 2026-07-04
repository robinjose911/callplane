#!/usr/bin/env node
// Copies each app's tiered .env.example to .env (idempotent — never overwrites an existing .env),
// then runs db:push + db:seed. This is the single command the README quickstart tells a stranger
// to run; it must work on a machine that has never seen this repo before.
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { copyEnvExamples } from "./lib/setup-env.mjs";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

function run(command) {
  execSync(command, { cwd: repoRoot, stdio: "inherit" });
}

console.log("callplane setup\n");

for (const { target, action } of copyEnvExamples(repoRoot)) {
  console.log(action === "skipped" ? `  skip  ${target}/.env (already exists — not overwriting your edits)` : `  wrote ${target}/.env`);
}

// Assumes `docker compose --profile full up -d` already ran (the quickstart runs it first) —
// db:push needs a reachable Postgres.
console.log("\nPushing database schema...");
run("npm run db:push --workspace=packages/database");

console.log("\nSeeding database (idempotent)...");
run("npm run db:seed --workspace=packages/database");

console.log(`
Setup complete. Next step:

  turbo dev

Then open the console at http://localhost:4400 (login: admin / dev-local-only-change-me).
No API keys needed — the stack runs in stub mode out of the box. See README.md for details.
`);
