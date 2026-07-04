import "./bootstrap.js";
import { createApp } from "./app.js";
import { logger } from "@callplane/voice-core";

const port = Number(process.env["PORT"] ?? 4300);

const app = createApp();

app.listen(port, () => {
  logger.info({ port }, "callplane api listening");
});
