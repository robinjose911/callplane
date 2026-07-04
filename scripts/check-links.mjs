#!/usr/bin/env node
// Scans README.md, CONTRIBUTING.md, MAINTENANCE.md, and every docs/*.md file for local markdown
// links (relative file paths, not external URLs or bare anchors) and fails if any target doesn't
// exist on disk. CLAUDE.md is deliberately excluded — it's gitignored (private, not part of the
// public repo), so it must never be linked to from a public doc, and scanning it here would only
// mask that class of mistake locally (it exists on this machine) while CI (a clean checkout that
// never has it) would still fail.
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { findBrokenLinks } from "./lib/check-links-core.mjs";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

function collectMarkdownFiles() {
  const files = ["README.md", "CONTRIBUTING.md", "MAINTENANCE.md"].filter((f) => existsSync(join(repoRoot, f)));
  const docsDir = join(repoRoot, "docs");
  if (existsSync(docsDir)) {
    for (const entry of readdirSync(docsDir, { recursive: true })) {
      if (entry.endsWith(".md")) files.push(join("docs", entry));
    }
  }
  return files;
}

const files = collectMarkdownFiles();
let brokenCount = 0;

for (const relativePath of files) {
  const absolutePath = join(repoRoot, relativePath);
  const content = readFileSync(absolutePath, "utf8");
  const broken = findBrokenLinks(absolutePath, content);
  for (const { target } of broken) {
    console.error(`✗ ${relativePath}: broken link -> ${target}`);
    brokenCount += 1;
  }
}

if (brokenCount > 0) {
  console.error(`\n${brokenCount} broken link(s) found across ${files.length} file(s).`);
  process.exit(1);
}

console.log(`✓ No broken local links found across ${files.length} file(s).`);
