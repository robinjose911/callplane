import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { prisma, createAgentConfigRepository, createCallRepository, createCallCostRepository } from "@callplane/database";
import { createApp } from "../app.js";

const API_KEY = "test-api-key";
const AUTH_HEADERS = { Authorization: `Bearer ${API_KEY}` };

const agentConfigRepo = createAgentConfigRepository(prisma);
const callRepo = createCallRepository(prisma);
const callCostRepo = createCallCostRepository(prisma);

const agentName = "test-costs-aggregate-agent";
const callSids: string[] = [];

beforeAll(async () => {
  process.env["CALLPLANE_API_KEY"] = API_KEY;
  await agentConfigRepo.create({ name: agentName, voiceMode: "cascade", prompt: "x" });
});

afterAll(async () => {
  await prisma.callCost.deleteMany({ where: { callSid: { in: callSids } } });
  await prisma.call.deleteMany({ where: { callSid: { in: callSids } } });
  await prisma.agentConfig.deleteMany({ where: { name: agentName } });
});

describe("GET /v1/costs", () => {
  it("returns recent cost rows across calls", async () => {
    const callSid = crypto.randomUUID();
    callSids.push(callSid);
    await callRepo.create({ callSid, agentId: agentName, channel: "browser" });
    await callCostRepo.create({
      callSid,
      provider: "deepgram",
      providerType: "stt",
      units: 5,
      unitType: "seconds",
      costAmount: 0.0215,
    });

    const app = createApp();
    const response = await request(app).get("/v1/costs").set(AUTH_HEADERS);

    expect(response.status).toBe(200);
    expect(Array.isArray(response.body.costs)).toBe(true);
    expect(response.body.costs.some((c: { callSid: string }) => c.callSid === callSid)).toBe(true);
  });

  it("rejects requests without a valid API key", async () => {
    const app = createApp();
    const response = await request(app).get("/v1/costs");
    expect(response.status).toBe(401);
  });
});
