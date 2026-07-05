import { BlobServiceClient, type ContainerClient } from "@azure/storage-blob";
import type { Readable } from "node:stream";
import type { StorageAdapter } from "./storage-adapter.js";

/**
 * The cloud `StorageAdapter` promised by `storage-adapter.ts`'s own doc comment — a drop-in for
 * `LocalDiskAdapter` once a deployment needs recordings to survive past a single machine/container.
 * Takes an already-constructed `ContainerClient` rather than building one from a connection string
 * internally, so unit tests can pass a mocked client without needing a real Azure Storage account
 * (matching this repo's convention of unit-testing provider integrations against a mocked SDK
 * client, established for the AI provider factories in Stage 3).
 */
export function createAzureBlobAdapter(containerClient: ContainerClient): StorageAdapter {
  return {
    async put(key, data) {
      const blockBlobClient = containerClient.getBlockBlobClient(key);
      await blockBlobClient.uploadData(data);
      // The blob name is sufficient to re-locate it later — the container is fixed for the
      // lifetime of this adapter instance, unlike LocalDiskAdapter's storagePath which is a full
      // filesystem path because there's no separate "which container" concept to fix in advance.
      return key;
    },

    async getStream(storagePath): Promise<Readable> {
      const blockBlobClient = containerClient.getBlockBlobClient(storagePath);
      const response = await blockBlobClient.download();
      if (!response.readableStreamBody) {
        throw new Error(`Azure Blob download for "${storagePath}" returned no readable body`);
      }
      return response.readableStreamBody as Readable;
    },

    async delete(storagePath): Promise<void> {
      const blockBlobClient = containerClient.getBlockBlobClient(storagePath);
      await blockBlobClient.deleteIfExists();
    },
  };
}

/**
 * Convenience constructor for real deployments — builds the `ContainerClient` from a connection
 * string (the same "one secret, from env, never hardcoded" pattern as every other real-provider
 * credential in this repo). Not used by unit tests, which construct `createAzureBlobAdapter`
 * directly with a mock.
 */
export function createAzureBlobAdapterFromConnectionString(connectionString: string, containerName: string): StorageAdapter {
  const serviceClient = BlobServiceClient.fromConnectionString(connectionString);
  const containerClient = serviceClient.getContainerClient(containerName);
  return createAzureBlobAdapter(containerClient);
}
