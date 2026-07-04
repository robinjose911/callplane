import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { rm } from "node:fs/promises";
import {
  prisma,
  createAgentConfigRepository,
  createCallRepository,
  createCallCostRepository,
  createRecordingRepository,
} from "@callplane/database";
import { createApp } from "../app.js";

const API_KEY = "test-api-key";
const AUTH_HEADERS = { Authorization: `Bearer ${API_KEY}` };
const RECORDINGS_DIR = "./.tmp-cost-recording-test";

const agentConfigRepo = createAgentConfigRepository(prisma);
const callRepo = createCallRepository(prisma);
const callCostRepo = createCallCostRepository(prisma);
const recordingRepo = createRecordingRepository(prisma);

const agentName = "test-cost-recording-agent";
const callSids: string[] = [];

async function makeCall(): Promise<string> {
  const callSid = crypto.randomUUID();
  callSids.push(callSid);
  await callRepo.create({ callSid, agentId: agentName, channel: "browser" });
  return callSid;
}

beforeAll(async () => {
  process.env["CALLPLANE_API_KEY"] = API_KEY;
  process.env["RECORDINGS_DIR"] = RECORDINGS_DIR;
  await agentConfigRepo.create({ name: agentName, voiceMode: "cascade", prompt: "x" });
});

afterAll(async () => {
  await prisma.callCost.deleteMany({ where: { callSid: { in: callSids } } });
  await prisma.recording.deleteMany({ where: { callSid: { in: callSids } } });
  await prisma.call.deleteMany({ where: { callSid: { in: callSids } } });
  await prisma.agentConfig.deleteMany({ where: { name: agentName } });
  await rm(RECORDINGS_DIR, { recursive: true, force: true });
});

describe("GET /v1/calls/:callSid/cost", () => {
  it("returns metered cost rows for a call", async () => {
    const callSid = await makeCall();
    await callCostRepo.create({
      callSid,
      provider: "deepgram",
      providerType: "stt",
      units: 5,
      unitType: "seconds",
      costAmount: 0.0215,
    });

    const app = createApp();
    const response = await request(app).get(`/v1/calls/${callSid}/cost`).set(AUTH_HEADERS);

    expect(response.status).toBe(200);
    expect(response.body.costs).toHaveLength(1);
    expect(response.body.costs[0]).toMatchObject({ provider: "deepgram", costAmount: 0.0215 });
  });

  it("404s for an unknown call", async () => {
    const app = createApp();
    const response = await request(app).get("/v1/calls/does-not-exist/cost").set(AUTH_HEADERS);
    expect(response.status).toBe(404);
  });
});

describe("GET /v1/calls/:callSid/recording", () => {
  it("404s before a recording exists", async () => {
    const callSid = await makeCall();
    const app = createApp();
    const response = await request(app).get(`/v1/calls/${callSid}/recording`).set(AUTH_HEADERS);
    expect(response.status).toBe(404);
  });

  it("streams the WAV with the correct content type once a recording exists", async () => {
    const callSid = await makeCall();
    const app = createApp();

    // Write directly through the same adapter the app itself constructs (same RECORDINGS_DIR).
    const { createLocalDiskAdapter, generateStubWavBuffer } = await import("@callplane/voice-core");
    const adapter = createLocalDiskAdapter(RECORDINGS_DIR);
    const wav = generateStubWavBuffer(1);
    const storagePath = await adapter.put(`${callSid}.wav`, wav);
    await recordingRepo.create({ callSid, storagePath, durationSeconds: 1, sizeBytes: BigInt(wav.length) });

    const response = await request(app).get(`/v1/calls/${callSid}/recording`).set(AUTH_HEADERS);

    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toContain("audio/wav");
    expect(Buffer.from(response.body).toString("ascii", 0, 4)).toBe("RIFF");
  });
});

describe("GET/POST /v1/price-table", () => {
  it("rejects requests without a valid API key", async () => {
    const app = createApp();
    const response = await request(app).get("/v1/price-table");
    expect(response.status).toBe(401);
  });

  it("lists seeded price rows", async () => {
    const app = createApp();
    const response = await request(app).get("/v1/price-table").set(AUTH_HEADERS);
    expect(response.status).toBe(200);
    expect(Array.isArray(response.body.entries)).toBe(true);
  });

  it("upserts a price and reflects the new rate on a subsequent read", async () => {
    const app = createApp();
    const upsertResponse = await request(app)
      .post("/v1/price-table")
      .set(AUTH_HEADERS)
      .send({ provider: "test-provider", providerType: "llm", unitType: "tokens", pricePerUnit: 0.001 });

    expect(upsertResponse.status).toBe(200);
    expect(upsertResponse.body).toMatchObject({ provider: "test-provider", pricePerUnit: 0.001 });

    const secondUpsert = await request(app)
      .post("/v1/price-table")
      .set(AUTH_HEADERS)
      .send({ provider: "test-provider", providerType: "llm", unitType: "tokens", pricePerUnit: 0.002 });

    expect(secondUpsert.body).toMatchObject({ pricePerUnit: 0.002 });
    expect(secondUpsert.body.id).toBe(upsertResponse.body.id); // same row, updated in place

    await prisma.priceTable.delete({ where: { id: upsertResponse.body.id } });
  });

  it("rejects a negative price", async () => {
    const app = createApp();
    const response = await request(app)
      .post("/v1/price-table")
      .set(AUTH_HEADERS)
      .send({ provider: "test-provider", providerType: "llm", unitType: "tokens", pricePerUnit: -1 });
    expect(response.status).toBe(422);
  });
});
