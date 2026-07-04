import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../index.js";
import { createAgentConfigRepository } from "../repositories/agent-config.repository.js";
import { createCallRepository } from "../repositories/call.repository.js";
import { createRecordingRepository } from "../repositories/recording.repository.js";
import { testId } from "./test-helpers.js";

const agentConfigRepo = createAgentConfigRepository(prisma);
const callRepo = createCallRepository(prisma);
const recordingRepo = createRecordingRepository(prisma);

const agentName = testId("recording-agent");
const callSid = crypto.randomUUID();

beforeAll(async () => {
  await agentConfigRepo.create({ name: agentName, voiceMode: "realtime", prompt: "x" });
  await callRepo.create({ callSid, agentId: agentName, channel: "browser" });
});

afterAll(async () => {
  await prisma.recording.deleteMany({ where: { callSid } });
  await prisma.call.deleteMany({ where: { callSid } });
  await prisma.agentConfig.deleteMany({ where: { name: agentName } });
});

describe("RecordingRepository", () => {
  it("creates a recording and finds it by callSid", async () => {
    const created = await recordingRepo.create({ callSid, storagePath: `/tmp/${callSid}.wav`, durationSeconds: 5 });
    expect(created.callSid).toBe(callSid);

    const found = await recordingRepo.findByCallSid(callSid);
    expect(found?.storagePath).toBe(`/tmp/${callSid}.wav`);
  });

  it("a concurrent duplicate create (same callSid) returns the existing row instead of throwing P2002", async () => {
    // The first create() above already inserted this callSid's row — a second create() with a
    // DIFFERENT storagePath simulates two overlapping job executions racing to record the same
    // call; the race loser should get back the winner's row, not a thrown unique-constraint error.
    const result = await recordingRepo.create({ callSid, storagePath: "/tmp/a-different-path.wav" });
    expect(result.storagePath).toBe(`/tmp/${callSid}.wav`); // the original row, not the duplicate attempt
  });
});
