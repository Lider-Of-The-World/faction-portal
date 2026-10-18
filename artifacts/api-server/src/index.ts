import app from "./app";
import { logger } from "./lib/logger";
import { db, pool } from "@workspace/db";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateProductionEnvironment } from "./lib/objectStorage";

const MIGRATION_ADVISORY_LOCK_KEY = 78061803;

async function applyPendingMigrations(): Promise<void> {
  const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));
  const migrationsFolder = [
    path.resolve(moduleDirectory, "../../../lib/db/migrations"),
    path.resolve(process.cwd(), "lib/db/migrations"),
    path.resolve(process.cwd(), "../../lib/db/migrations"),
  ].find(existsSync);

  if (!migrationsFolder) {
    throw new Error("Database migration files could not be found.");
  }

  const lockConnection = await pool.connect();
  let acquired = false;
  let discardConnection = false;
  try {
    await lockConnection.query("SELECT pg_advisory_lock($1)", [
      MIGRATION_ADVISORY_LOCK_KEY,
    ]);
    acquired = true;
    logger.info("Applying pending database migrations");
    await migrate(db, { migrationsFolder });
    logger.info("Database migrations are up to date");
  } finally {
    if (acquired) {
      try {
        await lockConnection.query("SELECT pg_advisory_unlock($1)", [
          MIGRATION_ADVISORY_LOCK_KEY,
        ]);
      } catch (error) {
        discardConnection = true;
        logger.error({ err: error }, "Could not release the database migration lock");
      }
    }
    lockConnection.release(discardConnection);
  }
}

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

await applyPendingMigrations();

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
