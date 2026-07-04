import { Queue, Worker, type Processor, type WorkerOptions } from "bullmq";
import { Redis } from "ioredis";

/**
 * Every callplane BullMQ Queue/Worker MUST be created through these factories — never call
 * `new Queue(...)`/`new Worker(...)` directly. Redis is shared with another local service locally,
 * whose queues (`call-executor`, `webhook-dispatcher`) are unprefixed; without this hard-coded
 * prefix the two workers would steal each other's jobs on the same Redis instance. A convention
 * test (tests/no-raw-bullmq.test.ts) greps apps/ and packages/ for raw `new Queue(`/`new Worker(`
 * outside this file to enforce it.
 */
export const QUEUE_PREFIX = "callplane";

let sharedConnection: Redis | undefined;

function getConnection(): Redis {
  sharedConnection ??= new Redis(process.env["REDIS_URL"] ?? "redis://localhost:6379", {
    maxRetriesPerRequest: null,
  });
  return sharedConnection;
}

/** The same shared ioredis connection BullMQ uses — for non-queue Redis usage (e.g. trunk slot accounting) that shouldn't open a second connection. */
export function getSharedRedisConnection(): Redis {
  return getConnection();
}

export function createQueue<DataType, ResultType = unknown, NameType extends string = string>(
  name: string,
): Queue<DataType, ResultType, NameType> {
  return new Queue<DataType, ResultType, NameType>(name, {
    connection: getConnection(),
    prefix: QUEUE_PREFIX,
  });
}

export function createWorker<DataType, ResultType = unknown, NameType extends string = string>(
  name: string,
  processor: Processor<DataType, ResultType, NameType>,
  opts: Partial<WorkerOptions> = {},
): Worker<DataType, ResultType, NameType> {
  return new Worker<DataType, ResultType, NameType>(name, processor, {
    concurrency: 10,
    ...opts,
    connection: getConnection(),
    prefix: QUEUE_PREFIX,
  });
}
