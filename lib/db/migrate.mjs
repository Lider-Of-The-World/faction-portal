import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import path from "node:path";
import { fileURLToPath } from "node:url";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("DATABASE_URL is required to run database migrations.");
  process.exit(1);
}

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const pool = new pg.Pool({ connectionString: databaseUrl });

try {
  await migrate(drizzle(pool), {
    migrationsFolder: path.join(currentDir, "migrations"),
  });
  console.log("Database migrations applied successfully.");
} catch (error) {
  console.error("Database migrations failed:");
  console.error(error);
  process.exitCode = 1;
} finally {
  await pool.end();
}
