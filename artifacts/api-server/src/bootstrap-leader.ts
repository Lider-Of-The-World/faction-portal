import { stdout } from "node:process";
import { pool } from "@workspace/db";
import { logger } from "./lib/logger";
import {
  ensureInitialLeader,
  INITIAL_LEADER_NICKNAME,
  INITIAL_LEADER_PASSWORD,
} from "./initial-leader";

async function main(): Promise<void> {
  const created = await ensureInitialLeader();
  if (!created) {
    stdout.write("\nПервый лидер уже создан; база не изменена.\n\n");
    return;
  }
  stdout.write(
    `\nПервый аккаунт лидера: ${INITIAL_LEADER_NICKNAME}\nНачальный пароль: ${INITIAL_LEADER_PASSWORD}\nСмените его при первом входе.\n\n`,
  );
  logger.info("Initial faction leader setup checked");
}

main()
  .catch((error: unknown) => {
    logger.error({ err: error }, "Leader bootstrap failed");
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
