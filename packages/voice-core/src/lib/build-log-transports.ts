import type pino from "pino";

/**
 * Builds the list of Pino transport targets for the *parent* process logger (never the
 * agent-child-process file transport in `logger.ts`, which has its own separate, simpler path —
 * LiveKit's fork()ed job workers need a plain synchronous file destination, not a multi-target
 * pipeline). Returns `undefined` when neither pretty-printing nor Axiom shipping is configured, so
 * `pino()` falls back to its own default (plain JSON to stdout).
 *
 * Pretty-print and Axiom shipping are independent, not mutually exclusive — pino's `targets` array
 * runs every configured target for every log line, so a developer can have both a legible local
 * terminal and a shipped copy in Axiom at the same time.
 */
export function buildLogTransports(env: NodeJS.ProcessEnv = process.env): pino.TransportMultiOptions | undefined {
  const targets: pino.TransportTargetOptions[] = [];

  if (env["LOG_PRETTY"] === "true") {
    targets.push({
      target: "pino-pretty",
      options: { colorize: true, translateTime: "SYS:HH:MM:ss", ignore: "pid,hostname" },
      level: "trace",
    });
  }

  const axiomToken = env["AXIOM_TOKEN"];
  const axiomDataset = env["AXIOM_DATASET"];
  if (axiomToken && axiomDataset) {
    targets.push({
      target: "@axiomhq/pino",
      options: { token: axiomToken, dataset: axiomDataset },
      level: "trace",
    });
  }

  if (targets.length === 0) return undefined;
  return { targets };
}
