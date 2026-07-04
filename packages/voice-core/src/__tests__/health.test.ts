import { afterEach, describe, expect, it } from "vitest";
import { buildHealthPayload } from "../lib/health.js";

const ENV_KEYS = ["SERVICE_NAME", "PROVIDER_STUB_MODE", "SIP_STUB_MODE", "RECORDING_MODE"] as const;

describe("buildHealthPayload", () => {
  const originalEnv: Record<string, string | undefined> = {};
  for (const key of ENV_KEYS) originalEnv[key] = process.env[key];

  afterEach(() => {
    for (const key of ENV_KEYS) {
      if (originalEnv[key] === undefined) delete process.env[key];
      else process.env[key] = originalEnv[key];
    }
  });

  it("defaults to the given service name and off stub flags", () => {
    for (const key of ENV_KEYS) delete process.env[key];

    expect(buildHealthPayload("callplane-api")).toEqual({
      ok: true,
      service: "callplane-api",
      stubMode: false,
      sipStubMode: false,
      recordingMode: "live",
    });
  });

  it("prefers SERVICE_NAME over the default when set", () => {
    process.env["SERVICE_NAME"] = "callplane-api-2";

    expect(buildHealthPayload("callplane-api").service).toBe("callplane-api-2");
  });

  it("reports each stub flag independently", () => {
    process.env["PROVIDER_STUB_MODE"] = "true";
    process.env["SIP_STUB_MODE"] = "true";
    process.env["RECORDING_MODE"] = "stub";

    expect(buildHealthPayload("callplane-worker")).toMatchObject({
      stubMode: true,
      sipStubMode: true,
      recordingMode: "stub",
    });
  });
});
