import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../index.js";
import { createAgentConfigRepository } from "../repositories/agent-config.repository.js";
import { createCallRepository } from "../repositories/call.repository.js";
import { createCallEventRepository } from "../repositories/call-event.repository.js";
import { testId } from "./test-helpers.js";

const agentConfigRepo = createAgentConfigRepository(prisma);
const callRepo = createCallRepository(prisma);
const eventRepo = createCallEventRepository(prisma);

const agentName = testId("event-agent");
const callSid = crypto.randomUUID();

beforeAll(async () => {
  await agentConfigRepo.create({ name: agentName, voiceMode: "realtime", prompt: "x" });
  await callRepo.create({ callSid, agentId: agentName, channel: "browser" });
});

afterAll(async () => {
  await prisma.callEvent.deleteMany({ where: { callSid } });
  await prisma.call.deleteMany({ where: { callSid } });
  await prisma.agentConfig.deleteMany({ where: { name: agentName } });
});

describe("CallEventRepository", () => {
  it("appends events and returns them in chronological order", async () => {
    await eventRepo.append({ callSid, eventType: "call_queued" });
    await eventRepo.append({ callSid, eventType: "agent_joined", payload: { room: "room-1" } });
    await eventRepo.append({ callSid, eventType: "call_completed" });

    const events = await eventRepo.findBySid(callSid);
    expect(events.map((e) => e.eventType)).toEqual(["call_queued", "agent_joined", "call_completed"]);
    expect(events[0]!.createdAt.getTime()).toBeLessThanOrEqual(events[2]!.createdAt.getTime());
  });

  it("is append-only: the repository exposes no update or delete method", () => {
    expect(eventRepo).not.toHaveProperty("update");
    expect(eventRepo).not.toHaveProperty("delete");
    expect(Object.keys(eventRepo).sort()).toEqual(["append", "findBySid"]);
  });
});
