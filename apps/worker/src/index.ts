import "./bootstrap.js";
import { createHealthApp } from "./health-app.js";
import { logger } from "@callplane/voice-core";
import { startCallExecutorWorker } from "./workers/call-executor.worker.js";

const healthPort = Number(process.env["WORKER_HEALTH_PORT"] ?? 4301);

const healthApp = createHealthApp();

healthApp.listen(healthPort, () => {
  logger.info({ healthPort }, "callplane worker health endpoint listening");
});

const callExecutorWorker = startCallExecutorWorker();
callExecutorWorker.on("failed", (job, error) => {
  logger.error({ callSid: job?.data?.callSid, err: error }, "call-executor job failed");
});
logger.info("call-executor worker started");
