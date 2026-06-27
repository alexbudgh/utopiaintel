import { pool, initDb, baselineMigrations } from "../lib/db-mysql-pool";

async function main() {
  await initDb();
  await baselineMigrations();
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
