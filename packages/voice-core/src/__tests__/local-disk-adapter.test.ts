import { afterAll, describe, expect, it } from "vitest";
import { rm } from "node:fs/promises";
import { createLocalDiskAdapter } from "../lib/local-disk-adapter.js";

const TEST_DIR = "./.tmp-local-disk-adapter-test";

afterAll(async () => {
  await rm(TEST_DIR, { recursive: true, force: true });
});

describe("createLocalDiskAdapter", () => {
  it("round-trips a put file through getStream", async () => {
    const adapter = createLocalDiskAdapter(TEST_DIR);
    const data = Buffer.from("hello world");

    const storagePath = await adapter.put("greeting.txt", data);
    const stream = await adapter.getStream(storagePath);

    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(chunk as Buffer);
    expect(Buffer.concat(chunks).toString()).toBe("hello world");
  });

  it("creates intermediate directories for a nested key", async () => {
    const adapter = createLocalDiskAdapter(TEST_DIR);
    const storagePath = await adapter.put("nested/dir/file.wav", Buffer.from("x"));
    const stream = await adapter.getStream(storagePath);
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(chunk as Buffer);
    expect(Buffer.concat(chunks).toString()).toBe("x");
  });

  it("delete() does not throw for a file that doesn't exist", async () => {
    const adapter = createLocalDiskAdapter(TEST_DIR);
    await expect(adapter.delete(`${TEST_DIR}/does-not-exist.wav`)).resolves.toBeUndefined();
  });

  it("delete() removes a file previously put", async () => {
    const adapter = createLocalDiskAdapter(TEST_DIR);
    const storagePath = await adapter.put("to-delete.wav", Buffer.from("x"));
    await adapter.delete(storagePath);

    const stream = await adapter.getStream(storagePath);
    // Draining the stream is enough to trigger the underlying ENOENT.
    await expect(
      new Promise((_resolve, reject) => {
        stream.on("data", () => {});
        stream.on("error", reject);
        stream.on("end", () => _resolve(undefined));
      }),
    ).rejects.toThrow();
  });
});
