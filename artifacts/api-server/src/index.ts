import app from "./app";
import { logger } from "./lib/logger";
import { pool } from "@workspace/db";
import { validateProductionEnvironment } from "./lib/objectStorage";

if (process.env.NODE_ENV === "production") {
  const missing = validateProductionEnvironment();
  if (missing.length) {
    throw new Error(
      `Production environment is missing required configuration: ${missing.join(", ")}.`,
    );
  }
}

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const server = app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
});

function shutdown(signal: string): void {
  logger.info({ signal }, "Graceful shutdown started");
  const forceExit = setTimeout(() => {
    logger.error("Graceful shutdown timed out");
    process.exit(1);
  }, 10_000);
  forceExit.unref();

  server.close(() => {
    void pool.end().finally(() => {
      clearTimeout(forceExit);
      process.exit(0);
    });
  });
}

process.once("SIGTERM", () => shutdown("SIGTERM"));
process.once("SIGINT", () => shutdown("SIGINT"));
