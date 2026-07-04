import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { extractLocalLinkTargets, findBrokenLinks } from "./check-links-core.mjs";

test("extractLocalLinkTargets ignores external URLs, mailto, and bare anchors", () => {
  const content = `
[external](https://example.com/foo)
[mail](mailto:a@b.com)
[anchor-only](#section)
[real](./docs/architecture.md)
[with-anchor](./docs/architecture.md#overview)
[with-title](./docs/architecture.md "Architecture")
`;
  assert.deepEqual(extractLocalLinkTargets(content), [
    "./docs/architecture.md",
    "./docs/architecture.md",
    "./docs/architecture.md",
  ]);
});

test("findBrokenLinks resolves relative to the file's own directory and flags missing targets", () => {
  const root = mkdtempSync(join(tmpdir(), "callplane-check-links-test-"));
  try {
    mkdirSync(join(root, "docs"), { recursive: true });
    writeFileSync(join(root, "docs", "architecture.md"), "# Architecture");

    const readmePath = join(root, "README.md");
    const content = "[good](./docs/architecture.md)\n[bad](./docs/does-not-exist.md)\n";
    const broken = findBrokenLinks(readmePath, content);

    assert.equal(broken.length, 1);
    assert.equal(broken[0].target, "./docs/does-not-exist.md");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("findBrokenLinks returns nothing when every local link resolves", () => {
  const root = mkdtempSync(join(tmpdir(), "callplane-check-links-test-"));
  try {
    writeFileSync(join(root, "LICENSE"), "MIT");
    const readmePath = join(root, "README.md");
    const broken = findBrokenLinks(readmePath, "[license](./LICENSE)\n[external](https://example.com)\n");
    assert.deepEqual(broken, []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
