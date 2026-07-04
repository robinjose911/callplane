import { readFileSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";

const root = join(import.meta.dirname, "..");

// The one file allowed to construct these directly — every other Queue/Worker MUST go through
// its createQueue/createWorker factories (see packages/voice-core/src/lib/queue.ts's own
// doc comment for why: an unprefixed queue on the shared Redis instance steals the source project's jobs).
const FACTORY_FILE = "packages/voice-core/src/lib/queue.ts";

function grepRawConstructors(): string[] {
  let output: string;
  try {
    output = execFileSync(
      "grep",
      ["-rnE", "new (Queue|Worker)\\(", "--include=*.ts", "apps", "packages"],
      { cwd: root, encoding: "utf-8" },
    );
  } catch (error) {
    const execError = error as { status?: number; stdout?: string };
    if (execError.status === 1) return []; // grep exit 1 = no matches, not an error here
    throw error;
  }

  return output
    .split("\n")
    .filter(Boolean)
    .filter((line) => !line.startsWith(`${FACTORY_FILE}:`))
    .filter((line) => !line.includes("__tests__") && !line.includes(".test.ts"));
}

describe("BullMQ convention", () => {
  it("no raw `new Queue(`/`new Worker(` outside the factory file", () => {
    const violations = grepRawConstructors();
    expect(violations, `Found raw BullMQ constructor usage:\n${violations.join("\n")}`).toEqual([]);
  });

  it("the factory file itself does construct Queue/Worker (sanity check the grep works)", () => {
    const content = readFileSync(join(root, FACTORY_FILE), "utf-8");
    expect(content).toMatch(/new Queue\(/);
    expect(content).toMatch(/new Worker\(/);
  });
});
