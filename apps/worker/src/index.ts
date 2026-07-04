import "./bootstrap.js";
import { createHealthApp } from "./health-app.js";
import { logger } from "@callplane/voice-core";

const healthPort = Number(process.env["WORKER_HEALTH_PORT"] ?? 4301);

const healthApp = createHealthApp();

healthApp.listen(healthPort, () => {
  logger.info({ healthPort }, "callplane worker health endpoint listening");
});
