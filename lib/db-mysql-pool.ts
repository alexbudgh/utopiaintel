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
  const ddl: string[] = [
    `CREATE TABLE IF NOT EXISTS provinces (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      kingdom VARCHAR(64) NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      cached_ppa DOUBLE,
      cached_ppa_age DATETIME,
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

    `CREATE INDEX IF NOT EXISTS idx_provinces_kingdom_id ON provinces(kingdom, id)`,

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
    `CREATE INDEX IF NOT EXISTS idx_overview_prov_key_time ON province_overview(province_id, key_hash, received_at)`,

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
      kingdom VARCHAR(64) NOT NULL,
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
    `CREATE INDEX IF NOT EXISTS idx_status_key_kingdom_time_source ON province_status(key_hash, kingdom, received_at DESC, id DESC, source)`,

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
      hostility_meter_visible_until VARCHAR(100),
      open_relations_json TEXT,
      war_doctrines_json TEXT,
      source VARCHAR(64) NOT NULL DEFAULT 'kingdom',
      saved_by VARCHAR(255),
      received_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,

    `CREATE INDEX IF NOT EXISTS idx_kingdom_loc_time ON kingdom_intel(location, received_at DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_kingdom_key_loc_time ON kingdom_intel(key_hash, location, received_at DESC, id DESC)`,

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
      deserters INT,
      deserter_type VARCHAR(50),
      wizards_assassinated INT,
      prisoners_freed INT,
      prisoners_captured INT,
      game_date VARCHAR(64),
      game_date_ord INT,
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
      game_date VARCHAR(64),
      game_date_ord INT,
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
      game_date VARCHAR(64),
      game_date_ord INT,
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
      game_date VARCHAR(64),
      game_date_ord INT,
      saved_by VARCHAR(255),
      received_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_intel_ops_prov FOREIGN KEY (province_id) REFERENCES provinces(id)
    ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,

    `CREATE INDEX IF NOT EXISTS idx_intel_ops_prov ON intel_ops(province_id, key_hash, received_at DESC)`,

    `CREATE TABLE IF NOT EXISTS province_news (
      id INT AUTO_INCREMENT PRIMARY KEY,
      province_id INT NOT NULL,
      key_hash VARCHAR(64) NOT NULL,
      game_date VARCHAR(64) NOT NULL,
      game_date_ord INT,
      event_type VARCHAR(64) NOT NULL,
      raw_text TEXT NOT NULL,
      raw_hash CHAR(64) NOT NULL,
      actor_name VARCHAR(255),
      actor_kingdom VARCHAR(16),
      amount BIGINT,
      resource_type VARCHAR(32) NOT NULL DEFAULT '',
      received_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uq_province_news (key_hash, province_id, game_date(64), raw_hash, event_type, resource_type),
      CONSTRAINT fk_province_news_prov FOREIGN KEY (province_id) REFERENCES provinces(id)
    ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,

    `CREATE INDEX IF NOT EXISTS idx_province_news_prov ON province_news(province_id, key_hash, game_date_ord DESC)`,

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

export async function runMigrations(): Promise<void> {
  await pool.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    id VARCHAR(128) NOT NULL PRIMARY KEY,
    applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);

  const [rows] = await pool.query<any[]>("SELECT id FROM schema_migrations");
  const applied = new Set((rows as any[]).map((r) => r.id as string));

  const migrationsDir = path.join(process.cwd(), "migrations");
  let files: string[];
  try {
    files = fs
      .readdirSync(migrationsDir)
      .filter((f) => f.endsWith(".sql"))
      .sort();
  } catch {
    return;
  }

  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = fs.readFileSync(path.join(migrationsDir, file), "utf8");
    const stmts = sql
      .split(";")
      .map((s) => s.trim())
      .filter(Boolean);
    for (const stmt of stmts) {
      await pool.query(stmt);
    }
    await pool.query("INSERT INTO schema_migrations (id) VALUES (?)", [file]);
    console.log(`[migrations] Applied ${file}`);
  }
}
