import "./bootstrap.js";
import { createHealthApp } from "./health-app.js";
import { createChildLogger } from "@callplane/voice-core";

const log = createChildLogger({ service: "worker" });
const healthPort = Number(process.env["WORKER_HEALTH_PORT"] ?? 4301);

const healthApp = createHealthApp();

healthApp.listen(healthPort, () => {
  log.info({ healthPort }, "callplane worker health endpoint listening");
});
