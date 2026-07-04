import { describe, expect, it, vi } from "vitest";
import type { Call } from "@callplane/database";
import { buildCallStreamSnapshot, type CallStreamState } from "../lib/call-stream-snapshot.js";

function call(overrides: Partial<Call> = {}): Call {
  return {
    id: "row-1",
    callSid: "call-1",
    agentId: "demo-cascade",
    channel: "sip",
    toNumber: null,
    status: "IN_PROGRESS",
    scenario: "demo_greeting",
    dynamicVariables: null,
    idempotencyKey: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as Call;
}

function delivery(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "delivery-1",
    callSid: "call-1",
    webhookEndpointId: "endpoint-1",
    eventType: "post_call_transcription",
    status: "PENDING",
    retryCount: 0,
    maxRetries: 10,
    nextRetryAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function deps(overrides: { call?: Call | null; deliveries?: { status: string }[]; recording?: unknown } = {}) {
  return {
    callRepo: { findBySid: vi.fn().mockResolvedValue(overrides.call !== undefined ? overrides.call : call()) },
    callEventRepo: { findBySid: vi.fn().mockResolvedValue([]) },
    callCostRepo: { findByCallSid: vi.fn().mockResolvedValue([]) },
    webhookOutboxRepo: {
      findByCallSid: vi.fn().mockResolvedValue((overrides.deliveries ?? []).map((d) => delivery(d))),
    },
    recordingRepo: { findByCallSid: vi.fn().mockResolvedValue(overrides.recording ?? null) },
  } as never;
}

function freshState(): CallStreamState {
  return { noDeliveriesGraceTicks: 0 };
}

describe("buildCallStreamSnapshot", () => {
  it("returns undefined when the call no longer exists", async () => {
    const result = await buildCallStreamSnapshot("call-1", deps({ call: null }), freshState());
    expect(result).toBeUndefined();
  });

  it("does not stop for a non-terminal call regardless of deliveries", async () => {
    const result = await buildCallStreamSnapshot("call-1", deps({ call: call({ status: "IN_PROGRESS" }) }), freshState());
    expect(result?.shouldStop).toBe(false);
  });

  it("stops once terminal with all deliveries settled", async () => {
    const result = await buildCallStreamSnapshot(
      "call-1",
      deps({ call: call({ status: "COMPLETED" }), deliveries: [{ status: "DELIVERED" }] }),
      freshState(),
    );
    expect(result?.shouldStop).toBe(true);
  });

  it("embeds `final: shouldStop` in the snapshot payload itself, for the client's EventSource to read", async () => {
    const result = await buildCallStreamSnapshot(
      "call-1",
      deps({ call: call({ status: "COMPLETED" }), deliveries: [{ status: "DELIVERED" }] }),
      freshState(),
    );
    expect((result?.snapshot as { final: boolean }).final).toBe(true);

    const stillOpen = await buildCallStreamSnapshot("call-1", deps({ call: call({ status: "IN_PROGRESS" }) }), freshState());
    expect((stillOpen?.snapshot as { final: boolean }).final).toBe(false);
  });

  it("does not stop immediately for a terminal call with zero deliveries yet (vacuous-truth guard)", async () => {
    const result = await buildCallStreamSnapshot("call-1", deps({ call: call({ status: "COMPLETED" }), deliveries: [] }), freshState());
    expect(result?.shouldStop).toBe(false);
  });

  it("stops a terminal, zero-delivery call once the grace period is exhausted", async () => {
    const state = freshState();
    const d = deps({ call: call({ status: "COMPLETED" }), deliveries: [] });
    let last;
    for (let i = 0; i < 10; i++) {
      last = await buildCallStreamSnapshot("call-1", d, state);
    }
    expect(last?.shouldStop).toBe(true);
  });

  it("resets the grace counter once a delivery row appears", async () => {
    const state = freshState();
    await buildCallStreamSnapshot("call-1", deps({ call: call({ status: "COMPLETED" }), deliveries: [] }), state);
    expect(state.noDeliveriesGraceTicks).toBe(1);
    await buildCallStreamSnapshot("call-1", deps({ call: call({ status: "COMPLETED" }), deliveries: [{ status: "PENDING" }] }), state);
    expect(state.noDeliveriesGraceTicks).toBe(0);
  });
});
