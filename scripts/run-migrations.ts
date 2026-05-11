import { pool, runMigrations } from "../lib/db-mysql-pool";

async function main() {
  await runMigrations();
  await pool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
