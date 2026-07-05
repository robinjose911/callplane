import { createLocalDiskAdapter } from "./local-disk-adapter.js";
import { createAzureBlobAdapterFromConnectionString } from "./azure-blob-adapter.js";
import type { StorageAdapter } from "./storage-adapter.js";

/**
 * Single selection point for which `StorageAdapter` a running process uses — mirrors
 * `buildCallRunner`'s "one factory, read env, construct the right implementation" shape, so
 * `apps/api` and `apps/worker` don't each need their own if/else over `STORAGE_ADAPTER`.
 *
 * `STORAGE_ADAPTER` is infra wiring (which backend recordings live in), not a per-agent tunable —
 * consistent with D6 (config-over-env is for things a *user* would want to tune per-agent; this
 * is a deployment-level choice, like `DATABASE_URL`).
 */
export function buildStorageAdapter(): StorageAdapter {
  const kind = process.env["STORAGE_ADAPTER"] ?? "local";

  if (kind === "azure-blob") {
    const connectionString = process.env["AZURE_STORAGE_CONNECTION_STRING"];
    const containerName = process.env["AZURE_STORAGE_CONTAINER"];
    if (!connectionString || !containerName) {
      throw new Error(
        "STORAGE_ADAPTER=azure-blob requires both AZURE_STORAGE_CONNECTION_STRING and AZURE_STORAGE_CONTAINER to be set.",
      );
    }
    return createAzureBlobAdapterFromConnectionString(connectionString, containerName);
  }

  if (kind !== "local") {
    throw new Error(`Unknown STORAGE_ADAPTER "${kind}" — expected "local" or "azure-blob".`);
  }

  return createLocalDiskAdapter(process.env["RECORDINGS_DIR"] ?? "./data/recordings");
}
