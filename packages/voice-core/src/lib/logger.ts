import pino from "pino";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

/**
 * Shared Pino logger for all callplane services.
 *
 * Environment variables:
 *   SERVICE_NAME   — Sets the `service` field on every log line (e.g. "callplane-api")
 *   LOG_LEVEL      — Override log level (default: "debug" in dev, "warn" in prod)
 *   LOG_PRETTY     — Set to "true" for human-readable output in local dev
 *   AGENT_LOG_FILE — File path for agent child-process logs (default: /tmp/callplane-agent.log)
 *
 * Child process logging:
 *   LiveKit's job workers fork() child processes whose stdout is piped and never read by
 *   anyone — logs written to stdout there vanish silently. Child processes instead write
 *   synchronously to AGENT_LOG_FILE via pino.destination({ sync: true }), so every line is
 *   flushed to disk immediately even if the process crashes before exit handlers run.
 */

const isProduction = process.env["NODE_ENV"] === "production";
const isPretty = process.env["LOG_PRETTY"] === "true";

/** Defined only in IPC-connected child processes (LiveKit's fork()ed job workers). */
const isChildProcess = typeof process.send === "function";

const AGENT_LOG_FILE = process.env["AGENT_LOG_FILE"] ?? "/tmp/callplane-agent.log";

const pinoOptions: pino.LoggerOptions = {
  level: process.env["LOG_LEVEL"] ?? (isProduction ? "warn" : "debug"),
  base: {
    service: process.env["SERVICE_NAME"] ?? "callplane",
    env: process.env["NODE_ENV"] ?? "development",
  },
  timestamp: pino.stdTimeFunctions.isoTime,
};

function buildParentTransport(): pino.TransportSingleOptions | undefined {
  if (isPretty) {
    return {
      target: "pino-pretty",
      options: {
        colorize: true,
        translateTime: "SYS:HH:MM:ss",
        ignore: "pid,hostname",
      },
    };
  }
  return undefined;
}

function buildLogger(): pino.Logger {
  if (isChildProcess) {
    mkdirSync(dirname(AGENT_LOG_FILE), { recursive: true });
    const dest = pino.destination({ dest: AGENT_LOG_FILE, append: true, sync: true });
    return pino(pinoOptions, dest);
  }

  const transport = buildParentTransport();
  return pino(pinoOptions, transport ? pino.transport(transport) : undefined);
}

export const logger = buildLogger();

/** Log file path used by agent child processes — exported for startup banners. */
export const agentLogFile = isChildProcess ? AGENT_LOG_FILE : undefined;

/** Resolved agent log file path — always defined regardless of process context. */
export const AGENT_LOG_FILE_PATH = AGENT_LOG_FILE;

/** Flush all buffered log records to their transports. */
export function flushLogger(): void {
  logger.flush();
}

/**
 * Create a child logger with additional bound context fields.
 *
 * @example
 * const workerLogger = createChildLogger({ worker: "callExecutor" });
 * workerLogger.info({ callSid }, "Processing call job");
 */
export function createChildLogger(
  context: Record<string, string | number | boolean>,
): pino.Logger {
  return logger.child(context);
}

export type Logger = pino.Logger;
