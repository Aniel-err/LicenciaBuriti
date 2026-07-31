import { app } from "./app.js";
import { config } from "./config.js";
import { logger } from "./security/logger.js";
import { sweepNotifications } from "./notifications/sweep.js";

const server = app.listen(config.port, () => {
  logger.info({ port: config.port, action: "SERVER_START" }, "api_started");
});

const runSweep = () => {
  void sweepNotifications().catch((error) => {
    logger.error({
      action: "NOTIFICATION_SWEEP_FAILED",
      error: error instanceof Error ? error.message : "Falha desconhecida"
    }, "notification_sweep_failed");
  });
};

const initialSweep = setTimeout(runSweep, 10_000);
const sweepInterval = setInterval(runSweep, config.notificationSweepMinutes * 60_000);
initialSweep.unref();
sweepInterval.unref();

server.on("close", () => {
  clearTimeout(initialSweep);
  clearInterval(sweepInterval);
});
