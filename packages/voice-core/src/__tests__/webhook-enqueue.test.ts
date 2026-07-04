import { describe, expect, it, vi } from "vitest";
import type { Call } from "@callplane/database";
import { enqueueWebhooksForCall, type WebhookEnqueueDeps } from "../lib/webhook-enqueue.js";

function call(overrides: Partial<Call> = {}): Call {
  return {
    id: "row-1",
    callSid: "call-1",
    agentId: "demo-cascade",
    channel: "sip",
    toNumber: "+14155551234",
    status: "COMPLETED",
    scenario: null,
    dynamicVariables: null,
    idempotencyKey: null,
    createdAt: new Date("2026-07-04T00:00:00.000Z"),
    updatedAt: new Date("2026-07-04T00:00:10.000Z"),
    ...overrides,
  } as Call;
}

function endpoint(overrides: Record<string, unknown> = {}) {
  return {
    id: "endpoint-1",
    name: "default",
    url: "http://localhost:4999/webhook",
    secret: "****",
    isEnabled: true,
    eventTypes: ["post_call_transcription", "call_initiation_failure"],
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function deps(overrides: Partial<{ endpoints: ReturnType<typeof endpoint>[] }> = {}) {
  const outboxRows = new Map<string, { id: string }>();
  let counter = 0;

  const webhookOutboxRepo = {
    create: vi.fn().mockImplementation(async (input: { idempotencyKey: string }) => {
      const existing = outboxRows.get(input.idempotencyKey);
      if (existing) return { outbox: existing, inserted: false };
      counter += 1;
      const row = { id: `outbox-${counter}`, ...input };
      outboxRows.set(input.idempotencyKey, row);
      return { outbox: row, inserted: true };
    }),
  };
  const webhookEndpointRepo = {
    listAll: vi.fn().mockResolvedValue(overrides.endpoints ?? [endpoint()]),
  };
  const webhookDispatcherQueue = { add: vi.fn().mockResolvedValue(undefined) };

  return { webhookOutboxRepo, webhookEndpointRepo, webhookDispatcherQueue };
}

function asDeps(d: ReturnType<typeof deps>): WebhookEnqueueDeps {
  return d as unknown as WebhookEnqueueDeps;
}

describe("enqueueWebhooksForCall", () => {
  it("does nothing for a non-terminal call", async () => {
    const d = deps();
    await enqueueWebhooksForCall(call({ status: "IN_PROGRESS" }), [], asDeps(d));
    expect(d.webhookEndpointRepo.listAll).not.toHaveBeenCalled();
  });

  it("creates one outbox row and enqueues one dispatch job for a subscribed enabled endpoint", async () => {
    const d = deps();
    await enqueueWebhooksForCall(call(), [], asDeps(d));

    expect(d.webhookOutboxRepo.create).toHaveBeenCalledTimes(1);
    expect(d.webhookDispatcherQueue.add).toHaveBeenCalledTimes(1);
    expect(d.webhookDispatcherQueue.add).toHaveBeenCalledWith(
      "webhook-dispatcher",
      expect.objectContaining({ callSid: "call-1" }),
      expect.objectContaining({ jobId: expect.any(String) }),
    );
  });

  it("skips a disabled endpoint entirely", async () => {
    const d = deps({ endpoints: [endpoint({ isEnabled: false })] });
    await enqueueWebhooksForCall(call(), [], asDeps(d));
    expect(d.webhookOutboxRepo.create).not.toHaveBeenCalled();
  });

  it("skips an endpoint not subscribed to this event type", async () => {
    const d = deps({ endpoints: [endpoint({ eventTypes: ["call_initiation_failure"] })] });
    await enqueueWebhooksForCall(call({ status: "COMPLETED" }), [], asDeps(d)); // -> post_call_transcription
    expect(d.webhookOutboxRepo.create).not.toHaveBeenCalled();
  });

  it("creates a separate outbox row per subscribed endpoint, not colliding on idempotency key", async () => {
    const d = deps({ endpoints: [endpoint({ id: "endpoint-a" }), endpoint({ id: "endpoint-b" })] });
    await enqueueWebhooksForCall(call(), [], asDeps(d));

    expect(d.webhookOutboxRepo.create).toHaveBeenCalledTimes(2);
    expect(d.webhookDispatcherQueue.add).toHaveBeenCalledTimes(2);
    const keys = d.webhookOutboxRepo.create.mock.calls.map((c: [{ idempotencyKey: string }]) => c[0].idempotencyKey);
    expect(new Set(keys).size).toBe(2); // distinct — one per endpoint
  });

  it("does not double-enqueue a dispatch job when the outbox row already existed (idempotent replay)", async () => {
    const d = deps();
    await enqueueWebhooksForCall(call(), [], asDeps(d));
    await enqueueWebhooksForCall(call(), [], asDeps(d)); // simulates a retried/duplicate call

    expect(d.webhookOutboxRepo.create).toHaveBeenCalledTimes(2);
    expect(d.webhookDispatcherQueue.add).toHaveBeenCalledTimes(1); // second create() returned inserted:false
  });
});
