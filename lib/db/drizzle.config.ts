import { defineConfig } from "drizzle-kit";
import path from "node:path";
import { fileURLToPath } from "node:url";

const currentDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  schema: path.join(currentDir, "./src/schema/index.ts"),
  out: "./migrations",
  dialect: "postgresql",
  dbCredentials: {
    // `generate` is offline; `migrate` requires DATABASE_URL at runtime.
    url: process.env.DATABASE_URL ?? "",
  },
});
