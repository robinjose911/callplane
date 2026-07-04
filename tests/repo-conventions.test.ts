import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = join(import.meta.dirname, "..");

function workspacePackageJsonPaths(): string[] {
  const groups = ["apps", "packages"];
  return groups.flatMap((group) => {
    const groupDir = join(root, group);
    return readdirSync(groupDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => join(groupDir, entry.name, "package.json"));
  });
}

describe("repo conventions", () => {
  it("every workspace package.json declares \"type\": \"module\"", () => {
    const paths = workspacePackageJsonPaths();
    expect(paths.length).toBeGreaterThan(0);

    for (const path of paths) {
      const pkg = JSON.parse(readFileSync(path, "utf-8"));
      expect(pkg, path).toHaveProperty("type", "module");
    }
  });
});
