import mysql from "mysql2/promise";
import fs from "fs";
import path from "path";

export const pool = mysql.createPool({
  host: process.env.DB_HOST ?? "localhost",
  port: Number(process.env.DB_PORT ?? 3306),
  user: process.env.DB_USER ?? "utopiaintel",
  password: process.env.DB_PASSWORD ?? "",
  database: process.env.DB_NAME ?? "utopiaintel",
  waitForConnections: true,
  connectionLimit: 10,
  charset: "utf8mb4",
  // Return DATETIME columns as "YYYY-MM-DD HH:MM:SS" strings (not Date objects)
  dateStrings: true,
  // Return DECIMAL/NUMERIC as JS numbers
  decimalNumbers: true,
  // Interpret stored timestamps as UTC
  timezone: "+00:00",
});

let _ready: Promise<void> | null = null;

export function ensureReady(): Promise<void> {
  if (!_ready) _ready = initDb();
  return _ready;
}

export async function initDb(): Promise<void> {
  await runMigrations();
  // Best-effort: raise group_concat limit for long spell/army lists
  try {
    await pool.query("SET GLOBAL group_concat_max_len = 65536");
  } catch {
    // May not have SUPER privilege; ignore
  }
}

async function ensureMigrationsTable(): Promise<void> {
  await pool.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    id VARCHAR(128) NOT NULL PRIMARY KEY,
    applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
}

function getMigrationFiles(): string[] {
  const migrationsDir = path.join(process.cwd(), "migrations");
  try {
    return fs
      .readdirSync(migrationsDir)
      .filter((f) => f.endsWith(".sql"))
      .sort();
  } catch {
    console.error(
      `[migrations] No migrations directory found at ${migrationsDir}`,
    );
    return [];
  }
}

export async function runMigrations(): Promise<void> {
  await ensureMigrationsTable();

  const [rows] = await pool.query<any[]>("SELECT id FROM schema_migrations");
  const applied = new Set((rows as any[]).map((r) => r.id as string));

  const files = getMigrationFiles();
  let count = 0;
  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = fs.readFileSync(
      path.join(process.cwd(), "migrations", file),
      "utf8",
    );
    const stmts = sql
      .split(";")
      .map((s) => s.trim())
      .filter(Boolean);
    for (const stmt of stmts) {
      await pool.query(stmt);
    }
    await pool.query("INSERT INTO schema_migrations (id) VALUES (?)", [file]);
    console.log(`[migrations] Applied ${file}`);
    count++;
  }
  console.log(
    `[migrations] Done — ${count} migration(s) applied, ${applied.size} already applied`,
  );
}
