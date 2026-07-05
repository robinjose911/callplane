import { afterEach, describe, expect, it } from "vitest";
import { buildStorageAdapter } from "../lib/build-storage-adapter.js";

const ENV_KEYS = ["STORAGE_ADAPTER", "AZURE_STORAGE_CONNECTION_STRING", "AZURE_STORAGE_CONTAINER", "RECORDINGS_DIR"] as const;
const originalEnv: Record<string, string | undefined> = {};
for (const key of ENV_KEYS) originalEnv[key] = process.env[key];

describe("buildStorageAdapter", () => {
  afterEach(() => {
    for (const key of ENV_KEYS) {
      if (originalEnv[key] === undefined) delete process.env[key];
      else process.env[key] = originalEnv[key];
    }
  });

  it("defaults to a LocalDiskAdapter when STORAGE_ADAPTER is unset", () => {
    delete process.env["STORAGE_ADAPTER"];
    const adapter = buildStorageAdapter();
    expect(adapter).toBeDefined();
    expect(typeof adapter.put).toBe("function");
  });

  it("builds an Azure Blob adapter when STORAGE_ADAPTER=azure-blob and both env vars are set", () => {
    process.env["STORAGE_ADAPTER"] = "azure-blob";
    process.env["AZURE_STORAGE_CONNECTION_STRING"] =
      "DefaultEndpointsProtocol=https;AccountName=test;AccountKey=dGVzdA==;EndpointSuffix=core.windows.net";
    process.env["AZURE_STORAGE_CONTAINER"] = "recordings";

    const adapter = buildStorageAdapter();
    expect(adapter).toBeDefined();
    expect(typeof adapter.getStream).toBe("function");
  });

  it("throws a clear error when STORAGE_ADAPTER=azure-blob but the connection string is missing", () => {
    process.env["STORAGE_ADAPTER"] = "azure-blob";
    delete process.env["AZURE_STORAGE_CONNECTION_STRING"];
    process.env["AZURE_STORAGE_CONTAINER"] = "recordings";

    expect(() => buildStorageAdapter()).toThrow(/AZURE_STORAGE_CONNECTION_STRING/);
  });

  it("throws a clear error when STORAGE_ADAPTER=azure-blob but the container name is missing", () => {
    process.env["STORAGE_ADAPTER"] = "azure-blob";
    process.env["AZURE_STORAGE_CONNECTION_STRING"] =
      "DefaultEndpointsProtocol=https;AccountName=test;AccountKey=dGVzdA==;EndpointSuffix=core.windows.net";
    delete process.env["AZURE_STORAGE_CONTAINER"];

    expect(() => buildStorageAdapter()).toThrow(/AZURE_STORAGE_CONTAINER/);
  });

  it("throws a clear error for an unknown STORAGE_ADAPTER value, instead of silently falling back to local", () => {
    process.env["STORAGE_ADAPTER"] = "s3";
    expect(() => buildStorageAdapter()).toThrow(/Unknown STORAGE_ADAPTER/);
  });
});
