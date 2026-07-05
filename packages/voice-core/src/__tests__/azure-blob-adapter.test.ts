import { describe, expect, it, vi } from "vitest";
import { Readable } from "node:stream";
import type { ContainerClient } from "@azure/storage-blob";
import { createAzureBlobAdapter } from "../lib/azure-blob-adapter.js";

function fakeContainerClient(overrides: { downloadBody?: Readable | undefined } = {}) {
  const uploadData = vi.fn().mockResolvedValue(undefined);
  const download = vi.fn().mockResolvedValue({ readableStreamBody: overrides.downloadBody });
  const deleteIfExists = vi.fn().mockResolvedValue(undefined);

  const blockBlobClient = { uploadData, download, deleteIfExists };
  const getBlockBlobClient = vi.fn().mockReturnValue(blockBlobClient);

  return {
    containerClient: { getBlockBlobClient } as unknown as ContainerClient,
    getBlockBlobClient,
    uploadData,
    download,
    deleteIfExists,
  };
}

describe("createAzureBlobAdapter", () => {
  it("put() uploads the buffer under the given key and returns the key as storagePath", async () => {
    const { containerClient, getBlockBlobClient, uploadData } = fakeContainerClient();
    const adapter = createAzureBlobAdapter(containerClient);

    const data = Buffer.from("hello");
    const storagePath = await adapter.put("call-1.wav", data);

    expect(getBlockBlobClient).toHaveBeenCalledWith("call-1.wav");
    expect(uploadData).toHaveBeenCalledWith(data);
    expect(storagePath).toBe("call-1.wav");
  });

  it("getStream() returns the blob's readable body", async () => {
    const body = Readable.from([Buffer.from("audio bytes")]);
    const { containerClient, getBlockBlobClient, download } = fakeContainerClient({ downloadBody: body });
    const adapter = createAzureBlobAdapter(containerClient);

    const stream = await adapter.getStream("call-1.wav");

    expect(getBlockBlobClient).toHaveBeenCalledWith("call-1.wav");
    expect(download).toHaveBeenCalled();
    expect(stream).toBe(body);
  });

  it("getStream() throws a clear error when Azure returns no body", async () => {
    const { containerClient } = fakeContainerClient({ downloadBody: undefined });
    const adapter = createAzureBlobAdapter(containerClient);

    await expect(adapter.getStream("missing.wav")).rejects.toThrow(/no readable body/);
  });

  it("delete() calls deleteIfExists rather than a plain delete (safe for an already-missing blob)", async () => {
    const { containerClient, getBlockBlobClient, deleteIfExists } = fakeContainerClient();
    const adapter = createAzureBlobAdapter(containerClient);

    await adapter.delete("call-1.wav");

    expect(getBlockBlobClient).toHaveBeenCalledWith("call-1.wav");
    expect(deleteIfExists).toHaveBeenCalled();
  });
});
