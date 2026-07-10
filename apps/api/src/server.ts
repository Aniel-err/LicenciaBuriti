import { app } from "./app.js";
import { config } from "./config.js";
import { logger } from "./security/logger.js";

app.listen(config.port, () => {
  logger.info({ port: config.port, action: "SERVER_START" }, "api_started");
});
