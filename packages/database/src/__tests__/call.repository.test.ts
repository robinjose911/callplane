import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../index.js";
import { createAgentConfigRepository } from "../repositories/agent-config.repository.js";
import { createCallRepository } from "../repositories/call.repository.js";
import { testId } from "./test-helpers.js";

const agentConfigRepo = createAgentConfigRepository(prisma);
const callRepo = createCallRepository(prisma);

const agentName = testId("call-agent");
const callSids: string[] = [];

beforeAll(async () => {
  await agentConfigRepo.create({ name: agentName, voiceMode: "realtime", prompt: "x" });
});

afterAll(async () => {
  await prisma.call.deleteMany({ where: { callSid: { in: callSids } } });
  await prisma.agentConfig.deleteMany({ where: { name: agentName } });
});

function newCallSid(): string {
  const sid = crypto.randomUUID();
  callSids.push(sid);
  return sid;
}

describe("CallRepository", () => {
  it("creates and finds a call by callSid", async () => {
    const callSid = newCallSid();
    const created = await callRepo.create({ callSid, agentId: agentName, channel: "browser" });

    expect(created.status).toBe("QUEUED");

    const found = await callRepo.findBySid(callSid);
    expect(found?.id).toBe(created.id);
  });

  it("returns null for an unknown callSid", async () => {
    expect(await callRepo.findBySid(crypto.randomUUID())).toBeNull();
  });

  it("updates status", async () => {
    const callSid = newCallSid();
    await callRepo.create({ callSid, agentId: agentName, channel: "browser" });

    const updated = await callRepo.updateStatus(callSid, "COMPLETED");
    expect(updated.status).toBe("COMPLETED");
  });

  it("finds an active call by idempotency key, and clearing it frees the key", async () => {
    const callSid = newCallSid();
    const idempotencyKey = testId("idem");
    await callRepo.create({ callSid, agentId: agentName, channel: "sip", toNumber: "+14155551234", idempotencyKey });

    const found = await callRepo.findActiveByIdempotencyKey(idempotencyKey);
    expect(found?.callSid).toBe(callSid);

    await callRepo.clearIdempotencyKey(callSid);
    expect(await callRepo.findActiveByIdempotencyKey(idempotencyKey)).toBeNull();
  });

  it("lists calls filtered by status", async () => {
    const callSid = newCallSid();
    await callRepo.create({ callSid, agentId: agentName, channel: "browser" });
    await callRepo.updateStatus(callSid, "FAILED");

    const failed = await callRepo.list({ status: "FAILED" });
    expect(failed.some((c) => c.callSid === callSid)).toBe(true);
  });
});
