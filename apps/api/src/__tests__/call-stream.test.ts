import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import {
  prisma,
  createAgentConfigRepository,
  createCallRepository,
  createCallEventRepository,
  createWebhookEndpointRepository,
  createWebhookOutboxRepository,
} from "@callplane/database";
import { createApp } from "../app.js";

const API_KEY = "test-api-key";
const AUTH_HEADERS = { Authorization: `Bearer ${API_KEY}` };

const agentConfigRepo = createAgentConfigRepository(prisma);
const callRepo = createCallRepository(prisma);
const callEventRepo = createCallEventRepository(prisma);
const webhookEndpointRepo = createWebhookEndpointRepository(prisma);
const webhookOutboxRepo = createWebhookOutboxRepository(prisma);

const agentName = "test-call-stream-agent";
const endpointName = "test-call-stream-endpoint";
const callSids: string[] = [];
let endpointId: string;

beforeAll(async () => {
  process.env["CALLPLANE_API_KEY"] = API_KEY;
  await agentConfigRepo.create({ name: agentName, voiceMode: "realtime", prompt: "x" });
  const endpoint = await webhookEndpointRepo.create({
    name: endpointName,
    url: "http://localhost:4999/webhook",
    secret: "test-secret",
    eventTypes: ["post_call_transcription"],
  });
  endpointId = endpoint.id;
});

afterAll(async () => {
  await prisma.webhookOutbox.deleteMany({ where: { callSid: { in: callSids } } });
  await prisma.callEvent.deleteMany({ where: { callSid: { in: callSids } } });
  await prisma.call.deleteMany({ where: { callSid: { in: callSids } } });
  await prisma.webhookEndpoint.deleteMany({ where: { name: endpointName } });
  await prisma.agentConfig.deleteMany({ where: { name: agentName } });
});

describe("GET /v1/calls/:callSid/stream (SSE)", () => {
  it("streams a snapshot and closes once the call is terminal and its webhook delivery has settled", async () => {
    const callSid = crypto.randomUUID();
    callSids.push(callSid);
    await callRepo.create({ callSid, agentId: agentName, channel: "browser" });
    await callEventRepo.append({ callSid, eventType: "call_completed" });
    await callRepo.updateStatus(callSid, "COMPLETED");

    // A settled delivery makes the stream stop on its very first tick instead of waiting out the
    // 10-tick no-deliveries grace period — keeps this test fast without needing to fake timers
    // through a live HTTP response stream.
    const { outbox } = await webhookOutboxRepo.create({
      callSid,
      webhookEndpointId: endpointId,
      eventType: "post_call_transcription",
      payload: {},
      idempotencyKey: `${callSid}:post_call_transcription:${endpointId}`,
    });
    await webhookOutboxRepo.markDelivered(outbox.id);

    const app = createApp();
    const response = await request(app).get(`/v1/calls/${callSid}/stream`).set(AUTH_HEADERS).buffer(true);

    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toContain("text/event-stream");

    const body = response.text ?? response.body.toString();
    const dataLines = body.split("\n\n").filter((chunk) => chunk.startsWith("data: "));
    expect(dataLines.length).toBeGreaterThan(0);

    const lastSnapshot = JSON.parse(dataLines.at(-1)!.replace(/^data: /, ""));
    expect(lastSnapshot.call.status).toBe("COMPLETED");
    expect(lastSnapshot.call.callSid).toBe(callSid);
    expect(Array.isArray(lastSnapshot.events)).toBe(true);
    expect(lastSnapshot.webhookDeliveries).toHaveLength(1);
    expect(lastSnapshot.webhookDeliveries[0].status).toBe("DELIVERED");
    expect(lastSnapshot.hasRecording).toBe(false);
    expect(lastSnapshot.final).toBe(true); // tells the client's EventSource to close, not reconnect
  }, 10000);

  it("404s for an unknown call", async () => {
    const app = createApp();
    const response = await request(app).get("/v1/calls/does-not-exist/stream").set(AUTH_HEADERS);
    expect(response.status).toBe(404);
  });
});
