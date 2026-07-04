import { createReadStream } from "node:fs";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import type { Readable } from "node:stream";
import type { StorageAdapter } from "./storage-adapter.js";

/**
 * The v1 `StorageAdapter` — writes recordings under a local directory (`RECORDINGS_DIR`,
 * default `./data/recordings`). `key` is joined onto the base dir; callers control the key
 * shape (e.g. `<callSid>.wav`) so this adapter has no opinion about naming.
 */
export function createLocalDiskAdapter(baseDir = "./data/recordings"): StorageAdapter {
  const resolvedBaseDir = resolve(baseDir);

  return {
    async put(key, data) {
      const filePath = join(resolvedBaseDir, key);
      await mkdir(dirname(filePath), { recursive: true });
      await writeFile(filePath, data);
      return filePath;
    },

    async getStream(storagePath): Promise<Readable> {
      return createReadStream(storagePath);
    },

    async delete(storagePath): Promise<void> {
      await unlink(storagePath).catch(() => {});
    },
  };
}
