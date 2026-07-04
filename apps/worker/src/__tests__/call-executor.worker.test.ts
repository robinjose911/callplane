import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma, createAgentConfigRepository, createCallRepository, createCallEventRepository } from "@callplane/database";
import type { CallExecutorJobData } from "@callplane/contracts";
import type { CallRunner, OnTransition } from "@callplane/voice-core";
import { processCallExecutorJob, IllegalTransitionError } from "../workers/call-executor.worker.js";

const agentConfigRepo = createAgentConfigRepository(prisma);
const callRepo = createCallRepository(prisma);
const callEventRepo = createCallEventRepository(prisma);

const agentName = "test-worker-agent";
const callSids: string[] = [];

function newJobData(overrides: Partial<CallExecutorJobData> = {}): CallExecutorJobData {
  const callSid = crypto.randomUUID();
  callSids.push(callSid);
  return {
    callSid,
    agentId: agentName,
    channel: "browser",
    toNumber: null,
    scenario: null,
    dynamicVariables: {},
    ...overrides,
  };
}

beforeAll(async () => {
  await agentConfigRepo.create({ name: agentName, voiceMode: "realtime", prompt: "x" });
});

afterAll(async () => {
  await prisma.callEvent.deleteMany({ where: { callSid: { in: callSids } } });
  await prisma.call.deleteMany({ where: { callSid: { in: callSids } } });
  await prisma.agentConfig.deleteMany({ where: { name: agentName } });
});

describe("processCallExecutorJob", () => {
  it("is a no-op for an unknown callSid", async () => {
    await expect(processCallExecutorJob(newJobData())).resolves.toBeUndefined();
  });

  it("is a no-op (stale-job guard) when the call is already terminal", async () => {
    const data = newJobData();
    await callRepo.create({ callSid: data.callSid, agentId: agentName, channel: "browser" });
    await callRepo.updateStatus(data.callSid, "COMPLETED");

    await processCallExecutorJob(data);

    const events = await callEventRepo.findBySid(data.callSid);
    expect(events).toHaveLength(0); // no events appended — never touched the runner
  });

  it("happy scenario (demo_greeting) ends COMPLETED with the full ordered event trail", async () => {
    const data = newJobData({ scenario: "demo_greeting" });
    await callRepo.create({ callSid: data.callSid, agentId: agentName, channel: "browser", scenario: "demo_greeting" });

    await processCallExecutorJob(data);

    const call = await callRepo.findBySid(data.callSid);
    expect(call?.status).toBe("COMPLETED");

    const events = await callEventRepo.findBySid(data.callSid);
    expect(events.map((e) => e.eventType)).toEqual([
      "call_dialing",
      "call_ringing",
      "call_in_progress",
      "transcript_turn",
      "call_completed",
    ]);
  });

  it("failure scenario (demo_failure) ends FAILED", async () => {
    const data = newJobData({ scenario: "demo_failure" });
    await callRepo.create({ callSid: data.callSid, agentId: agentName, channel: "browser", scenario: "demo_failure" });

    await processCallExecutorJob(data);

    const call = await callRepo.findBySid(data.callSid);
    expect(call?.status).toBe("FAILED");
  });

  it("throws IllegalTransitionError and marks the call FAILED when a runner attempts an illegal transition", async () => {
    const data = newJobData();
    await callRepo.create({ callSid: data.callSid, agentId: agentName, channel: "browser" });

    const badRunner: CallRunner = {
      async run(_scenario, onTransition: OnTransition) {
        // QUEUED -> COMPLETED skips every intermediate stage — illegal per CALL_STATUS_TRANSITIONS.
        await onTransition({ status: "COMPLETED", eventType: "call_completed" });
      },
    };

    await expect(processCallExecutorJob(data, badRunner)).rejects.toBeInstanceOf(IllegalTransitionError);

    const call = await callRepo.findBySid(data.callSid);
    expect(call?.status).toBe("FAILED");
  });

  it("fails loudly when CALL_RUNNER=livekit is set without PROVIDER_STUB_MODE=true, instead of silently running the stub anyway", async () => {
    const data = newJobData();
    await callRepo.create({ callSid: data.callSid, agentId: agentName, channel: "browser" });

    const originalCallRunner = process.env["CALL_RUNNER"];
    const originalStubMode = process.env["PROVIDER_STUB_MODE"];
    process.env["CALL_RUNNER"] = "livekit";
    delete process.env["PROVIDER_STUB_MODE"];

    try {
      await expect(processCallExecutorJob(data)).rejects.toThrow(/PROVIDER_STUB_MODE=true/);
    } finally {
      if (originalCallRunner !== undefined) process.env["CALL_RUNNER"] = originalCallRunner;
      else delete process.env["CALL_RUNNER"];
      if (originalStubMode !== undefined) process.env["PROVIDER_STUB_MODE"] = originalStubMode;
      else delete process.env["PROVIDER_STUB_MODE"];
    }
  });
});
