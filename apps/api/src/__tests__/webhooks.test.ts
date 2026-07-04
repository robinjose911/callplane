import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { prisma, createCallRepository, createAgentConfigRepository, createWebhookOutboxRepository } from "@callplane/database";
import { buildWebhookIdempotencyKey } from "@callplane/contracts";
import { createApp } from "../app.js";

const API_KEY = "test-api-key";
const AUTH_HEADERS = { Authorization: `Bearer ${API_KEY}` };
const mockQueue = { add: vi.fn().mockResolvedValue(undefined) };
const app = createApp({ webhookDispatcherQueue: mockQueue as never });

const callRepo = createCallRepository(prisma);
const agentConfigRepo = createAgentConfigRepository(prisma);
const webhookOutboxRepo = createWebhookOutboxRepository(prisma);

const agentName = "test-webhooks-api-agent";
const endpointNames: string[] = [];
const callSids: string[] = [];

function uniqueName(): string {
  const name = `test-webhook-endpoint-${crypto.randomUUID()}`;
  endpointNames.push(name);
  return name;
}

beforeAll(async () => {
  process.env["CALLPLANE_API_KEY"] = API_KEY;
  await agentConfigRepo.create({ name: agentName, voiceMode: "realtime", prompt: "x" });
});

afterAll(async () => {
  const endpoints = await prisma.webhookEndpoint.findMany({ where: { name: { in: endpointNames } } });
  const endpointIds = endpoints.map((e) => e.id);
  await prisma.webhookOutbox.deleteMany({ where: { webhookEndpointId: { in: endpointIds } } });
  await prisma.webhookEndpoint.deleteMany({ where: { id: { in: endpointIds } } });
  await prisma.call.deleteMany({ where: { callSid: { in: callSids } } });
  await prisma.agentConfig.deleteMany({ where: { name: agentName } });
});

describe("GET /v1/webhook-endpoints", () => {
  it("rejects requests without a valid API key", async () => {
    const response = await request(app).get("/v1/webhook-endpoints");
    expect(response.status).toBe(401);
  });

  it("returns endpoints with the secret redacted", async () => {
    const name = uniqueName();
    await request(app)
      .post("/v1/webhook-endpoints")
      .set(AUTH_HEADERS)
      .send({ name, url: "http://localhost:4999/webhook", secret: "whsec_real_secret", eventTypes: ["post_call_transcription"] });

    const response = await request(app).get("/v1/webhook-endpoints").set(AUTH_HEADERS);
    expect(response.status).toBe(200);
    const created = response.body.endpoints.find((e: { name: string }) => e.name === name);
    expect(created.secret).toBe("****");
  });
});

describe("POST /v1/webhook-endpoints", () => {
  it("creates an endpoint with the given event types", async () => {
    const name = uniqueName();
    const response = await request(app)
      .post("/v1/webhook-endpoints")
      .set(AUTH_HEADERS)
      .send({ name, url: "http://localhost:4999/webhook", secret: "whsec_x", eventTypes: ["post_call_transcription"] });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ name, isEnabled: false, eventTypes: ["post_call_transcription"] });
  });

  it("rejects a duplicate name with 409", async () => {
    const name = uniqueName();
    await request(app)
      .post("/v1/webhook-endpoints")
      .set(AUTH_HEADERS)
      .send({ name, url: "http://localhost:4999/webhook", secret: "x", eventTypes: ["post_call_transcription"] });

    const response = await request(app)
      .post("/v1/webhook-endpoints")
      .set(AUTH_HEADERS)
      .send({ name, url: "http://localhost:4999/webhook", secret: "x", eventTypes: ["post_call_transcription"] });

    expect(response.status).toBe(409);
  });

  it("rejects an empty eventTypes array", async () => {
    const response = await request(app)
      .post("/v1/webhook-endpoints")
      .set(AUTH_HEADERS)
      .send({ name: uniqueName(), url: "http://localhost:4999/webhook", secret: "x", eventTypes: [] });

    expect(response.status).toBe(422);
  });

  it("rejects a URL pointing at the cloud metadata address (SSRF guard)", async () => {
    const response = await request(app)
      .post("/v1/webhook-endpoints")
      .set(AUTH_HEADERS)
      .send({
        name: uniqueName(),
        url: "http://169.254.169.254/latest/meta-data/",
        secret: "x",
        eventTypes: ["post_call_transcription"],
      });

    expect(response.status).toBe(422);
  });

  it("still allows a localhost URL (the local-first demo's own webhook receiver pattern)", async () => {
    const response = await request(app)
      .post("/v1/webhook-endpoints")
      .set(AUTH_HEADERS)
      .send({ name: uniqueName(), url: "http://localhost:4999/webhook", secret: "x", eventTypes: ["post_call_transcription"] });

    expect(response.status).toBe(200);
  });
});

describe("PATCH /v1/webhook-endpoints/:name", () => {
  it("toggles isEnabled and leaves the secret unchanged when not provided", async () => {
    const name = uniqueName();
    await request(app)
      .post("/v1/webhook-endpoints")
      .set(AUTH_HEADERS)
      .send({ name, url: "http://localhost:4999/webhook", secret: "x", eventTypes: ["post_call_transcription"] });

    const response = await request(app).patch(`/v1/webhook-endpoints/${name}`).set(AUTH_HEADERS).send({ isEnabled: true });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ isEnabled: true, secret: "****" });
  });

  it("404s updating an unknown endpoint", async () => {
    const response = await request(app).patch("/v1/webhook-endpoints/does-not-exist").set(AUTH_HEADERS).send({ isEnabled: true });
    expect(response.status).toBe(404);
  });
});

describe("GET /v1/webhook-outbox", () => {
  it("requires ?callSid=", async () => {
    const response = await request(app).get("/v1/webhook-outbox").set(AUTH_HEADERS);
    expect(response.status).toBe(422);
  });

  it("returns outbox entries for the given call", async () => {
    const callSid = crypto.randomUUID();
    callSids.push(callSid);
    await callRepo.create({ callSid, agentId: agentName, channel: "browser" });

    const name = uniqueName();
    const endpointResponse = await request(app)
      .post("/v1/webhook-endpoints")
      .set(AUTH_HEADERS)
      .send({ name, url: "http://localhost:4999/webhook", secret: "x", eventTypes: ["post_call_transcription"] });

    await webhookOutboxRepo.create({
      callSid,
      webhookEndpointId: endpointResponse.body.id,
      eventType: "post_call_transcription",
      payload: { type: "post_call_transcription" },
      idempotencyKey: `${buildWebhookIdempotencyKey(callSid, "post_call_transcription")}:${endpointResponse.body.id}`,
    });

    const response = await request(app).get(`/v1/webhook-outbox?callSid=${callSid}`).set(AUTH_HEADERS);
    expect(response.status).toBe(200);
    expect(response.body.entries).toHaveLength(1);
    expect(response.body.entries[0]).toMatchObject({ callSid, status: "PENDING" });
  });
});

describe("POST /v1/webhook-outbox/:id/replay", () => {
  it("resets a DEAD entry to PENDING and re-enqueues a dispatch job", async () => {
    const callSid = crypto.randomUUID();
    callSids.push(callSid);
    await callRepo.create({ callSid, agentId: agentName, channel: "browser" });

    const name = uniqueName();
    const endpointResponse = await request(app)
      .post("/v1/webhook-endpoints")
      .set(AUTH_HEADERS)
      .send({ name, url: "http://localhost:4999/webhook", secret: "x", eventTypes: ["post_call_transcription"] });

    const { outbox } = await webhookOutboxRepo.create({
      callSid,
      webhookEndpointId: endpointResponse.body.id,
      eventType: "post_call_transcription",
      payload: { type: "post_call_transcription" },
      idempotencyKey: `${buildWebhookIdempotencyKey(callSid, "post_call_transcription")}:${endpointResponse.body.id}`,
    });
    await webhookOutboxRepo.markDead(outbox.id);
    mockQueue.add.mockClear();

    const response = await request(app).post(`/v1/webhook-outbox/${outbox.id}/replay`).set(AUTH_HEADERS);

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ status: "PENDING", retryCount: 0 });
    expect(mockQueue.add).toHaveBeenCalledTimes(1);
    expect(mockQueue.add).toHaveBeenCalledWith(
      "webhook-dispatcher",
      { webhookOutboxId: outbox.id, callSid },
      expect.objectContaining({ jobId: expect.any(String) }),
    );
  });

  it("404s replaying an unknown outbox entry", async () => {
    const response = await request(app).post("/v1/webhook-outbox/does-not-exist/replay").set(AUTH_HEADERS);
    expect(response.status).toBe(404);
  });
});
