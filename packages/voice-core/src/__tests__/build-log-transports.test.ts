import { describe, expect, it } from "vitest";
import { buildLogTransports } from "../lib/build-log-transports.js";

function env(overrides: Record<string, string | undefined>): NodeJS.ProcessEnv {
  return overrides as NodeJS.ProcessEnv;
}

describe("buildLogTransports", () => {
  it("returns undefined when neither LOG_PRETTY nor Axiom env vars are set", () => {
    expect(buildLogTransports(env({}))).toBeUndefined();
  });

  it("returns a single pino-pretty target when LOG_PRETTY=true and Axiom is unconfigured", () => {
    const result = buildLogTransports(env({ LOG_PRETTY: "true" }));
    expect(result?.targets).toHaveLength(1);
    expect(result?.targets[0]?.target).toBe("pino-pretty");
  });

  it("returns a single @axiomhq/pino target when both Axiom env vars are set and LOG_PRETTY is unset", () => {
    const result = buildLogTransports(env({ AXIOM_TOKEN: "xaat-test", AXIOM_DATASET: "callplane-logs" }));
    expect(result?.targets).toHaveLength(1);
    expect(result?.targets[0]?.target).toBe("@axiomhq/pino");
    expect(result?.targets[0]?.options).toMatchObject({ token: "xaat-test", dataset: "callplane-logs" });
  });

  it("returns both targets when LOG_PRETTY=true and both Axiom env vars are set — not mutually exclusive", () => {
    const result = buildLogTransports(
      env({ LOG_PRETTY: "true", AXIOM_TOKEN: "xaat-test", AXIOM_DATASET: "callplane-logs" }),
    );
    expect(result?.targets).toHaveLength(2);
    const targetNames = result?.targets.map((t) => t.target);
    expect(targetNames).toContain("pino-pretty");
    expect(targetNames).toContain("@axiomhq/pino");
  });

  it("does not enable Axiom shipping when only AXIOM_TOKEN is set (dataset missing)", () => {
    const result = buildLogTransports(env({ AXIOM_TOKEN: "xaat-test" }));
    expect(result).toBeUndefined();
  });

  it("does not enable Axiom shipping when only AXIOM_DATASET is set (token missing)", () => {
    const result = buildLogTransports(env({ AXIOM_DATASET: "callplane-logs" }));
    expect(result).toBeUndefined();
  });
});
