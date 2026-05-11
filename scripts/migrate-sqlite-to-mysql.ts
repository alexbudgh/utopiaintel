#!/usr/bin/env tsx
/**
 * One-time migration: copy all data from SQLite intel.db into MySQL.
 *
 * Usage:
 *   INTEL_DB_PATH=/path/to/intel.db \
 *   DB_HOST=localhost DB_USER=utopiaintel DB_PASSWORD=... DB_NAME=utopiaintel \
 *   tsx scripts/migrate-sqlite-to-mysql.ts [--write-checkpoint=/tmp/checkpoint.json] [--tail-from=/tmp/checkpoint.json] [--resume-from-mysql-watermarks] [--delay-ms=25]
 *
 * The target MySQL database must already be schema-initialised (ensureReady()).
 * For cutover, run a full import from a SQLite snapshot with --write-checkpoint,
 * then pause SQLite writes and run --tail-from against the live SQLite DB before
 * switching the app to MySQL.
 */

import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import { pool, ensureReady } from "../lib/db-mysql-pool";
import type { PoolConnection, ResultSetHeader } from "mysql2/promise";

const SQLITE_PATH = process.env.INTEL_DB_PATH ?? path.join(process.cwd(), "intel.db");

const ID_TABLES = [
  "provinces",
  "province_overview",
  "total_military_points",
  "home_military_points",
  "province_troops",
  "province_resources",
  "province_status",
  "province_effects",
  "military_intel",
  "som_armies",
  "survey_intel",
  "survey_buildings",
  "sos_intel",
  "sos_sciences",
  "kingdom_intel",
  "kingdom_provinces",
  "kingdom_news",
  "kingdom_news_sharded",
  "rob_ops",
  "intel_ops",
  "sorcery_ops",
  "attack_ops",
] as const;

type IdTable = typeof ID_TABLES[number];
type Checkpoint = Record<string, number>;
type Options = {
  writeCheckpointPath: string | null;
  tailFromPath: string | null;
  resumeFromMysqlWatermarks: boolean;
  delayMs: number;
  batchSize: number;
};

function parseArgs(args: string[]): Options {
  const opts: Options = {
    writeCheckpointPath: null,
    tailFromPath: null,
    resumeFromMysqlWatermarks: false,
    delayMs: Number(process.env.MIGRATE_DELAY_MS ?? 0),
    batchSize: Number(process.env.MIGRATE_BATCH_SIZE ?? 200),
  };

  for (const arg of args) {
    if (arg.startsWith("--write-checkpoint=")) {
      opts.writeCheckpointPath = arg.slice("--write-checkpoint=".length);
    } else if (arg.startsWith("--tail-from=")) {
      opts.tailFromPath = arg.slice("--tail-from=".length);
    } else if (arg === "--resume-from-mysql-watermarks") {
      opts.resumeFromMysqlWatermarks = true;
    } else if (arg.startsWith("--delay-ms=")) {
      opts.delayMs = Number(arg.slice("--delay-ms=".length));
    } else if (arg.startsWith("--batch-size=")) {
      opts.batchSize = Number(arg.slice("--batch-size=".length));
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!Number.isFinite(opts.delayMs) || opts.delayMs < 0) {
    throw new Error("--delay-ms must be a non-negative number");
  }
  if (!Number.isFinite(opts.batchSize) || opts.batchSize < 1) {
    throw new Error("--batch-size must be a positive number");
  }
  const checkpointSources = [opts.tailFromPath, opts.resumeFromMysqlWatermarks].filter(Boolean);
  if (checkpointSources.length > 1) {
    throw new Error("--tail-from and --resume-from-mysql-watermarks are mutually exclusive");
  }

  opts.delayMs = Math.trunc(opts.delayMs);
  opts.batchSize = Math.trunc(opts.batchSize);
  return opts;
}

const options = parseArgs(process.argv.slice(2));
const BATCH = options.batchSize;
function readCheckpointFile(filePath: string): Checkpoint {
  const parsed = JSON.parse(fs.readFileSync(filePath, "utf8")) as Checkpoint | { tables: Checkpoint };
  if (
    parsed &&
    typeof parsed === "object" &&
    "tables" in parsed &&
    parsed.tables &&
    typeof parsed.tables === "object"
  ) {
    return parsed.tables;
  }
  return parsed as Checkpoint;
}

let checkpoint: Checkpoint | null = options.tailFromPath ? readCheckpointFile(options.tailFromPath) : null;

// ── helpers ──────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function throttle() {
  if (options.delayMs > 0) await sleep(options.delayMs);
}

function chunks<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function tailId(table: IdTable): number {
  return checkpoint?.[table] ?? 0;
}

function shouldInsertSourceRow(table: IdTable, id: number): boolean {
  return !checkpoint || id > tailId(table);
}

function selectRows<T>(sqlite: Database.Database, table: IdTable, orderBy = "id", tail = true): T[] {
  const minId = tail && checkpoint ? tailId(table) : 0;
  return sqlite.prepare(`SELECT * FROM ${table} WHERE id > ? ORDER BY ${orderBy}`).all(minId) as T[];
}

function captureCheckpoint(sqlite: Database.Database): Checkpoint {
  return Object.fromEntries(
    ID_TABLES.map((table) => {
      const row = sqlite.prepare(`SELECT COALESCE(MAX(id), 0) AS max_id FROM ${table}`).get() as { max_id: number };
      return [table, row.max_id];
    }),
  );
}

function writeCheckpoint(sqlite: Database.Database, filePath: string) {
  const data = {
    sqlite_path: SQLITE_PATH,
    captured_at: new Date().toISOString(),
    tables: captureCheckpoint(sqlite),
  };
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`);
}

async function batchInsert(
  conn: PoolConnection,
  table: string,
  cols: string[],
  rows: unknown[][],
): Promise<void> {
  if (!rows.length) return;
  const placeholders = `(${cols.map(() => "?").join(", ")})`;
  for (const chunk of chunks(rows, BATCH)) {
    const values = chunk.flat();
    const ph = chunk.map(() => placeholders).join(", ");
    await conn.query(`INSERT IGNORE INTO ${table} (${cols.join(", ")}) VALUES ${ph}`, values);
    await throttle();
  }
}

// Insert a single row and return the MySQL insertId (or resolve via SELECT on conflict).
async function insertOne(
  conn: PoolConnection,
  sql: string,
  params: unknown[],
  conflictSql: string,
  conflictParams: unknown[],
): Promise<number> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [res] = await conn.execute(sql, params as any) as [ResultSetHeader, unknown];
  if (res.insertId !== 0) return res.insertId;
  // Duplicate — find existing ID
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [rows] = await conn.execute(conflictSql, conflictParams as any) as [{ id: number }[], unknown];
  return rows[0].id;
}

async function resolveOne(
  conn: PoolConnection,
  sql: string,
  params: unknown[],
): Promise<number> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [rows] = await conn.execute(sql, params as any) as [{ id: number }[], unknown];
  if (!rows[0]) throw new Error(`Unable to resolve existing MySQL row for SQL: ${sql}`);
  return rows[0].id;
}

async function ensureWatermarkTable(conn: PoolConnection): Promise<void> {
  await conn.query(`
    CREATE TABLE IF NOT EXISTS sqlite_migration_watermarks (
      source_table VARCHAR(128) PRIMARY KEY,
      source_max_id BIGINT NOT NULL,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
  `);
}

async function readMysqlWatermarks(conn: PoolConnection): Promise<Checkpoint> {
  await ensureWatermarkTable(conn);
  const [rows] = await conn.query("SELECT source_table, source_max_id FROM sqlite_migration_watermarks") as [{ source_table: string; source_max_id: number }[], unknown];
  return Object.fromEntries(rows.map((row) => [row.source_table, Number(row.source_max_id)]));
}

async function recordWatermark(conn: PoolConnection, table: IdTable, maxSourceId: number): Promise<void> {
  await ensureWatermarkTable(conn);
  await conn.execute(
    `INSERT INTO sqlite_migration_watermarks (source_table, source_max_id)
     VALUES (?, ?)
     ON DUPLICATE KEY UPDATE source_max_id = GREATEST(source_max_id, VALUES(source_max_id))`,
    [table, maxSourceId],
  );
  await throttle();
}

async function recordRowsWatermark(conn: PoolConnection, table: IdTable, rows: { id: number }[]): Promise<void> {
  if (!rows.length) return;
  await recordWatermark(conn, table, Math.max(...rows.map((row) => row.id)));
}

// ── main ─────────────────────────────────────────────────────────────────────

async function main() {
  const sqlite = new Database(SQLITE_PATH, { readonly: true });
  console.log(`Source: ${SQLITE_PATH}`);
  if (checkpoint) {
    console.log(`Tail import: rows with source SQLite id greater than checkpoint`);
  }
  if (options.writeCheckpointPath) {
    writeCheckpoint(sqlite, options.writeCheckpointPath);
    console.log(`Wrote checkpoint: ${options.writeCheckpointPath}`);
  }
  if (options.delayMs > 0) {
    console.log(`Throttle: ${options.delayMs}ms after each MySQL insert batch/query`);
  }

  console.log("Connecting to MySQL and ensuring schema...");
  await ensureReady();
  const conn = await pool.getConnection();
  await ensureWatermarkTable(conn);
  if (options.resumeFromMysqlWatermarks) {
    checkpoint = await readMysqlWatermarks(conn);
    console.log(`Resume import: loaded ${Object.keys(checkpoint).length} source watermarks from MySQL`);
  }

  try {
    await conn.query("SET FOREIGN_KEY_CHECKS = 0");

    // ── provinces ────────────────────────────────────────────────────────────
    {
      type Row = {
        id: number; name: string; kingdom: string; created_at: string;
        cached_rtpa: number|null; cached_rtpa_age: string|null;
        cached_mtpa: number|null; cached_mtpa_age: string|null;
        cached_otpa: number|null; cached_otpa_age: string|null;
        cached_dtpa: number|null; cached_dtpa_age: string|null;
        cached_rwpa: number|null; cached_rwpa_age: string|null;
        cached_mwpa: number|null; cached_mwpa_age: string|null;
      };
      const rows = selectRows<Row>(sqlite, "provinces", "id", false);
      const rowsToInsert = rows.filter((r) => shouldInsertSourceRow("provinces", r.id));
      console.log(`provinces: ${rowsToInsert.length} rows${checkpoint ? ` (${rows.length} mapped)` : ""}`);
      const provMap = new Map<number, number>();
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        const id = shouldInsertSourceRow("provinces", r.id)
          ? await insertOne(
              conn,
              `INSERT IGNORE INTO provinces
                (name, kingdom, created_at,
                 cached_rtpa, cached_rtpa_age, cached_mtpa, cached_mtpa_age,
                 cached_otpa, cached_otpa_age, cached_dtpa, cached_dtpa_age,
                 cached_rwpa, cached_rwpa_age, cached_mwpa, cached_mwpa_age)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [r.name, r.kingdom, r.created_at,
               r.cached_rtpa, r.cached_rtpa_age, r.cached_mtpa, r.cached_mtpa_age,
               r.cached_otpa, r.cached_otpa_age, r.cached_dtpa, r.cached_dtpa_age,
               r.cached_rwpa, r.cached_rwpa_age, r.cached_mwpa, r.cached_mwpa_age],
              "SELECT id FROM provinces WHERE name = ? AND kingdom = ?",
              [r.name, r.kingdom],
            )
          : await resolveOne(conn, "SELECT id FROM provinces WHERE name = ? AND kingdom = ?", [r.name, r.kingdom]);
        provMap.set(r.id, id);
        if ((i + 1) % BATCH === 0) await throttle();
      }
      await recordRowsWatermark(conn, "provinces", rowsToInsert);

      // ── province_overview ────────────────────────────────────────────────
      {
        type R = {
          province_id: number; key_hash: string|null; race: string|null;
          personality: string|null; honor_title: string|null; ruler: string|null;
          land: number|null; networth: number|null; source: string;
          saved_by: string|null; accuracy: number|null; received_at: string;
        };
        const rs = selectRows<R>(sqlite, "province_overview");
        console.log(`province_overview: ${rs.length} rows`);
        await batchInsert(conn, "province_overview",
          ["province_id","key_hash","race","personality","honor_title","ruler","land","networth","source","saved_by","accuracy","received_at"],
          rs.map(r => [provMap.get(r.province_id)!, r.key_hash, r.race, r.personality, r.honor_title, r.ruler, r.land, r.networth, r.source, r.saved_by, r.accuracy, r.received_at]),
        );
        await recordRowsWatermark(conn, "province_overview", rs as (R & { id: number })[]);
      }

      // ── total_military_points ────────────────────────────────────────────
      {
        type R = { province_id: number; key_hash: string|null; off_points: number|null; def_points: number|null; source: string; saved_by: string|null; accuracy: number|null; received_at: string };
        const rs = selectRows<R>(sqlite, "total_military_points");
        console.log(`total_military_points: ${rs.length} rows`);
        await batchInsert(conn, "total_military_points",
          ["province_id","key_hash","off_points","def_points","source","saved_by","accuracy","received_at"],
          rs.map(r => [provMap.get(r.province_id)!, r.key_hash, r.off_points, r.def_points, r.source, r.saved_by, r.accuracy, r.received_at]),
        );
        await recordRowsWatermark(conn, "total_military_points", rs as (R & { id: number })[]);
      }

      // ── home_military_points ─────────────────────────────────────────────
      {
        type R = { province_id: number; key_hash: string|null; mod_off_at_home: number|null; mod_def_at_home: number|null; source: string; saved_by: string|null; accuracy: number|null; received_at: string };
        const rs = selectRows<R>(sqlite, "home_military_points");
        console.log(`home_military_points: ${rs.length} rows`);
        await batchInsert(conn, "home_military_points",
          ["province_id","key_hash","mod_off_at_home","mod_def_at_home","source","saved_by","accuracy","received_at"],
          rs.map(r => [provMap.get(r.province_id)!, r.key_hash, r.mod_off_at_home, r.mod_def_at_home, r.source, r.saved_by, r.accuracy, r.received_at]),
        );
        await recordRowsWatermark(conn, "home_military_points", rs as (R & { id: number })[]);
      }

      // ── province_troops ──────────────────────────────────────────────────
      {
        type R = { province_id: number; key_hash: string|null; soldiers: number|null; off_specs: number|null; def_specs: number|null; elites: number|null; war_horses: number|null; peasants: number|null; source: string; saved_by: string|null; accuracy: number|null; received_at: string };
        const rs = selectRows<R>(sqlite, "province_troops");
        console.log(`province_troops: ${rs.length} rows`);
        await batchInsert(conn, "province_troops",
          ["province_id","key_hash","soldiers","off_specs","def_specs","elites","war_horses","peasants","source","saved_by","accuracy","received_at"],
          rs.map(r => [provMap.get(r.province_id)!, r.key_hash, r.soldiers, r.off_specs, r.def_specs, r.elites, r.war_horses, r.peasants, r.source, r.saved_by, r.accuracy, r.received_at]),
        );
        await recordRowsWatermark(conn, "province_troops", rs as (R & { id: number })[]);
      }

      // ── province_resources ───────────────────────────────────────────────
      {
        type R = { province_id: number; key_hash: string|null; money: number|null; food: number|null; runes: number|null; prisoners: number|null; trade_balance: number|null; building_efficiency: number|null; thieves: number|null; stealth: number|null; wizards: number|null; mana: number|null; total_pop: number|null; max_pop: number|null; free_specialist_credits: number|null; free_building_credits: number|null; source: string; saved_by: string|null; accuracy: number|null; received_at: string };
        const rs = selectRows<R>(sqlite, "province_resources");
        console.log(`province_resources: ${rs.length} rows`);
        await batchInsert(conn, "province_resources",
          ["province_id","key_hash","money","food","runes","prisoners","trade_balance","building_efficiency","thieves","stealth","wizards","mana","total_pop","max_pop","free_specialist_credits","free_building_credits","source","saved_by","accuracy","received_at"],
          rs.map(r => [provMap.get(r.province_id)!, r.key_hash, r.money, r.food, r.runes, r.prisoners, r.trade_balance, r.building_efficiency, r.thieves, r.stealth, r.wizards, r.mana, r.total_pop ?? null, r.max_pop ?? null, r.free_specialist_credits ?? null, r.free_building_credits ?? null, r.source, r.saved_by, r.accuracy, r.received_at]),
        );
        await recordRowsWatermark(conn, "province_resources", rs as (R & { id: number })[]);
      }

      // ── province_status ──────────────────────────────────────────────────
      {
        type R = { province_id: number; key_hash: string|null; plagued: number|null; overpopulated: number|null; overpop_deserters: number|null; dragon_type: string|null; dragon_name: string|null; hit_status: string|null; war: number|null; source: string; saved_by: string|null; received_at: string };
        const rs = selectRows<R>(sqlite, "province_status");
        console.log(`province_status: ${rs.length} rows`);
        await batchInsert(conn, "province_status",
          ["province_id","key_hash","plagued","overpopulated","overpop_deserters","dragon_type","dragon_name","hit_status","war","source","saved_by","received_at"],
          rs.map(r => [provMap.get(r.province_id)!, r.key_hash, r.plagued, r.overpopulated, r.overpop_deserters ?? null, r.dragon_type ?? null, r.dragon_name ?? null, r.hit_status, r.war, r.source, r.saved_by, r.received_at]),
        );
        await recordRowsWatermark(conn, "province_status", rs as (R & { id: number })[]);
      }

      // ── province_effects ─────────────────────────────────────────────────
      {
        type R = { province_id: number; key_hash: string|null; effect_name: string; effect_kind: string; duration_text: string|null; remaining_ticks: number|null; effectiveness_percent: number|null; source: string; saved_by: string|null; received_at: string };
        const rs = selectRows<R>(sqlite, "province_effects");
        console.log(`province_effects: ${rs.length} rows`);
        await batchInsert(conn, "province_effects",
          ["province_id","key_hash","effect_name","effect_kind","duration_text","remaining_ticks","effectiveness_percent","source","saved_by","received_at"],
          rs.map(r => [provMap.get(r.province_id)!, r.key_hash, r.effect_name, r.effect_kind, r.duration_text, r.remaining_ticks ?? null, r.effectiveness_percent ?? null, r.source, r.saved_by, r.received_at]),
        );
        await recordRowsWatermark(conn, "province_effects", rs as (R & { id: number })[]);
      }

      // ── intel_partitions ─────────────────────────────────────────────────
      {
        type R = { key_hash: string; province_id: number };
        const rs = sqlite.prepare("SELECT * FROM intel_partitions").all() as R[];
        console.log(`intel_partitions: ${rs.length} rows`);
        await batchInsert(conn, "intel_partitions",
          ["key_hash","province_id"],
          rs.map(r => [r.key_hash, provMap.get(r.province_id)!]),
        );
      }

      // ── military_intel + som_armies ──────────────────────────────────────
      {
        type MilRow = { id: number; province_id: number; key_hash: string|null; ome: number|null; dme: number|null; source: string; saved_by: string|null; accuracy: number|null; received_at: string };
        type ArmyRow = { id: number; military_intel_id: number; army_type: string; generals: number; soldiers: number; off_specs: number; def_specs: number; elites: number; war_horses: number; thieves: number; land_gained: number; return_days: number|null };
        const milRows = selectRows<MilRow>(sqlite, "military_intel", "id", false);
        const milRowsToInsert = milRows.filter((r) => shouldInsertSourceRow("military_intel", r.id));
        const armyRows = selectRows<ArmyRow>(sqlite, "som_armies", "military_intel_id, id");
        console.log(`military_intel: ${milRowsToInsert.length} rows${checkpoint ? ` (${milRows.length} mapped)` : ""}, som_armies: ${armyRows.length} rows`);
        const milMap = new Map<number, number>();
        for (let i = 0; i < milRows.length; i++) {
          const r = milRows[i];
          const mysqlProvinceId = provMap.get(r.province_id)!;
          const conflictSql = "SELECT id FROM military_intel WHERE province_id = ? AND key_hash <=> ? AND source = ? AND saved_by <=> ? AND received_at = ?";
          const conflictParams = [mysqlProvinceId, r.key_hash, r.source, r.saved_by, r.received_at];
          const id = shouldInsertSourceRow("military_intel", r.id)
            ? await insertOne(
                conn,
                "INSERT IGNORE INTO military_intel (province_id, key_hash, ome, dme, source, saved_by, accuracy, received_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                [mysqlProvinceId, r.key_hash, r.ome, r.dme, r.source, r.saved_by, r.accuracy, r.received_at],
                conflictSql,
                conflictParams,
              )
            : await resolveOne(conn, conflictSql, conflictParams);
          milMap.set(r.id, id);
          if ((i + 1) % BATCH === 0) await throttle();
        }
        await batchInsert(conn, "som_armies",
          ["military_intel_id","army_type","generals","soldiers","off_specs","def_specs","elites","war_horses","thieves","land_gained","return_days"],
          armyRows.map(r => [milMap.get(r.military_intel_id)!, r.army_type, r.generals, r.soldiers, r.off_specs, r.def_specs, r.elites, r.war_horses, r.thieves, r.land_gained, r.return_days]),
        );
        await recordRowsWatermark(conn, "military_intel", milRowsToInsert);
        await recordRowsWatermark(conn, "som_armies", armyRows);
      }

      // ── survey_intel + survey_buildings ──────────────────────────────────
      {
        type SurveyRow = { id: number; province_id: number; key_hash: string|null; thievery_effectiveness: number|null; thief_prevent_chance: number|null; castles_effect: number|null; source: string; saved_by: string|null; accuracy: number|null; received_at: string };
        type BldgRow = { id: number; survey_intel_id: number; building: string; built: number; in_progress: number };
        const surveyRows = selectRows<SurveyRow>(sqlite, "survey_intel", "id", false);
        const surveyRowsToInsert = surveyRows.filter((r) => shouldInsertSourceRow("survey_intel", r.id));
        const bldgRows = selectRows<BldgRow>(sqlite, "survey_buildings", "survey_intel_id, id");
        console.log(`survey_intel: ${surveyRowsToInsert.length} rows${checkpoint ? ` (${surveyRows.length} mapped)` : ""}, survey_buildings: ${bldgRows.length} rows`);
        const surveyMap = new Map<number, number>();
        const newSurveyIds = new Set(surveyRowsToInsert.map(r => r.id));
        for (let i = 0; i < surveyRows.length; i++) {
          const r = surveyRows[i];
          const mysqlProvinceId = provMap.get(r.province_id)!;
          const conflictSql = "SELECT id FROM survey_intel WHERE province_id = ? AND key_hash <=> ? AND source = ? AND saved_by <=> ? AND received_at = ?";
          const conflictParams = [mysqlProvinceId, r.key_hash, r.source, r.saved_by, r.received_at];
          const id = shouldInsertSourceRow("survey_intel", r.id)
            ? await insertOne(
                conn,
                "INSERT IGNORE INTO survey_intel (province_id, key_hash, thievery_effectiveness, thief_prevent_chance, castles_effect, source, saved_by, accuracy, received_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                [mysqlProvinceId, r.key_hash, r.thievery_effectiveness ?? null, r.thief_prevent_chance ?? null, r.castles_effect ?? null, r.source, r.saved_by, r.accuracy, r.received_at],
                conflictSql,
                conflictParams,
              )
            : await resolveOne(conn, conflictSql, conflictParams);
          surveyMap.set(r.id, id);
          if ((i + 1) % BATCH === 0) await throttle();
        }
        await batchInsert(conn, "survey_buildings",
          ["survey_intel_id","building","built","in_progress"],
          bldgRows.filter(r => newSurveyIds.has(r.survey_intel_id))
                  .map(r => [surveyMap.get(r.survey_intel_id)!, r.building, r.built, r.in_progress]),
        );
        await recordRowsWatermark(conn, "survey_intel", surveyRowsToInsert);
        await recordRowsWatermark(conn, "survey_buildings", bldgRows);
      }

      // ── sos_intel + sos_sciences ─────────────────────────────────────────
      {
        type SosRow = { id: number; province_id: number; key_hash: string|null; source: string; saved_by: string|null; accuracy: number|null; received_at: string };
        type SciRow = { id: number; sos_intel_id: number; science: string; books: number; effect: number };
        const sosRows = selectRows<SosRow>(sqlite, "sos_intel", "id", false);
        const sosRowsToInsert = sosRows.filter((r) => shouldInsertSourceRow("sos_intel", r.id));
        const sciRows = selectRows<SciRow>(sqlite, "sos_sciences", "sos_intel_id, id");
        console.log(`sos_intel: ${sosRowsToInsert.length} rows${checkpoint ? ` (${sosRows.length} mapped)` : ""}, sos_sciences: ${sciRows.length} rows`);
        const sosMap = new Map<number, number>();
        const newSosIds = new Set(sosRowsToInsert.map(r => r.id));
        for (let i = 0; i < sosRows.length; i++) {
          const r = sosRows[i];
          const mysqlProvinceId = provMap.get(r.province_id)!;
          const conflictSql = "SELECT id FROM sos_intel WHERE province_id = ? AND key_hash <=> ? AND source = ? AND saved_by <=> ? AND received_at = ?";
          const conflictParams = [mysqlProvinceId, r.key_hash, r.source, r.saved_by, r.received_at];
          const id = shouldInsertSourceRow("sos_intel", r.id)
            ? await insertOne(
                conn,
                "INSERT IGNORE INTO sos_intel (province_id, key_hash, source, saved_by, accuracy, received_at) VALUES (?, ?, ?, ?, ?, ?)",
                [mysqlProvinceId, r.key_hash, r.source, r.saved_by, r.accuracy, r.received_at],
                conflictSql,
                conflictParams,
              )
            : await resolveOne(conn, conflictSql, conflictParams);
          sosMap.set(r.id, id);
          if ((i + 1) % BATCH === 0) await throttle();
        }
        await batchInsert(conn, "sos_sciences",
          ["sos_intel_id","science","books","effect"],
          sciRows.filter(r => newSosIds.has(r.sos_intel_id))
                 .map(r => [sosMap.get(r.sos_intel_id)!, r.science, r.books, r.effect]),
        );
        await recordRowsWatermark(conn, "sos_intel", sosRowsToInsert);
        await recordRowsWatermark(conn, "sos_sciences", sciRows);
      }

      // ── rob_ops ──────────────────────────────────────────────────────────
      {
        type R = { id: number; province_id: number; key_hash: string; op: string; target_name: string|null; target_slot: number|null; target_kingdom: string|null; outcome: string; amount_stolen: number|null; thieves_lost: number; thieves: number|null; stealth: number|null; troops_assassinated: number|null; kidnapped: number|null; acres_burned: number|null; effect_duration: number|null; saved_by: string|null; received_at: string };
        const rs = selectRows<R>(sqlite, "rob_ops");
        console.log(`rob_ops: ${rs.length} rows`);
        await batchInsert(conn, "rob_ops",
          ["province_id","key_hash","op","target_name","target_slot","target_kingdom","outcome","amount_stolen","thieves_lost","thieves","stealth","troops_assassinated","kidnapped","acres_burned","effect_duration","saved_by","received_at"],
          rs.map(r => [provMap.get(r.province_id)!, r.key_hash, r.op, r.target_name, r.target_slot, r.target_kingdom, r.outcome, r.amount_stolen, r.thieves_lost, r.thieves, r.stealth, r.troops_assassinated ?? null, r.kidnapped ?? null, r.acres_burned ?? null, r.effect_duration ?? null, r.saved_by, r.received_at]),
        );
        await recordRowsWatermark(conn, "rob_ops", rs);
      }

      // ── intel_ops ────────────────────────────────────────────────────────
      {
        type R = { id: number; province_id: number; key_hash: string; op: string; intel_type: string; outcome: string; target_name: string|null; target_slot: number|null; target_kingdom: string|null; accuracy: number|null; thieves_lost: number; saved_by: string|null; received_at: string };
        const rs = selectRows<R>(sqlite, "intel_ops");
        console.log(`intel_ops: ${rs.length} rows`);
        await batchInsert(conn, "intel_ops",
          ["province_id","key_hash","op","intel_type","outcome","target_name","target_slot","target_kingdom","accuracy","thieves_lost","saved_by","received_at"],
          rs.map(r => [provMap.get(r.province_id)!, r.key_hash, r.op, r.intel_type, r.outcome, r.target_name, r.target_slot, r.target_kingdom, r.accuracy, r.thieves_lost, r.saved_by, r.received_at]),
        );
        await recordRowsWatermark(conn, "intel_ops", rs);
      }

      // ── sorcery_ops ──────────────────────────────────────────────────────
      {
        type R = { id: number; province_id: number; key_hash: string; spell: string; outcome: string; runes_spent: number|null; wizards_lost: number; duration_days: number|null; target_name: string|null; target_slot: number|null; target_kingdom: string|null; wizards: number|null; runes: number|null; mana: number|null; saved_by: string|null; received_at: string };
        const rs = selectRows<R>(sqlite, "sorcery_ops");
        console.log(`sorcery_ops: ${rs.length} rows`);
        await batchInsert(conn, "sorcery_ops",
          ["province_id","key_hash","spell","outcome","runes_spent","wizards_lost","duration_days","target_name","target_slot","target_kingdom","wizards","runes","mana","saved_by","received_at"],
          rs.map(r => [provMap.get(r.province_id)!, r.key_hash, r.spell, r.outcome, r.runes_spent, r.wizards_lost, r.duration_days, r.target_name, r.target_slot, r.target_kingdom, r.wizards, r.runes, r.mana, r.saved_by, r.received_at]),
        );
        await recordRowsWatermark(conn, "sorcery_ops", rs);
      }

      // ── attack_ops ───────────────────────────────────────────────────────
      {
        type R = { id: number; province_id: number; key_hash: string; attack_type: string; outcome: string; target_name: string|null; target_kingdom: string|null; acres_taken: number|null; buildings_survived: number|null; specialist_credits: number|null; peasants_settled: number|null; massacred: number|null; enemy_killed: number|null; enemy_imprisoned: number|null; return_days: number|null; saved_by: string|null; received_at: string };
        const rs = selectRows<R>(sqlite, "attack_ops");
        console.log(`attack_ops: ${rs.length} rows`);
        await batchInsert(conn, "attack_ops",
          ["province_id","key_hash","attack_type","outcome","target_name","target_kingdom","acres_taken","buildings_survived","specialist_credits","peasants_settled","massacred","enemy_killed","enemy_imprisoned","return_days","saved_by","received_at"],
          rs.map(r => [provMap.get(r.province_id)!, r.key_hash, r.attack_type, r.outcome, r.target_name, r.target_kingdom, r.acres_taken, r.buildings_survived, r.specialist_credits, r.peasants_settled, r.massacred, r.enemy_killed, r.enemy_imprisoned, r.return_days, r.saved_by, r.received_at]),
        );
        await recordRowsWatermark(conn, "attack_ops", rs);
      }
    }

    // ── key_kingdom_bindings ─────────────────────────────────────────────────
    {
      type R = { key_hash: string; kingdom: string; source: string; bound_at: string };
      const rs = sqlite.prepare("SELECT * FROM key_kingdom_bindings").all() as R[];
      console.log(`key_kingdom_bindings: ${rs.length} rows`);
      await batchInsert(conn, "key_kingdom_bindings",
        ["key_hash","kingdom","source","bound_at"],
        rs.map(r => [r.key_hash, r.kingdom, r.source, r.bound_at]),
      );
    }

    // ── kingdom_intel + kingdom_provinces ────────────────────────────────────
    {
      type KiRow = {
        id: number; key_hash: string|null; name: string; location: string;
        kingdom_title: string|null; total_networth: number|null; total_land: number|null;
        total_honor: number|null; wars_won: number|null; war_losses: number|null;
        networth_rank: number|null; land_rank: number|null; honor_rank: number|null;
        war_target: string|null; their_attitude_to_us: string|null; their_attitude_points: number|null;
        our_attitude_to_them: string|null; our_attitude_points: number|null;
        hostility_meter_visible_until: string|null; open_relations_json: string|null;
        war_doctrines_json: string|null; source: string; saved_by: string|null; received_at: string;
      };
      type KpRow = { id: number; kingdom_intel_id: number; slot: number|null; name: string; race: string; land: number; networth: number; honor_title: string|null };
      const kiRows = selectRows<KiRow>(sqlite, "kingdom_intel", "id", false);
      const kiRowsToInsert = kiRows.filter((r) => shouldInsertSourceRow("kingdom_intel", r.id));
      const kpRows = selectRows<KpRow>(sqlite, "kingdom_provinces", "kingdom_intel_id, id");
      console.log(`kingdom_intel: ${kiRowsToInsert.length} rows${checkpoint ? ` (${kiRows.length} mapped)` : ""}, kingdom_provinces: ${kpRows.length} rows`);
      const kiMap = new Map<number, number>();
      for (let i = 0; i < kiRows.length; i++) {
        const r = kiRows[i];
        const conflictSql = "SELECT id FROM kingdom_intel WHERE key_hash <=> ? AND location = ? AND source = ? AND saved_by <=> ? AND received_at = ?";
        const conflictParams = [r.key_hash, r.location, r.source, r.saved_by, r.received_at];
        const id = shouldInsertSourceRow("kingdom_intel", r.id)
          ? await insertOne(
              conn,
              `INSERT IGNORE INTO kingdom_intel
                (key_hash, name, location, kingdom_title, total_networth, total_land, total_honor,
                 wars_won, war_losses, networth_rank, land_rank, honor_rank, war_target,
                 their_attitude_to_us, their_attitude_points, our_attitude_to_them, our_attitude_points,
                 hostility_meter_visible_until, open_relations_json, war_doctrines_json,
                 source, saved_by, received_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [r.key_hash, r.name, r.location, r.kingdom_title, r.total_networth, r.total_land,
               r.total_honor, r.wars_won, r.war_losses, r.networth_rank, r.land_rank, r.honor_rank,
               r.war_target, r.their_attitude_to_us, r.their_attitude_points, r.our_attitude_to_them,
               r.our_attitude_points, r.hostility_meter_visible_until, r.open_relations_json,
               r.war_doctrines_json, r.source, r.saved_by, r.received_at],
              conflictSql,
              conflictParams,
            )
          : await resolveOne(conn, conflictSql, conflictParams);
        kiMap.set(r.id, id);
        if ((i + 1) % BATCH === 0) await throttle();
      }
      await batchInsert(conn, "kingdom_provinces",
        ["kingdom_intel_id","slot","name","race","land","networth","honor_title"],
        kpRows.map(r => [kiMap.get(r.kingdom_intel_id)!, r.slot, r.name, r.race, r.land, r.networth, r.honor_title]),
      );
      await recordRowsWatermark(conn, "kingdom_intel", kiRowsToInsert);
      await recordRowsWatermark(conn, "kingdom_provinces", kpRows);
    }

    // ── kingdom_news ─────────────────────────────────────────────────────────
    {
      type R = { id: number; kingdom: string; game_date: string; game_date_ord: number|null; event_type: string; raw_text: string; attacker_name: string|null; attacker_kingdom: string|null; defender_name: string|null; defender_kingdom: string|null; acres: number|null; books: number|null; sender_name: string|null; receiver_name: string|null; relation_kingdom: string|null; dragon_type: string|null; dragon_name: string|null; received_at: string };
      const rs = selectRows<R>(sqlite, "kingdom_news");
      console.log(`kingdom_news: ${rs.length} rows`);
      await batchInsert(conn, "kingdom_news",
        ["kingdom","game_date","game_date_ord","event_type","raw_text","attacker_name","attacker_kingdom","defender_name","defender_kingdom","acres","books","sender_name","receiver_name","relation_kingdom","dragon_type","dragon_name","received_at"],
        rs.map(r => [r.kingdom, r.game_date, r.game_date_ord, r.event_type, r.raw_text, r.attacker_name, r.attacker_kingdom, r.defender_name, r.defender_kingdom, r.acres, r.books, r.sender_name, r.receiver_name, r.relation_kingdom, r.dragon_type, r.dragon_name, r.received_at]),
      );
      await recordRowsWatermark(conn, "kingdom_news", rs);
    }

    // ── kingdom_news_sharded ─────────────────────────────────────────────────
    {
      type R = { id: number; key_hash: string; kingdom: string; game_date: string; game_date_ord: number|null; event_type: string; raw_text: string; attacker_name: string|null; attacker_kingdom: string|null; defender_name: string|null; defender_kingdom: string|null; acres: number|null; books: number|null; sender_name: string|null; receiver_name: string|null; relation_kingdom: string|null; dragon_type: string|null; dragon_name: string|null; received_at: string };
      const rs = selectRows<R>(sqlite, "kingdom_news_sharded");
      console.log(`kingdom_news_sharded: ${rs.length} rows`);
      await batchInsert(conn, "kingdom_news_sharded",
        ["key_hash","kingdom","game_date","game_date_ord","event_type","raw_text","attacker_name","attacker_kingdom","defender_name","defender_kingdom","acres","books","sender_name","receiver_name","relation_kingdom","dragon_type","dragon_name","received_at"],
        rs.map(r => [r.key_hash, r.kingdom, r.game_date, r.game_date_ord, r.event_type, r.raw_text, r.attacker_name, r.attacker_kingdom, r.defender_name, r.defender_kingdom, r.acres, r.books, r.sender_name, r.receiver_name, r.relation_kingdom, r.dragon_type, r.dragon_name, r.received_at]),
      );
      await recordRowsWatermark(conn, "kingdom_news_sharded", rs);
    }

    console.log("Migration complete.");
  } finally {
    await conn.query("SET FOREIGN_KEY_CHECKS = 1");
    conn.release();
    await pool.end();
    sqlite.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
