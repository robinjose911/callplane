import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../index.js";
import { createAgentConfigRepository } from "../repositories/agent-config.repository.js";
import { createCallRepository } from "../repositories/call.repository.js";
import { createWebhookEndpointRepository } from "../repositories/webhook-endpoint.repository.js";
import { createWebhookOutboxRepository } from "../repositories/webhook-outbox.repository.js";
import { testId } from "./test-helpers.js";

const agentConfigRepo = createAgentConfigRepository(prisma);
const callRepo = createCallRepository(prisma);
const endpointRepo = createWebhookEndpointRepository(prisma);
const outboxRepo = createWebhookOutboxRepository(prisma);

const agentName = testId("wh-agent");
const endpointName = testId("wh-endpoint");
let endpointId: string;
const callSid = crypto.randomUUID();

beforeAll(async () => {
  await agentConfigRepo.create({ name: agentName, voiceMode: "realtime", prompt: "x" });
  await callRepo.create({ callSid, agentId: agentName, channel: "browser" });
  const endpoint = await endpointRepo.create({
    name: endpointName,
    url: "http://localhost:4999/webhook",
    secret: "test-secret",
    eventTypes: ["post_call_transcription"],
  });
  endpointId = endpoint.id;
});

afterAll(async () => {
  await prisma.webhookOutbox.deleteMany({ where: { callSid } });
  await prisma.call.deleteMany({ where: { callSid } });
  await prisma.webhookEndpoint.deleteMany({ where: { name: endpointName } });
  await prisma.agentConfig.deleteMany({ where: { name: agentName } });
});

describe("WebhookOutboxRepository", () => {
  it("redacts the secret on every read path", async () => {
    const found = await endpointRepo.findByName(endpointName);
    expect(found?.secret).toBe("****");

    const listed = await endpointRepo.listAll();
    expect(listed.find((e) => e.name === endpointName)?.secret).toBe("****");
  });

  it("creates an outbox entry, and a duplicate idempotencyKey returns inserted: false", async () => {
    const idempotencyKey = testId("outbox-idem");
    const first = await outboxRepo.create({
      callSid,
      webhookEndpointId: endpointId,
      eventType: "post_call_transcription",
      payload: { hello: "world" },
      idempotencyKey,
    });
    expect(first.inserted).toBe(true);

    const second = await outboxRepo.create({
      callSid,
      webhookEndpointId: endpointId,
      eventType: "post_call_transcription",
      payload: { hello: "world" },
      idempotencyKey,
    });
    expect(second.inserted).toBe(false);
    expect(second.outbox.id).toBe(first.outbox.id);
  });

  it("atomically increments retryCount under 10 concurrent calls — no lost updates", async () => {
    const idempotencyKey = testId("outbox-concurrent");
    const { outbox } = await outboxRepo.create({
      callSid,
      webhookEndpointId: endpointId,
      eventType: "post_call_transcription",
      payload: {},
      idempotencyKey,
    });

    await Promise.all(
      Array.from({ length: 10 }, () => outboxRepo.incrementRetry(outbox.id, new Date(Date.now() + 1000))),
    );

    const final = await outboxRepo.findById(outbox.id);
    expect(final?.retryCount).toBe(10);
  });
});
