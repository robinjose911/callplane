import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";

const LINK_RE = /\[[^\]]*\]\(([^)]+)\)/g;

/** Strips a trailing `#anchor` and any leading `./`; ignores link titles (`"..."`) if present. */
function extractPath(rawTarget) {
  const withoutTitle = rawTarget.split(/\s+"/)[0]?.trim() ?? rawTarget;
  const [pathPart] = withoutTitle.split("#");
  return pathPart;
}

/**
 * Extracts every local (non-http, non-mailto, non-bare-anchor) markdown link target from
 * `content`. Bare `#anchor`-only links are skipped — anchor-existence checking would require a
 * full markdown-heading parser, and cross-file relative paths are the failure mode that actually
 * breaks a reader (a moved/renamed/deleted doc), which is what this check exists to catch.
 */
export function extractLocalLinkTargets(content) {
  const targets = [];
  for (const match of content.matchAll(LINK_RE)) {
    const raw = match[1]?.trim();
    if (!raw) continue;
    if (raw.startsWith("http://") || raw.startsWith("https://") || raw.startsWith("mailto:")) continue;
    if (raw.startsWith("#")) continue;
    const pathPart = extractPath(raw);
    if (pathPart) targets.push(pathPart);
  }
  return targets;
}

/**
 * Checks every local link in `filePath` resolves to a real file (relative to that file's own
 * directory, matching how a markdown renderer resolves relative links). Returns one entry per
 * broken link.
 */
export function findBrokenLinks(filePath, content) {
  const baseDir = dirname(filePath);
  const broken = [];
  for (const target of extractLocalLinkTargets(content)) {
    const resolved = resolve(baseDir, target);
    if (!existsSync(resolved)) {
      broken.push({ file: filePath, target, resolved });
    }
  }
  return broken;
}
