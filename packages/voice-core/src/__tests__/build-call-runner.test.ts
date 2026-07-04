import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { SipTrunkRepository } from "@callplane/database";
import { buildCallRunner } from "../lib/build-call-runner.js";
import { StubCallRunner } from "../lib/stub-call-runner.js";
import { RealCallRunner } from "../lib/real-call-runner.js";

function jobData(overrides: Partial<Parameters<typeof buildCallRunner>[0]> = {}): Parameters<typeof buildCallRunner>[0] {
  return {
    callSid: "call-1",
    agentId: "demo-cascade",
    channel: "browser",
    toNumber: null,
    scenario: null,
    dynamicVariables: {},
    ...overrides,
  };
}

function fakeSipTrunkRepo(): SipTrunkRepository {
  return { listActive: async () => [] } as unknown as SipTrunkRepository;
}

describe("buildCallRunner", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    delete process.env["CALL_RUNNER"];
    delete process.env["PROVIDER_STUB_MODE"];
    delete process.env["SIP_STUB_MODE"];
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("returns a StubCallRunner when CALL_RUNNER is not livekit (the default)", async () => {
    const runner = await buildCallRunner(jobData(), { sipTrunkRepo: fakeSipTrunkRepo() });
    expect(runner).toBeInstanceOf(StubCallRunner);
  });

  it("throws a clear error when CALL_RUNNER=livekit is set without PROVIDER_STUB_MODE=true", async () => {
    process.env["CALL_RUNNER"] = "livekit";
    await expect(buildCallRunner(jobData(), { sipTrunkRepo: fakeSipTrunkRepo() })).rejects.toThrow(/PROVIDER_STUB_MODE=true/);
  });

  it("returns a browser-channel RealCallRunner when CALL_RUNNER=livekit and PROVIDER_STUB_MODE=true", async () => {
    process.env["CALL_RUNNER"] = "livekit";
    process.env["PROVIDER_STUB_MODE"] = "true";

    const runner = await buildCallRunner(jobData({ channel: "browser" }), { sipTrunkRepo: fakeSipTrunkRepo() });
    expect(runner).toBeInstanceOf(RealCallRunner);
  });

  it("throws when channel is sip but toNumber is null", async () => {
    process.env["CALL_RUNNER"] = "livekit";
    process.env["PROVIDER_STUB_MODE"] = "true";

    await expect(
      buildCallRunner(jobData({ channel: "sip", toNumber: null }), { sipTrunkRepo: fakeSipTrunkRepo() }),
    ).rejects.toThrow(/toNumber/);
  });

  it("fetches active trunks and returns a sip-channel RealCallRunner when channel is sip with a toNumber", async () => {
    process.env["CALL_RUNNER"] = "livekit";
    process.env["PROVIDER_STUB_MODE"] = "true";
    let listActiveCalled = false;
    const sipTrunkRepo = {
      listActive: async () => {
        listActiveCalled = true;
        return [];
      },
    } as unknown as SipTrunkRepository;

    const runner = await buildCallRunner(jobData({ channel: "sip", toNumber: "+15550000000" }), { sipTrunkRepo });

    expect(runner).toBeInstanceOf(RealCallRunner);
    expect(listActiveCalled).toBe(true);
  });
});
