import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import {
  prisma,
  createAgentConfigRepository,
  createCallRepository,
  createWebhookEndpointRepository,
  createWebhookOutboxRepository,
} from "@callplane/database";
import { buildWebhookIdempotencyKey } from "@callplane/contracts";
import { processWebhookDispatcherJob } from "../workers/webhook-dispatcher.worker.js";

const agentConfigRepo = createAgentConfigRepository(prisma);
const callRepo = createCallRepository(prisma);
const webhookEndpointRepo = createWebhookEndpointRepository(prisma);
const webhookOutboxRepo = createWebhookOutboxRepository(prisma);

const agentName = "test-webhook-dispatcher-agent";
const callSids: string[] = [];
const endpointIds: string[] = [];

async function makeCall(): Promise<string> {
  const callSid = crypto.randomUUID();
  callSids.push(callSid);
  await callRepo.create({ callSid, agentId: agentName, channel: "browser" });
  return callSid;
}

async function makeEndpoint(overrides: Partial<{ isEnabled: boolean; secret: string }> = {}): Promise<string> {
  const endpoint = await webhookEndpointRepo.create({
    name: `test-endpoint-${crypto.randomUUID()}`,
    url: "http://localhost:4999/webhook",
    secret: overrides.secret ?? "whsec_test",
    isEnabled: overrides.isEnabled ?? true,
    eventTypes: ["post_call_transcription"],
  });
  endpointIds.push(endpoint.id);
  return endpoint.id;
}

async function makeOutbox(callSid: string, webhookEndpointId: string, overrides: Record<string, unknown> = {}) {
  const { outbox } = await webhookOutboxRepo.create({
    callSid,
    webhookEndpointId,
    eventType: "post_call_transcription",
    payload: { type: "post_call_transcription", data: { call_sid: callSid } },
    idempotencyKey: buildWebhookIdempotencyKey(callSid, "post_call_transcription") + `:${webhookEndpointId}:${crypto.randomUUID()}`,
    ...overrides,
  });
  return outbox;
}

beforeAll(async () => {
  await agentConfigRepo.create({ name: agentName, voiceMode: "realtime", prompt: "x" });
});

afterAll(async () => {
  // Filtered by webhookEndpointId, not just callSid: this suite's own enabled test endpoints can
  // be picked up by a *different* test file's calls reaching a terminal status while both run
  // concurrently against the same real Postgres (call-executor.worker.test.ts's own
  // enqueueWebhooksForCall call queries ALL enabled endpoints, not just ones its own suite made).
  // Deleting only by callSid would leave those cross-file rows behind, blocking endpoint deletion.
  await prisma.webhookOutbox.deleteMany({ where: { webhookEndpointId: { in: endpointIds } } });
  await prisma.webhookEndpoint.deleteMany({ where: { id: { in: endpointIds } } });
  await prisma.call.deleteMany({ where: { callSid: { in: callSids } } });
  await prisma.agentConfig.deleteMany({ where: { name: agentName } });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("processWebhookDispatcherJob", () => {
  it("is a no-op when the outbox row doesn't exist", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await processWebhookDispatcherJob({ webhookOutboxId: "does-not-exist", callSid: "x" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("marks DELIVERED and sends a valid ElevenLabs-Signature + X-Idempotency-Key on a 2xx response", async () => {
    const callSid = await makeCall();
    const endpointId = await makeEndpoint();
    const outbox = await makeOutbox(callSid, endpointId);

    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal("fetch", fetchMock);

    await processWebhookDispatcherJob({ webhookOutboxId: outbox.id, callSid });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://localhost:4999/webhook");
    expect(options.headers).toMatchObject({
      "ElevenLabs-Signature": expect.stringMatching(/^t=\d+,v0=[0-9a-f]{64}$/),
      "X-Idempotency-Key": outbox.idempotencyKey,
    });

    const updated = await webhookOutboxRepo.findById(outbox.id);
    expect(updated?.status).toBe("DELIVERED");
  });

  it("schedules a retry with 30s backoff on the first failure (retryCount 0 -> 1)", async () => {
    const callSid = await makeCall();
    const endpointId = await makeEndpoint();
    const outbox = await makeOutbox(callSid, endpointId);

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500 }));
    const before = Date.now();

    await processWebhookDispatcherJob({ webhookOutboxId: outbox.id, callSid });

    const updated = await webhookOutboxRepo.findById(outbox.id);
    expect(updated?.status).toBe("RETRY_PENDING");
    expect(updated?.retryCount).toBe(1);
    const delayMs = updated!.nextRetryAt!.getTime() - before;
    expect(delayMs).toBeGreaterThanOrEqual(29_000);
    expect(delayMs).toBeLessThanOrEqual(31_000);
  });

  it("marks DEAD once retryCount reaches maxRetries instead of scheduling another retry", async () => {
    const callSid = await makeCall();
    const endpointId = await makeEndpoint();
    const outbox = await makeOutbox(callSid, endpointId, { maxRetries: 1 });

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500 }));
    await processWebhookDispatcherJob({ webhookOutboxId: outbox.id, callSid });

    const updated = await webhookOutboxRepo.findById(outbox.id);
    expect(updated?.status).toBe("DEAD");
  });

  it("does not dispatch (and does not call fetch) for a disabled endpoint", async () => {
    const callSid = await makeCall();
    const endpointId = await makeEndpoint({ isEnabled: false });
    const outbox = await makeOutbox(callSid, endpointId);

    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await processWebhookDispatcherJob({ webhookOutboxId: outbox.id, callSid });

    expect(fetchMock).not.toHaveBeenCalled();
    const updated = await webhookOutboxRepo.findById(outbox.id);
    expect(updated?.status).toBe("PENDING"); // untouched
  });

  it("is a no-op for an already-DELIVERED or DEAD outbox row (idempotent against a stale/duplicate job)", async () => {
    const callSid = await makeCall();
    const endpointId = await makeEndpoint();
    const outbox = await makeOutbox(callSid, endpointId);
    await webhookOutboxRepo.markDelivered(outbox.id);

    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await processWebhookDispatcherJob({ webhookOutboxId: outbox.id, callSid });

    expect(fetchMock).not.toHaveBeenCalled();
  });
});
