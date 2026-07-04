import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { copyEnvExamples } from "./setup-env.mjs";

function makeFakeRepo() {
  const root = mkdtempSync(join(tmpdir(), "callplane-setup-test-"));
  for (const target of ["apps/api", "apps/worker"]) {
    mkdirSync(join(root, target), { recursive: true });
    writeFileSync(join(root, target, ".env.example"), `# example for ${target}\nFOO=bar\n`);
  }
  return root;
}

test("writes .env from .env.example for every target that doesn't have one yet", () => {
  const root = makeFakeRepo();
  try {
    const results = copyEnvExamples(root, ["apps/api", "apps/worker"]);
    assert.deepEqual(
      results.map((r) => r.action),
      ["written", "written"],
    );
    assert.equal(readFileSync(join(root, "apps/api/.env"), "utf8"), "# example for apps/api\nFOO=bar\n");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("is idempotent — a second run does not overwrite an already-edited .env", () => {
  const root = makeFakeRepo();
  try {
    copyEnvExamples(root, ["apps/api", "apps/worker"]);
    writeFileSync(join(root, "apps/api/.env"), "FOO=my-edited-value\n"); // simulate a developer's edit

    const secondRun = copyEnvExamples(root, ["apps/api", "apps/worker"]);
    assert.deepEqual(
      secondRun.map((r) => r.action),
      ["skipped", "skipped"],
    );
    assert.equal(readFileSync(join(root, "apps/api/.env"), "utf8"), "FOO=my-edited-value\n");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
