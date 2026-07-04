import "./bootstrap.js";
import { createApp } from "./app.js";
import { createChildLogger } from "@callplane/voice-core";

const log = createChildLogger({ service: "api" });
const port = Number(process.env["PORT"] ?? 4300);

const app = createApp();

app.listen(port, () => {
  log.info({ port }, "callplane api listening");
});
