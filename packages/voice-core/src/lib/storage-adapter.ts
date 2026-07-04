import type { Readable } from "node:stream";

/**
 * Storage backend for call recordings. `LocalDiskAdapter` is the only implementation that ships
 * in v1 (CLAUDE.md: cloud Egress + Azure Blob are post-v1, Stage 11) — this interface exists so
 * a future adapter is a drop-in, not a rewrite.
 */
export interface StorageAdapter {
  /** Writes `data` under `key`, returning the adapter-specific storage path/reference to persist. */
  put(key: string, data: Buffer): Promise<string>;
  /** Opens a readable stream for a previously-`put` storage path. */
  getStream(storagePath: string): Promise<Readable>;
  /** Best-effort delete — callers shouldn't rely on this throwing for a missing file. */
  delete(storagePath: string): Promise<void>;
}
