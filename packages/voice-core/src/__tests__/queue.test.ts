import { describe, expect, it, vi } from "vitest";

const queueConstructor = vi.fn();
const workerConstructor = vi.fn();

vi.mock("bullmq", () => ({
  Queue: vi.fn().mockImplementation(function (this: unknown, ...args: unknown[]) {
    queueConstructor(...args);
  }),
  Worker: vi.fn().mockImplementation(function (this: unknown, ...args: unknown[]) {
    workerConstructor(...args);
  }),
}));

vi.mock("ioredis", () => ({
  Redis: vi.fn().mockImplementation(() => ({})),
}));

const { createQueue, createWorker, QUEUE_PREFIX } = await import("../lib/queue.js");

describe("queue factory", () => {
  it("QUEUE_PREFIX is 'callplane'", () => {
    expect(QUEUE_PREFIX).toBe("callplane");
  });

  it("createQueue always passes prefix: 'callplane'", () => {
    createQueue("call-executor");

    expect(queueConstructor).toHaveBeenCalledWith(
      "call-executor",
      expect.objectContaining({ prefix: "callplane" }),
    );
  });

  it("createWorker always passes prefix: 'callplane' and defaults concurrency to 10", () => {
    createWorker("call-executor", async () => undefined);

    expect(workerConstructor).toHaveBeenCalledWith(
      "call-executor",
      expect.any(Function),
      expect.objectContaining({ prefix: "callplane", concurrency: 10 }),
    );
  });

  it("createWorker lets callers override concurrency but not prefix", () => {
    createWorker("call-executor", async () => undefined, { concurrency: 3 });

    const [, , opts] = workerConstructor.mock.calls.at(-1) as [unknown, unknown, Record<string, unknown>];
    expect(opts["concurrency"]).toBe(3);
    expect(opts["prefix"]).toBe("callplane");
  });
});
