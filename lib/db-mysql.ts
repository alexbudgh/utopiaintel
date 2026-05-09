import mysql from "mysql2/promise";
import type { PoolConnection, ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { BAD_SPELL_NAMES } from "./effects";
import { parseUtopiaDate, formatUtopiaDate } from "./ui";
import { computeWizardCount } from "./nw";
import { computeDtpaValue, computeMtpaValue, computeMwpaValue, computeOtpaValue, rawPerAcreValue } from "./metrics";
import type {
  SoTData,
  SurveyData,
  SoMData,
  SoSData,
  SoDData,
  InfiltrateData,
  KingdomData,
  StateData,
  KingdomOpenRelation,
  WarDoctrine,
  TrainArmyData,
  BuildData,
  RobData,
  SorceryData,
  AttackData,
} from "./parsers/types";
import type { KingdomNewsData, KingdomNewsEvent } from "./parsers/kingdom_news";
import type { IntelOpAttempt } from "./intel-ops";
import type {
  KingdomRow,
  KingdomSnapshot,
  KingdomSnapshotHistoryPoint,
  KingdomSnapshotProvince,
  RecentOp,
  ProvinceRow,
  ArmyRow,
  BuildingRow,
  ScienceRow,
  ProvinceDetail,
  KingdomRitual,
  KingdomDragon,
  KingdomNewsRow,
  NewsProvinceSummary,
  NewsKingdomSummary,
  KingdomNewsSummary,
  ProvinceHistoryPoint,
  ProvinceHistoryAttack,
  ProvinceHistoryThieveryOp,
  ProvinceHistorySorceryOp,
} from "./db";

// ── Pool ────────────────────────────────────────────────────────────────────

export const pool = mysql.createPool({
  host:     process.env.DB_HOST     ?? "localhost",
  port:     Number(process.env.DB_PORT ?? 3306),
  user:     process.env.DB_USER     ?? "utopiaintel",
  password: process.env.DB_PASSWORD ?? "",
  database: process.env.DB_NAME     ?? "utopiaintel",
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

// ── Named-param helper ───────────────────────────────────────────────────────
// Converts `:name` placeholders to `?` and collects values in order.
// Usage: const [sql, vals] = n("SELECT * FROM t WHERE id = :id", { id: 1 });
export function n(sql: string, params: Record<string, unknown>): [string, unknown[]] {
  const values: unknown[] = [];
  const query = sql.replace(/:(\w+)/g, (_, key) => {
    values.push(params[key]);
    return "?";
  });
  return [query, values];
}

// ── Transaction helper ───────────────────────────────────────────────────────

export async function withTransaction<T>(fn: (conn: PoolConnection) => Promise<T>): Promise<T> {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const result = await fn(conn);
    await conn.commit();
    return result;
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

// ── SQL helpers ──────────────────────────────────────────────────────────────

const TTL_DAYS = 7;

// Same-tick check: integer division of UNIX_TIMESTAMP by 3600 (one Utopia hour)
const SAME_TICK_EXPR = (a: string, b: string) =>
  `(UNIX_TIMESTAMP(${a}) DIV 3600) = (UNIX_TIMESTAMP(${b}) DIV 3600)`;

const BAD_SPELL_SQL_LIST = BAD_SPELL_NAMES.map((name) => `'${name.replaceAll("'", "''")}'`).join(", ");

// latestSlotCte uses :keyHash (and optionally :kingdom) — callers pass through n()
const latestSlotCte = (extraWhere = "") => `
  latest_slot AS (
    SELECT ki.location AS kingdom, kp.slot, kp.name
    FROM kingdom_provinces kp
    JOIN kingdom_intel ki ON ki.id = kp.kingdom_intel_id
    WHERE ki.key_hash = :keyHash
      AND kp.slot IS NOT NULL
      ${extraWhere}
      AND kp.id = (
        SELECT MAX(kp2.id)
        FROM kingdom_provinces kp2
        JOIN kingdom_intel ki2 ON ki2.id = kp2.kingdom_intel_id
        WHERE ki2.key_hash = :keyHash
          AND ki2.location = ki.location
          AND kp2.slot = kp.slot
      )
  )
`;

// OVERVIEW scalar subqueries — use :keyHash (resolved via n())
const OVERVIEW_RACE_SQL  = `(SELECT race        FROM province_overview WHERE province_id = p.id AND key_hash = :keyHash AND race        IS NOT NULL ORDER BY received_at DESC LIMIT 1) AS race`;
const OVERVIEW_PERS_SQL  = `(SELECT personality FROM province_overview WHERE province_id = p.id AND key_hash = :keyHash AND personality IS NOT NULL ORDER BY received_at DESC LIMIT 1) AS personality`;
const OVERVIEW_HONOR_SQL = `(SELECT honor_title FROM province_overview WHERE province_id = p.id AND key_hash = :keyHash AND honor_title IS NOT NULL ORDER BY received_at DESC LIMIT 1) AS honor_title`;

// ── Lazy init ────────────────────────────────────────────────────────────────

let _ready: Promise<void> | null = null;

export function ensureReady(): Promise<void> {
  if (!_ready) _ready = initDb();
  return _ready;
}

// ── Schema ───────────────────────────────────────────────────────────────────

export async function initDb(): Promise<void> {
  const ddl: string[] = [
    `CREATE TABLE IF NOT EXISTS provinces (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      kingdom VARCHAR(64) NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      cached_rtpa DOUBLE,
      cached_rtpa_age DATETIME,
      cached_mtpa DOUBLE,
      cached_mtpa_age DATETIME,
      cached_otpa DOUBLE,
      cached_otpa_age DATETIME,
      cached_dtpa DOUBLE,
      cached_dtpa_age DATETIME,
      cached_rwpa DOUBLE,
      cached_rwpa_age DATETIME,
      cached_mwpa DOUBLE,
      cached_mwpa_age DATETIME,
      UNIQUE KEY uq_provinces_name_kingdom (name, kingdom)
    ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,

    `CREATE TABLE IF NOT EXISTS province_overview (
      id INT AUTO_INCREMENT PRIMARY KEY,
      province_id INT NOT NULL,
      key_hash VARCHAR(64),
      race VARCHAR(64),
      personality VARCHAR(64),
      honor_title VARCHAR(128),
      ruler VARCHAR(255),
      land INT,
      networth INT,
      source VARCHAR(64) NOT NULL,
      saved_by VARCHAR(255),
      accuracy INT DEFAULT 100,
      received_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_overview_prov FOREIGN KEY (province_id) REFERENCES provinces(id)
    ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,

    `CREATE INDEX IF NOT EXISTS idx_overview_prov_time ON province_overview(province_id, received_at DESC)`,

    `CREATE TABLE IF NOT EXISTS total_military_points (
      id INT AUTO_INCREMENT PRIMARY KEY,
      province_id INT NOT NULL,
      key_hash VARCHAR(64),
      off_points INT,
      def_points INT,
      source VARCHAR(64) NOT NULL DEFAULT 'sot',
      saved_by VARCHAR(255),
      accuracy INT DEFAULT 100,
      received_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_totmil_prov FOREIGN KEY (province_id) REFERENCES provinces(id)
    ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,

    `CREATE INDEX IF NOT EXISTS idx_totmil_prov_time ON total_military_points(province_id, received_at DESC)`,

    `CREATE TABLE IF NOT EXISTS home_military_points (
      id INT AUTO_INCREMENT PRIMARY KEY,
      province_id INT NOT NULL,
      key_hash VARCHAR(64),
      mod_off_at_home INT,
      mod_def_at_home INT,
      source VARCHAR(64) NOT NULL,
      saved_by VARCHAR(255),
      accuracy INT DEFAULT 100,
      received_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_homemil_prov FOREIGN KEY (province_id) REFERENCES provinces(id)
    ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,

    `CREATE INDEX IF NOT EXISTS idx_homemil_prov_time ON home_military_points(province_id, received_at DESC)`,

    `CREATE TABLE IF NOT EXISTS province_troops (
      id INT AUTO_INCREMENT PRIMARY KEY,
      province_id INT NOT NULL,
      key_hash VARCHAR(64),
      soldiers INT,
      off_specs INT,
      def_specs INT,
      elites INT,
      war_horses INT,
      peasants INT,
      source VARCHAR(64) NOT NULL,
      saved_by VARCHAR(255),
      accuracy INT DEFAULT 100,
      received_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_troops_prov FOREIGN KEY (province_id) REFERENCES provinces(id)
    ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,

    `CREATE INDEX IF NOT EXISTS idx_troops_prov_time ON province_troops(province_id, received_at DESC)`,

    `CREATE TABLE IF NOT EXISTS province_resources (
      id INT AUTO_INCREMENT PRIMARY KEY,
      province_id INT NOT NULL,
      key_hash VARCHAR(64),
      money INT,
      food INT,
      runes INT,
      prisoners INT,
      trade_balance INT,
      building_efficiency INT,
      thieves INT,
      stealth INT,
      wizards INT,
      mana INT,
      total_pop INT,
      max_pop INT,
      free_specialist_credits INT,
      free_building_credits INT,
      source VARCHAR(64) NOT NULL DEFAULT 'sot',
      saved_by VARCHAR(255),
      accuracy INT DEFAULT 100,
      received_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_resources_prov FOREIGN KEY (province_id) REFERENCES provinces(id)
    ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,

    `CREATE INDEX IF NOT EXISTS idx_resources_prov_time ON province_resources(province_id, received_at DESC)`,

    `CREATE TABLE IF NOT EXISTS province_status (
      id INT AUTO_INCREMENT PRIMARY KEY,
      province_id INT NOT NULL,
      key_hash VARCHAR(64),
      plagued TINYINT(1),
      overpopulated TINYINT(1),
      overpop_deserters INT,
      dragon_type VARCHAR(64),
      dragon_name VARCHAR(255),
      hit_status VARCHAR(64),
      war TINYINT(1),
      source VARCHAR(64) NOT NULL DEFAULT 'sot',
      saved_by VARCHAR(255),
      received_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_status_prov FOREIGN KEY (province_id) REFERENCES provinces(id)
    ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,

    `CREATE INDEX IF NOT EXISTS idx_status_prov_time ON province_status(province_id, received_at DESC)`,

    `CREATE TABLE IF NOT EXISTS province_effects (
      id INT AUTO_INCREMENT PRIMARY KEY,
      province_id INT NOT NULL,
      key_hash VARCHAR(64),
      effect_name VARCHAR(255) NOT NULL,
      effect_kind VARCHAR(64) NOT NULL,
      duration_text VARCHAR(255),
      remaining_ticks INT,
      effectiveness_percent DOUBLE,
      source VARCHAR(64) NOT NULL DEFAULT 'sot',
      saved_by VARCHAR(255),
      received_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_effects_prov FOREIGN KEY (province_id) REFERENCES provinces(id)
    ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,

    `CREATE INDEX IF NOT EXISTS idx_effects_prov_time ON province_effects(province_id, received_at DESC)`,

    `CREATE TABLE IF NOT EXISTS military_intel (
      id INT AUTO_INCREMENT PRIMARY KEY,
      province_id INT NOT NULL,
      key_hash VARCHAR(64),
      ome DOUBLE,
      dme DOUBLE,
      source VARCHAR(64) NOT NULL DEFAULT 'som',
      saved_by VARCHAR(255),
      accuracy INT DEFAULT 100,
      received_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_milintel_prov FOREIGN KEY (province_id) REFERENCES provinces(id)
    ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,

    `CREATE INDEX IF NOT EXISTS idx_milintel_prov_time ON military_intel(province_id, received_at DESC)`,

    `CREATE TABLE IF NOT EXISTS som_armies (
      id INT AUTO_INCREMENT PRIMARY KEY,
      military_intel_id INT NOT NULL,
      army_type VARCHAR(64) NOT NULL,
      generals INT DEFAULT 0,
      soldiers INT DEFAULT 0,
      off_specs INT DEFAULT 0,
      def_specs INT DEFAULT 0,
      elites INT DEFAULT 0,
      war_horses INT DEFAULT 0,
      thieves INT DEFAULT 0,
      land_gained INT DEFAULT 0,
      return_days DOUBLE,
      CONSTRAINT fk_armies_mil FOREIGN KEY (military_intel_id) REFERENCES military_intel(id) ON DELETE CASCADE
    ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,

    `CREATE TABLE IF NOT EXISTS survey_intel (
      id INT AUTO_INCREMENT PRIMARY KEY,
      province_id INT NOT NULL,
      key_hash VARCHAR(64),
      thievery_effectiveness DOUBLE,
      thief_prevent_chance DOUBLE,
      castles_effect DOUBLE,
      source VARCHAR(64) NOT NULL DEFAULT 'survey',
      saved_by VARCHAR(255),
      accuracy INT DEFAULT 100,
      received_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_survey_prov FOREIGN KEY (province_id) REFERENCES provinces(id)
    ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,

    `CREATE INDEX IF NOT EXISTS idx_survey_prov_time ON survey_intel(province_id, received_at DESC)`,

    `CREATE TABLE IF NOT EXISTS survey_buildings (
      id INT AUTO_INCREMENT PRIMARY KEY,
      survey_intel_id INT NOT NULL,
      building VARCHAR(128) NOT NULL,
      built INT NOT NULL DEFAULT 0,
      in_progress INT NOT NULL DEFAULT 0,
      CONSTRAINT fk_buildings_survey FOREIGN KEY (survey_intel_id) REFERENCES survey_intel(id) ON DELETE CASCADE
    ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,

    `CREATE TABLE IF NOT EXISTS sos_intel (
      id INT AUTO_INCREMENT PRIMARY KEY,
      province_id INT NOT NULL,
      key_hash VARCHAR(64),
      source VARCHAR(64) NOT NULL DEFAULT 'sos',
      saved_by VARCHAR(255),
      accuracy INT DEFAULT 100,
      received_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_sos_prov FOREIGN KEY (province_id) REFERENCES provinces(id)
    ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,

    `CREATE INDEX IF NOT EXISTS idx_sos_prov_time ON sos_intel(province_id, received_at DESC)`,

    `CREATE TABLE IF NOT EXISTS sos_sciences (
      id INT AUTO_INCREMENT PRIMARY KEY,
      sos_intel_id INT NOT NULL,
      science VARCHAR(64) NOT NULL,
      books INT NOT NULL DEFAULT 0,
      effect DOUBLE NOT NULL DEFAULT 0,
      UNIQUE KEY uq_sos_sciences (sos_intel_id, science),
      CONSTRAINT fk_sciences_sos FOREIGN KEY (sos_intel_id) REFERENCES sos_intel(id) ON DELETE CASCADE
    ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,

    `CREATE TABLE IF NOT EXISTS intel_partitions (
      key_hash VARCHAR(64) NOT NULL,
      province_id INT NOT NULL,
      PRIMARY KEY (key_hash, province_id),
      CONSTRAINT fk_partitions_prov FOREIGN KEY (province_id) REFERENCES provinces(id)
    ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,

    `CREATE TABLE IF NOT EXISTS key_kingdom_bindings (
      key_hash VARCHAR(64) PRIMARY KEY,
      kingdom VARCHAR(64) NOT NULL,
      source VARCHAR(64) NOT NULL,
      bound_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,

    `CREATE TABLE IF NOT EXISTS kingdom_intel (
      id INT AUTO_INCREMENT PRIMARY KEY,
      key_hash VARCHAR(64),
      name VARCHAR(255) NOT NULL,
      location VARCHAR(16) NOT NULL,
      kingdom_title VARCHAR(255),
      total_networth INT,
      total_land INT,
      total_honor INT,
      wars_won INT,
      war_losses INT,
      networth_rank INT,
      land_rank INT,
      honor_rank INT,
      war_target VARCHAR(16),
      their_attitude_to_us VARCHAR(64),
      their_attitude_points DOUBLE,
      our_attitude_to_them VARCHAR(64),
      our_attitude_points DOUBLE,
      hostility_meter_visible_until DATETIME,
      open_relations_json TEXT,
      war_doctrines_json TEXT,
      source VARCHAR(64) NOT NULL DEFAULT 'kingdom',
      saved_by VARCHAR(255),
      received_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,

    `CREATE INDEX IF NOT EXISTS idx_kingdom_loc_time ON kingdom_intel(location, received_at DESC)`,

    `CREATE TABLE IF NOT EXISTS kingdom_provinces (
      id INT AUTO_INCREMENT PRIMARY KEY,
      kingdom_intel_id INT NOT NULL,
      slot INT,
      name VARCHAR(255) NOT NULL,
      race VARCHAR(64) NOT NULL,
      land INT NOT NULL,
      networth INT NOT NULL,
      honor_title VARCHAR(128),
      CONSTRAINT fk_kp_ki FOREIGN KEY (kingdom_intel_id) REFERENCES kingdom_intel(id) ON DELETE CASCADE
    ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,

    `CREATE TABLE IF NOT EXISTS kingdom_news (
      id INT AUTO_INCREMENT PRIMARY KEY,
      kingdom VARCHAR(16) NOT NULL,
      game_date VARCHAR(64) NOT NULL,
      game_date_ord INT,
      event_type VARCHAR(64) NOT NULL,
      raw_text VARCHAR(512) NOT NULL,
      attacker_name VARCHAR(255),
      attacker_kingdom VARCHAR(16),
      defender_name VARCHAR(255),
      defender_kingdom VARCHAR(16),
      acres INT,
      books INT,
      sender_name VARCHAR(255),
      receiver_name VARCHAR(255),
      relation_kingdom VARCHAR(16),
      dragon_type VARCHAR(64),
      dragon_name VARCHAR(255),
      received_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uq_kingdom_news (kingdom, game_date(64), raw_text(512))
    ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,

    `CREATE INDEX IF NOT EXISTS idx_kingdom_news_kd_ord ON kingdom_news(kingdom, game_date_ord DESC)`,

    `CREATE TABLE IF NOT EXISTS kingdom_news_sharded (
      id INT AUTO_INCREMENT PRIMARY KEY,
      key_hash VARCHAR(64) NOT NULL,
      kingdom VARCHAR(16) NOT NULL,
      game_date VARCHAR(64) NOT NULL,
      game_date_ord INT,
      event_type VARCHAR(64) NOT NULL,
      raw_text VARCHAR(512) NOT NULL,
      attacker_name VARCHAR(255),
      attacker_kingdom VARCHAR(16),
      defender_name VARCHAR(255),
      defender_kingdom VARCHAR(16),
      acres INT,
      books INT,
      sender_name VARCHAR(255),
      receiver_name VARCHAR(255),
      relation_kingdom VARCHAR(16),
      dragon_type VARCHAR(64),
      dragon_name VARCHAR(255),
      received_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uq_kns (key_hash, kingdom, game_date(64), raw_text(512))
    ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,

    `CREATE INDEX IF NOT EXISTS idx_kingdom_news_sharded_kd_ord ON kingdom_news_sharded(key_hash, kingdom, game_date_ord DESC)`,

    `CREATE TABLE IF NOT EXISTS rob_ops (
      id INT AUTO_INCREMENT PRIMARY KEY,
      province_id INT NOT NULL,
      key_hash VARCHAR(64) NOT NULL,
      op VARCHAR(64) NOT NULL,
      target_name VARCHAR(255),
      target_slot INT,
      target_kingdom VARCHAR(16),
      outcome VARCHAR(64) NOT NULL,
      amount_stolen INT,
      thieves_lost INT NOT NULL DEFAULT 0,
      thieves INT,
      stealth INT,
      troops_assassinated INT,
      kidnapped INT,
      acres_burned INT,
      effect_duration INT,
      saved_by VARCHAR(255),
      received_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_rob_prov FOREIGN KEY (province_id) REFERENCES provinces(id)
    ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,

    `CREATE INDEX IF NOT EXISTS idx_rob_ops_prov ON rob_ops(province_id, key_hash, received_at DESC)`,

    `CREATE TABLE IF NOT EXISTS sorcery_ops (
      id INT AUTO_INCREMENT PRIMARY KEY,
      province_id INT NOT NULL,
      key_hash VARCHAR(64) NOT NULL,
      spell VARCHAR(128) NOT NULL,
      outcome VARCHAR(64) NOT NULL,
      runes_spent INT,
      wizards_lost INT NOT NULL DEFAULT 0,
      duration_days INT,
      target_name VARCHAR(255),
      target_slot INT,
      target_kingdom VARCHAR(16),
      wizards INT,
      runes INT,
      mana INT,
      saved_by VARCHAR(255),
      received_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_sorcery_prov FOREIGN KEY (province_id) REFERENCES provinces(id)
    ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,

    `CREATE INDEX IF NOT EXISTS idx_sorcery_ops_prov ON sorcery_ops(province_id, key_hash, received_at DESC)`,

    `CREATE TABLE IF NOT EXISTS attack_ops (
      id INT AUTO_INCREMENT PRIMARY KEY,
      province_id INT NOT NULL,
      key_hash VARCHAR(64) NOT NULL,
      attack_type VARCHAR(64) NOT NULL,
      outcome VARCHAR(64) NOT NULL,
      target_name VARCHAR(255),
      target_kingdom VARCHAR(16),
      acres_taken INT,
      buildings_survived INT,
      specialist_credits INT,
      peasants_settled INT,
      massacred TINYINT(1),
      enemy_killed INT,
      enemy_imprisoned INT,
      return_days DOUBLE,
      saved_by VARCHAR(255),
      received_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_attack_prov FOREIGN KEY (province_id) REFERENCES provinces(id)
    ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,

    `CREATE INDEX IF NOT EXISTS idx_attack_ops_prov ON attack_ops(province_id, key_hash, received_at DESC)`,

    `CREATE TABLE IF NOT EXISTS intel_ops (
      id INT AUTO_INCREMENT PRIMARY KEY,
      province_id INT NOT NULL,
      key_hash VARCHAR(64) NOT NULL,
      op VARCHAR(64) NOT NULL,
      intel_type VARCHAR(64) NOT NULL,
      outcome VARCHAR(64) NOT NULL,
      target_name VARCHAR(255),
      target_slot INT,
      target_kingdom VARCHAR(16),
      accuracy INT,
      thieves_lost INT NOT NULL DEFAULT 0,
      saved_by VARCHAR(255),
      received_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_intel_ops_prov FOREIGN KEY (province_id) REFERENCES provinces(id)
    ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,

    `CREATE INDEX IF NOT EXISTS idx_intel_ops_prov ON intel_ops(province_id, key_hash, received_at DESC)`,

    // Unique submission indexes (baked in — no additive migrations needed)
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_overview_unique_submission ON province_overview(province_id, key_hash, source, saved_by, received_at)`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_totmil_unique_submission ON total_military_points(province_id, key_hash, source, saved_by, received_at)`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_homemil_unique_submission ON home_military_points(province_id, key_hash, source, saved_by, received_at)`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_troops_unique_submission ON province_troops(province_id, key_hash, source, saved_by, received_at)`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_resources_unique_submission ON province_resources(province_id, key_hash, source, saved_by, received_at)`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_status_unique_submission ON province_status(province_id, key_hash, source, saved_by, received_at)`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_effects_unique_submission ON province_effects(province_id, key_hash, source, saved_by, received_at, effect_name, effect_kind)`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_milintel_unique_submission ON military_intel(province_id, key_hash, source, saved_by, received_at)`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_sos_unique_submission ON sos_intel(province_id, key_hash, source, saved_by, received_at)`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_survey_unique_submission ON survey_intel(province_id, key_hash, source, saved_by, received_at)`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_kingdom_unique_submission ON kingdom_intel(key_hash, location, source, saved_by, received_at)`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_attack_ops_unique_submission ON attack_ops(province_id, key_hash, received_at)`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_rob_ops_unique_submission ON rob_ops(province_id, key_hash, received_at)`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_sorcery_ops_unique_submission ON sorcery_ops(province_id, key_hash, received_at)`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_intel_ops_unique_submission ON intel_ops(province_id, key_hash, received_at)`,
  ];

  for (const stmt of ddl) {
    await pool.query(stmt);
  }

  // Best-effort: raise group_concat limit for long spell/army lists
  try {
    await pool.query("SET GLOBAL group_concat_max_len = 65536");
  } catch {
    // May not have SUPER privilege; ignore
  }
}

// ── Internal transaction helpers ─────────────────────────────────────────────
// All three take a PoolConnection so they can participate in a caller's transaction.

interface IdRow extends RowDataPacket { id: number }
interface KingdomRow2 extends RowDataPacket { kingdom: string }

// Get-or-create a province row; returns its id.
// When kingdom is "", prefer an existing row with the same name and a real kingdom
// (self-intel arrives without a kingdom, but the province already exists from SoT).
export async function ensureProvince(conn: PoolConnection, name: string, kingdom: string): Promise<number> {
  if (!kingdom) {
    const [rows] = await conn.execute<IdRow[]>(
      "SELECT id FROM provinces WHERE name = ? AND kingdom != '' LIMIT 1",
      [name],
    );
    if (rows.length > 0) return rows[0].id;
  }
  await conn.execute(
    "INSERT IGNORE INTO provinces (name, kingdom) VALUES (?, ?)",
    [name, kingdom],
  );
  const [rows] = await conn.execute<IdRow[]>(
    "SELECT id FROM provinces WHERE name = ? AND kingdom = ?",
    [name, kingdom],
  );
  return rows[0].id;
}

// Record that keyHash has access to provinceId (idempotent).
export async function recordSubmission(conn: PoolConnection, keyHash: string, provinceId: number): Promise<void> {
  await conn.execute(
    "INSERT IGNORE INTO intel_partitions (key_hash, province_id) VALUES (?, ?)",
    [keyHash, provinceId],
  );
}

// Bind a key_hash to a kingdom (first write wins; warns on conflict).
export async function bindKeyToKingdom(conn: PoolConnection, keyHash: string, kingdom: string, source: string): Promise<void> {
  const [rows] = await conn.execute<KingdomRow2[]>(
    "SELECT kingdom FROM key_kingdom_bindings WHERE key_hash = ?",
    [keyHash],
  );
  const existing = rows[0];

  if (existing && existing.kingdom !== kingdom) {
    console.warn(
      `[intel ${new Date().toISOString()}] key binding mismatch for ${keyHash.slice(0, 8)}: existing=${existing.kingdom} incoming=${kingdom} source=${source}`,
    );
    return;
  }

  await conn.execute(
    "INSERT IGNORE INTO key_kingdom_bindings (key_hash, kingdom, source) VALUES (?, ?, ?)",
    [keyHash, kingdom, source],
  );
}

// ── Store functions ───────────────────────────────────────────────────────────

export async function storeSoS(data: SoSData, savedBy: string, keyHash: string, isSelf = false, receivedAt?: string): Promise<void> {
  await ensureReady();
  const src = isSelf ? "council_science" : "sos";
  await withTransaction(async (conn) => {
    const provId = await ensureProvince(conn, data.name, data.kingdom);
    await recordSubmission(conn, keyHash, provId);

    const [result] = await conn.execute(
      `INSERT IGNORE INTO sos_intel (province_id, key_hash, source, saved_by, accuracy, received_at)
       VALUES (?, ?, ?, ?, ?, COALESCE(?, NOW()))`,
      [provId, keyHash, src, savedBy, data.accuracy, receivedAt ?? null],
    ) as [ResultSetHeader, unknown];
    if (result.affectedRows === 0) return;

    const sosId = result.insertId;
    for (const s of data.sciences) {
      await conn.execute(
        "INSERT INTO sos_sciences (sos_intel_id, science, books, effect) VALUES (?, ?, ?, ?)",
        [sosId, s.science, s.books, s.effect],
      );
    }
    // queueMetricsCacheRefresh called here once implemented
  });
}

export async function storeSorcery(data: SorceryData, savedBy: string, keyHash: string, receivedAt?: string): Promise<void> {
  await ensureReady();
  await withTransaction(async (conn) => {
    const provId = await ensureProvince(conn, data.name, "");
    await recordSubmission(conn, keyHash, provId);
    const [result] = await conn.execute(
      `INSERT IGNORE INTO sorcery_ops
         (province_id, key_hash, spell, outcome, runes_spent, wizards_lost,
          duration_days, target_name, target_slot, target_kingdom,
          wizards, runes, mana, saved_by, received_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, NOW()))`,
      [
        provId, keyHash, data.spell, data.outcome, data.runesSpent, data.wizardsLost,
        data.durationDays, data.targetName, data.targetSlot, data.targetKingdom,
        data.wizards, data.runes, data.mana, savedBy, receivedAt ?? null,
      ],
    ) as [ResultSetHeader, unknown];
    if (result.affectedRows === 0) return;

    if (data.wizards != null || data.runes != null) {
      await conn.execute(
        `INSERT IGNORE INTO province_resources
           (province_id, key_hash, wizards, runes, mana, source, saved_by, accuracy, received_at)
         VALUES (?, ?, ?, ?, ?, 'sorcery', ?, 100, COALESCE(?, NOW()))`,
        [provId, keyHash, data.wizards, data.runes, data.mana, savedBy, receivedAt ?? null],
      );
    }
  });
}

export async function storeRob(data: RobData, savedBy: string, keyHash: string, receivedAt?: string): Promise<void> {
  await ensureReady();
  await withTransaction(async (conn) => {
    const provId = await ensureProvince(conn, data.name, "");
    await recordSubmission(conn, keyHash, provId);
    const [result] = await conn.execute(
      `INSERT IGNORE INTO rob_ops
         (province_id, key_hash, op, target_name, target_slot, target_kingdom,
          outcome, amount_stolen, thieves_lost, thieves, stealth,
          troops_assassinated, kidnapped, acres_burned, effect_duration,
          saved_by, received_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, NOW()))`,
      [
        provId, keyHash, data.op,
        data.targetName, data.targetSlot, data.targetKingdom,
        data.outcome, data.amountStolen, data.thievesLost,
        data.thieves, data.stealth,
        data.troopsAssassinated, data.kidnapped, data.acresBurned, data.effectDuration,
        savedBy, receivedAt ?? null,
      ],
    ) as [ResultSetHeader, unknown];
    if (result.affectedRows === 0) return;

    if (data.thieves != null) {
      await conn.execute(
        `INSERT IGNORE INTO province_resources
           (province_id, key_hash, thieves, source, saved_by, accuracy, received_at)
         VALUES (?, ?, ?, 'rob', ?, 100, COALESCE(?, NOW()))`,
        [provId, keyHash, data.thieves, savedBy, receivedAt ?? null],
      );
    }
  });
}

export async function storeAttack(data: AttackData, savedBy: string, keyHash: string, receivedAt?: string): Promise<void> {
  await ensureReady();
  await withTransaction(async (conn) => {
    const provId = await ensureProvince(conn, data.name, "");
    await recordSubmission(conn, keyHash, provId);
    await conn.execute(
      `INSERT IGNORE INTO attack_ops
         (province_id, key_hash, attack_type, outcome, target_name, target_kingdom,
          acres_taken, buildings_survived, specialist_credits, peasants_settled,
          massacred, enemy_killed, enemy_imprisoned, return_days, saved_by, received_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, NOW()))`,
      [
        provId, keyHash, data.attackType, data.outcome,
        data.targetName, data.targetKingdom,
        data.acresTaken, data.buildingsSurvived, data.specialistCredits, data.peasantsSettled,
        data.massacred, data.enemyKilled, data.enemyImprisoned, data.returnDays,
        savedBy, receivedAt ?? null,
      ],
    );
  });
}

export async function storeTrainArmy(data: TrainArmyData, savedBy: string, keyHash: string, receivedAt?: string): Promise<void> {
  await ensureReady();
  await withTransaction(async (conn) => {
    const provId = await ensureProvince(conn, data.name, data.kingdom);
    await recordSubmission(conn, keyHash, provId);
    await conn.execute(
      `INSERT IGNORE INTO province_resources
         (province_id, key_hash, free_specialist_credits, source, saved_by, accuracy, received_at)
       VALUES (?, ?, ?, 'train_army', ?, 100, COALESCE(?, NOW()))`,
      [provId, keyHash, data.freeSpecialistCredits, savedBy, receivedAt ?? null],
    );
  });
}

export async function storeBuild(data: BuildData, savedBy: string, keyHash: string, receivedAt?: string): Promise<void> {
  await ensureReady();
  await withTransaction(async (conn) => {
    const provId = await ensureProvince(conn, data.name, data.kingdom);
    await recordSubmission(conn, keyHash, provId);
    await conn.execute(
      `INSERT IGNORE INTO province_resources
         (province_id, key_hash, free_building_credits, source, saved_by, accuracy, received_at)
       VALUES (?, ?, ?, 'build', ?, 100, COALESCE(?, NOW()))`,
      [provId, keyHash, data.freeBuildingCredits, savedBy, receivedAt ?? null],
    );
  });
}

export async function storeInfiltrate(data: InfiltrateData, savedBy: string, keyHash: string): Promise<void> {
  await ensureReady();
  await withTransaction(async (conn) => {
    const provId = await ensureProvince(conn, data.name, data.kingdom);
    await recordSubmission(conn, keyHash, provId);
    await conn.execute(
      `INSERT IGNORE INTO province_resources
         (province_id, key_hash, thieves, source, saved_by, accuracy)
       VALUES (?, ?, ?, 'infiltrate', ?, ?)`,
      [provId, keyHash, data.thieves, savedBy, data.accuracy],
    );
    // updateMetricsCache called here once implemented
  });
}

export async function storeSoD(data: SoDData, savedBy: string, keyHash: string): Promise<void> {
  await ensureReady();
  await withTransaction(async (conn) => {
    const provId = await ensureProvince(conn, data.name, data.kingdom);
    await recordSubmission(conn, keyHash, provId);
    await conn.execute(
      `INSERT IGNORE INTO home_military_points
         (province_id, key_hash, mod_off_at_home, mod_def_at_home, source, saved_by, accuracy)
       VALUES (?, ?, NULL, ?, 'sod', ?, ?)`,
      [provId, keyHash, data.defPoints, savedBy, data.accuracy],
    );
  });
}

async function resolveIntelOpTarget(
  conn: PoolConnection,
  data: IntelOpAttempt,
  keyHash: string,
): Promise<{ targetName: string | null; targetSlot: number | null; targetKingdom: string | null }> {
  interface NameRow extends RowDataPacket { name: string }
  interface SlotRow extends RowDataPacket { slot: number | null }

  let targetName = data.targetName;
  let targetSlot = data.targetSlot;
  const targetKingdom = data.targetKingdom;

  if (targetKingdom && targetName == null && targetSlot != null) {
    const [rows] = await conn.execute<NameRow[]>(
      `SELECT kp.name
       FROM kingdom_provinces kp
       JOIN kingdom_intel ki ON ki.id = kp.kingdom_intel_id
       WHERE ki.key_hash = ? AND ki.location = ? AND kp.slot = ?
       ORDER BY ki.received_at DESC, ki.id DESC
       LIMIT 1`,
      [keyHash, targetKingdom, targetSlot],
    );
    targetName = rows[0]?.name ?? null;
  }

  if (targetKingdom && targetSlot == null && targetName) {
    const [rows] = await conn.execute<SlotRow[]>(
      `SELECT kp.slot
       FROM kingdom_provinces kp
       JOIN kingdom_intel ki ON ki.id = kp.kingdom_intel_id
       WHERE ki.key_hash = ? AND ki.location = ? AND kp.name = ?
       ORDER BY ki.received_at DESC, ki.id DESC
       LIMIT 1`,
      [keyHash, targetKingdom, targetName],
    );
    targetSlot = rows[0]?.slot ?? null;
  }

  return { targetName, targetSlot, targetKingdom };
}

export async function storeIntelOp(data: IntelOpAttempt, savedBy: string, keyHash: string, receivedAt?: string): Promise<void> {
  await ensureReady();
  await withTransaction(async (conn) => {
    const provId = await ensureProvince(conn, savedBy, "");
    await recordSubmission(conn, keyHash, provId);
    const target = await resolveIntelOpTarget(conn, data, keyHash);
    await conn.execute(
      `INSERT IGNORE INTO intel_ops
         (province_id, key_hash, op, intel_type, outcome,
          target_name, target_slot, target_kingdom, accuracy, thieves_lost,
          saved_by, received_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, NOW()))`,
      [
        provId, keyHash, data.op, data.intelType, data.outcome,
        target.targetName, target.targetSlot, target.targetKingdom,
        data.accuracy, data.thievesLost,
        savedBy, receivedAt ?? null,
      ],
    );
  });
}

export async function storeSurvey(data: SurveyData, savedBy: string, keyHash: string, isSelf = false, receivedAt?: string): Promise<void> {
  await ensureReady();
  const src = isSelf ? "council_internal" : "survey";
  await withTransaction(async (conn) => {
    const provId = await ensureProvince(conn, data.name, data.kingdom);
    await recordSubmission(conn, keyHash, provId);

    const [result] = await conn.execute(
      `INSERT IGNORE INTO survey_intel
         (province_id, key_hash, source, saved_by, accuracy,
          thievery_effectiveness, thief_prevent_chance, castles_effect, received_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, NOW()))`,
      [
        provId, keyHash, src, savedBy, data.accuracy,
        data.thieveryEffectiveness ?? null,
        data.thiefPreventChance ?? null,
        data.castlesEffect ?? null,
        receivedAt ?? null,
      ],
    ) as [ResultSetHeader, unknown];
    if (result.affectedRows === 0) return;

    const surveyId = result.insertId;
    for (const b of data.buildings) {
      await conn.execute(
        "INSERT INTO survey_buildings (survey_intel_id, building, built, in_progress) VALUES (?, ?, ?, ?)",
        [surveyId, b.building, b.built, b.inProgress],
      );
    }
    // queueMetricsCacheRefresh called here once implemented
  });
}
