import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { seed, prisma, createAgentConfigRepository, AGENT_CONFIG_NAMES } from "@callplane/database";
import { createApp } from "../app.js";

const API_KEY = "test-api-key";
const mockQueue = { add: vi.fn().mockResolvedValue(undefined) };

function appWithMockQueue() {
  return createApp({ callExecutorQueue: mockQueue as never });
}

describe("POST /v1/calls", () => {
  const originalApiKey = process.env["CALLPLANE_API_KEY"];
  const originalStubMode = process.env["PROVIDER_STUB_MODE"];
  const createdCallSids: string[] = [];

  beforeAll(async () => {
    process.env["CALLPLANE_API_KEY"] = API_KEY;
    await seed();
  });

  afterAll(async () => {
    if (originalApiKey === undefined) delete process.env["CALLPLANE_API_KEY"];
    else process.env["CALLPLANE_API_KEY"] = originalApiKey;
    await prisma.callEvent.deleteMany({ where: { callSid: { in: createdCallSids } } });
    await prisma.call.deleteMany({ where: { callSid: { in: createdCallSids } } });
  });

  afterEach(() => {
    mockQueue.add.mockClear();
    if (originalStubMode === undefined) delete process.env["PROVIDER_STUB_MODE"];
    else process.env["PROVIDER_STUB_MODE"] = originalStubMode;
  });

  it("401s with no Authorization header", async () => {
    const response = await request(appWithMockQueue())
      .post("/v1/calls")
      .send({ agentId: AGENT_CONFIG_NAMES.CASCADE, channel: "browser" });

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("AUTH_ERROR");
  });

  it("401s with a wrong API key", async () => {
    const response = await request(appWithMockQueue())
      .post("/v1/calls")
      .set("Authorization", "Bearer wrong-key")
      .send({ agentId: AGENT_CONFIG_NAMES.CASCADE, channel: "browser" });

    expect(response.status).toBe(401);
  });

  it("rejects an invalid payload", async () => {
    const response = await request(appWithMockQueue())
      .post("/v1/calls")
      .set("Authorization", `Bearer ${API_KEY}`)
      .send({ agentId: "", channel: "browser" });

    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("returns 200 { callSid, status: QUEUED } for a valid browser call and enqueues one job", async () => {
    const response = await request(appWithMockQueue())
      .post("/v1/calls")
      .set("Authorization", `Bearer ${API_KEY}`)
      .send({ agentId: AGENT_CONFIG_NAMES.CASCADE, channel: "browser" });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ status: "QUEUED" });
    expect(response.body.callSid).toMatch(/^[0-9a-f-]{36}$/);
    createdCallSids.push(response.body.callSid);

    expect(mockQueue.add).toHaveBeenCalledTimes(1);
    expect(mockQueue.add).toHaveBeenCalledWith(
      "call-executor",
      expect.objectContaining({ callSid: response.body.callSid, agentId: AGENT_CONFIG_NAMES.CASCADE }),
      { jobId: response.body.callSid },
    );
  });

  it("404s for an unknown agentId", async () => {
    const response = await request(appWithMockQueue())
      .post("/v1/calls")
      .set("Authorization", `Bearer ${API_KEY}`)
      .send({ agentId: "does-not-exist", channel: "browser" });

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe("NOT_FOUND");
  });

  it("rejects scenario when stub mode is off", async () => {
    delete process.env["PROVIDER_STUB_MODE"];

    const response = await request(appWithMockQueue())
      .post("/v1/calls")
      .set("Authorization", `Bearer ${API_KEY}`)
      .send({ agentId: AGENT_CONFIG_NAMES.CASCADE, channel: "browser", scenario: "demo_greeting" });

    expect(response.status).toBe(422);
  });

  it("accepts scenario when stub mode is on", async () => {
    process.env["PROVIDER_STUB_MODE"] = "true";

    const response = await request(appWithMockQueue())
      .post("/v1/calls")
      .set("Authorization", `Bearer ${API_KEY}`)
      .send({ agentId: AGENT_CONFIG_NAMES.CASCADE, channel: "browser", scenario: "demo_greeting" });

    expect(response.status).toBe(200);
    createdCallSids.push(response.body.callSid);
  });

  it("a duplicate sip request within 60s returns the same callSid and does not enqueue a second job", async () => {
    const agentConfigRepo = createAgentConfigRepository(prisma);
    await agentConfigRepo.upsertByName(AGENT_CONFIG_NAMES.CASCADE, {
      name: AGENT_CONFIG_NAMES.CASCADE,
      voiceMode: "cascade",
      prompt: "test",
    });

    const body = { agentId: AGENT_CONFIG_NAMES.CASCADE, channel: "sip" as const, toNumber: "+15550001234" };

    const first = await request(appWithMockQueue())
      .post("/v1/calls")
      .set("Authorization", `Bearer ${API_KEY}`)
      .send(body);
    expect(first.status).toBe(200);
    createdCallSids.push(first.body.callSid);

    const second = await request(appWithMockQueue())
      .post("/v1/calls")
      .set("Authorization", `Bearer ${API_KEY}`)
      .send(body);
    expect(second.status).toBe(200);
    expect(second.body.callSid).toBe(first.body.callSid);

    expect(mockQueue.add).toHaveBeenCalledTimes(1);
  });

  it("two truly concurrent requests with the same agentId+toNumber both 200 with the same callSid", async () => {
    const agentConfigRepo = createAgentConfigRepository(prisma);
    await agentConfigRepo.upsertByName(AGENT_CONFIG_NAMES.CASCADE, {
      name: AGENT_CONFIG_NAMES.CASCADE,
      voiceMode: "cascade",
      prompt: "test",
    });

    const body = { agentId: AGENT_CONFIG_NAMES.CASCADE, channel: "sip" as const, toNumber: "+15550009999" };

    // Fired in parallel (not awaited sequentially) so both requests pass the
    // findActiveByIdempotencyKey check before either has committed its INSERT — this is the
    // race the P2002 catch-and-recover path in initiateCall() exists to handle.
    const [first, second] = await Promise.all([
      request(appWithMockQueue()).post("/v1/calls").set("Authorization", `Bearer ${API_KEY}`).send(body),
      request(appWithMockQueue()).post("/v1/calls").set("Authorization", `Bearer ${API_KEY}`).send(body),
    ]);

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(first.body.callSid).toBe(second.body.callSid);
    createdCallSids.push(first.body.callSid);

    expect(mockQueue.add).toHaveBeenCalledTimes(1);
  });
});
