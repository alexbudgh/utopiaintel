// Wipes all game data at the start of a new Utopia age. Utopia regenerates
// the entire kingdom map each age, so every stored table — including the
// ones with no TTL (provinces, key_kingdom_bindings, intel_partitions) —
// refers to a map that no longer exists. `schema_migrations` is left alone.
//
// Defaults to a dry run that only prints row counts. Pass --yes to actually
// truncate.
import type { RowDataPacket } from "mysql2/promise";
import { pool } from "../lib/db-mysql-pool";

interface TableNameRow extends RowDataPacket {
  name: string;
}

interface CountRow extends RowDataPacket {
  n: number;
}

async function getDataTables(): Promise<string[]> {
  const [rows] = await pool.query<TableNameRow[]>(
    `SELECT table_name AS name FROM information_schema.tables
     WHERE table_schema = DATABASE() AND table_name != 'schema_migrations'
     ORDER BY table_name`,
  );
  return rows.map((r) => r.name);
}

async function countRows(table: string): Promise<number> {
  const [rows] = await pool.query<CountRow[]>(
    `SELECT COUNT(*) AS n FROM \`${table}\``,
  );
  return Number(rows[0].n);
}

async function main() {
  const apply = process.argv.includes("--yes");
  const database = process.env.DB_NAME ?? "utopiaintel";
  const host = process.env.DB_HOST ?? "localhost";

  const tables = await getDataTables();
  const counts = await Promise.all(tables.map(countRows));
  const total = counts.reduce((a, b) => a + b, 0);

  console.log(`Target: ${host}/${database}`);
  console.log("");
  for (let i = 0; i < tables.length; i++) {
    console.log(`  ${tables[i].padEnd(28)} ${counts[i]}`);
  }
  console.log(`  ${"TOTAL".padEnd(28)} ${total}`);
  console.log("");

  if (!apply) {
    console.log(
      "Dry run — no changes made. Re-run with --yes to truncate all tables above.",
    );
    await pool.end();
    return;
  }

  console.log(`Truncating ${tables.length} table(s) in ${database}...`);
  await pool.query("SET FOREIGN_KEY_CHECKS = 0");
  try {
    for (const table of tables) {
      await pool.query(`TRUNCATE TABLE \`${table}\``);
    }
  } finally {
    await pool.query("SET FOREIGN_KEY_CHECKS = 1");
  }
  console.log("Done.");
  await pool.end();
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`Failed to reset age DB: ${message}`);
  process.exit(1);
});
