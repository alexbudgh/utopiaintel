import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import { BAD_SPELL_NAMES } from "./effects";
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
} from "./parsers/types";

const DB_PATH = process.env.INTEL_DB_PATH || path.join(process.cwd(), "intel.db");
const TTL_DAYS = 7;

let _db: Database.Database | null = null;
const BAD_SPELL_SQL_LIST = BAD_SPELL_NAMES.map((name) => `'${name.replaceAll("'", "''")}'`).join(", ");

export function getDb(): Database.Database {
  if (!_db) {
    fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
    _db = new Database(DB_PATH);
    _db.pragma("journal_mode = WAL");
    _db.pragma("foreign_keys = ON");
    initSchema(_db);
  }
  return _db;
}

function initSchema(db: Database.Database) {
  db.exec(`
    -- Identity only
    CREATE TABLE IF NOT EXISTS provinces (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      kingdom TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(name, kingdom)
    );

    -- Dimension: overview (race, personality, land, nw, honor)
    -- Sources: sot, kingdom
    CREATE TABLE IF NOT EXISTS province_overview (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      province_id INTEGER NOT NULL REFERENCES provinces(id),
      race TEXT,
      personality TEXT,
      honor_title TEXT,
      land INTEGER,
      networth INTEGER,
      source TEXT NOT NULL,
      saved_by TEXT,
      accuracy INTEGER DEFAULT 100,
      received_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_overview_prov_time
      ON province_overview(province_id, received_at DESC);

    -- Dimension: total modified off/def points (province-wide)
    -- Sources: sot only
    CREATE TABLE IF NOT EXISTS total_military_points (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      province_id INTEGER NOT NULL REFERENCES provinces(id),
      off_points INTEGER,
      def_points INTEGER,
      source TEXT NOT NULL DEFAULT 'sot',
      saved_by TEXT,
      accuracy INTEGER DEFAULT 100,
      received_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_totmil_prov_time
      ON total_military_points(province_id, received_at DESC);

    -- Dimension: net modified off/def at home
    -- Sources: som (both), sod (def only)
    CREATE TABLE IF NOT EXISTS home_military_points (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      province_id INTEGER NOT NULL REFERENCES provinces(id),
      mod_off_at_home INTEGER,
      mod_def_at_home INTEGER,
      source TEXT NOT NULL,
      saved_by TEXT,
      accuracy INTEGER DEFAULT 100,
      received_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_homemil_prov_time
      ON home_military_points(province_id, received_at DESC);

    -- Dimension: troop counts at home
    -- Sources: sot (home totals + peasants), som (home army, peasants=NULL)
    CREATE TABLE IF NOT EXISTS province_troops (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      province_id INTEGER NOT NULL REFERENCES provinces(id),
      soldiers INTEGER,
      off_specs INTEGER,
      def_specs INTEGER,
      elites INTEGER,
      war_horses INTEGER,
      peasants INTEGER,
      source TEXT NOT NULL,
      saved_by TEXT,
      accuracy INTEGER DEFAULT 100,
      received_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_troops_prov_time
      ON province_troops(province_id, received_at DESC);

    -- Dimension: resources and economy (sot only)
    CREATE TABLE IF NOT EXISTS province_resources (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      province_id INTEGER NOT NULL REFERENCES provinces(id),
      money INTEGER,
      food INTEGER,
      runes INTEGER,
      prisoners INTEGER,
      trade_balance INTEGER,
      building_efficiency INTEGER,
      thieves INTEGER,
      stealth INTEGER,
      wizards INTEGER,
      mana INTEGER,
      source TEXT NOT NULL DEFAULT 'sot',
      saved_by TEXT,
      accuracy INTEGER DEFAULT 100,
      received_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_resources_prov_time
      ON province_resources(province_id, received_at DESC);

    -- Dimension: status flags (sot only)
    CREATE TABLE IF NOT EXISTS province_status (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      province_id INTEGER NOT NULL REFERENCES provinces(id),
      plagued INTEGER,
      overpopulated INTEGER,
      hit_status TEXT,
      war INTEGER,
      source TEXT NOT NULL DEFAULT 'sot',
      saved_by TEXT,
      received_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_status_prov_time
      ON province_status(province_id, received_at DESC);

    CREATE TABLE IF NOT EXISTS province_effects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      province_id INTEGER NOT NULL REFERENCES provinces(id),
      effect_name TEXT NOT NULL,
      effect_kind TEXT NOT NULL,
      duration_text TEXT,
      remaining_ticks INTEGER,
      effectiveness_percent REAL,
      source TEXT NOT NULL DEFAULT 'sot',
      saved_by TEXT,
      received_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_effects_prov_time
      ON province_effects(province_id, received_at DESC);

    -- Dimension: SoM military effectiveness + army detail (som only)
    CREATE TABLE IF NOT EXISTS military_intel (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      province_id INTEGER NOT NULL REFERENCES provinces(id),
      ome REAL,
      dme REAL,
      source TEXT NOT NULL DEFAULT 'som',
      saved_by TEXT,
      accuracy INTEGER DEFAULT 100,
      received_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_milintel_prov_time
      ON military_intel(province_id, received_at DESC);

    -- Child: per-army breakdown
    CREATE TABLE IF NOT EXISTS som_armies (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      military_intel_id INTEGER NOT NULL REFERENCES military_intel(id) ON DELETE CASCADE,
      army_type TEXT NOT NULL,
      generals INTEGER DEFAULT 0,
      soldiers INTEGER DEFAULT 0,
      off_specs INTEGER DEFAULT 0,
      def_specs INTEGER DEFAULT 0,
      elites INTEGER DEFAULT 0,
      war_horses INTEGER DEFAULT 0,
      thieves INTEGER DEFAULT 0,
      land_gained INTEGER DEFAULT 0,
      return_days REAL
    );

    -- Dimension: survey (survey only)
    CREATE TABLE IF NOT EXISTS survey_intel (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      province_id INTEGER NOT NULL REFERENCES provinces(id),
      source TEXT NOT NULL DEFAULT 'survey',
      saved_by TEXT,
      accuracy INTEGER DEFAULT 100,
      received_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_survey_prov_time
      ON survey_intel(province_id, received_at DESC);

    CREATE TABLE IF NOT EXISTS survey_buildings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      survey_intel_id INTEGER NOT NULL REFERENCES survey_intel(id) ON DELETE CASCADE,
      building TEXT NOT NULL,
      built INTEGER NOT NULL DEFAULT 0,
      in_progress INTEGER NOT NULL DEFAULT 0
    );

    -- Dimension: sciences (sos only)
    CREATE TABLE IF NOT EXISTS sos_intel (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      province_id INTEGER NOT NULL REFERENCES provinces(id),
      source TEXT NOT NULL DEFAULT 'sos',
      saved_by TEXT,
      accuracy INTEGER DEFAULT 100,
      received_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_sos_prov_time
      ON sos_intel(province_id, received_at DESC);

    CREATE TABLE IF NOT EXISTS sos_sciences (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sos_intel_id INTEGER NOT NULL REFERENCES sos_intel(id) ON DELETE CASCADE,
      science TEXT NOT NULL,
      books INTEGER NOT NULL DEFAULT 0,
      effect REAL NOT NULL DEFAULT 0
    );

    -- Auth partitioning: maps key_hash → province_id
    CREATE TABLE IF NOT EXISTS intel_partitions (
      key_hash TEXT NOT NULL,
      province_id INTEGER NOT NULL REFERENCES provinces(id),
      PRIMARY KEY (key_hash, province_id)
    );

    CREATE TABLE IF NOT EXISTS key_kingdom_bindings (
      key_hash TEXT PRIMARY KEY,
      kingdom TEXT NOT NULL,
      source TEXT NOT NULL,
      bound_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Kingdom-level intel
    CREATE TABLE IF NOT EXISTS kingdom_intel (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      location TEXT NOT NULL,
      war_target TEXT,
      their_attitude_to_us TEXT,
      their_attitude_points REAL,
      our_attitude_to_them TEXT,
      our_attitude_points REAL,
      hostility_meter_visible_until TEXT,
      open_relations_json TEXT,
      source TEXT NOT NULL DEFAULT 'kingdom',
      saved_by TEXT,
      received_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_kingdom_loc_time
      ON kingdom_intel(location, received_at DESC);

    CREATE TABLE IF NOT EXISTS kingdom_provinces (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      kingdom_intel_id INTEGER NOT NULL REFERENCES kingdom_intel(id) ON DELETE CASCADE,
      slot INTEGER,
      name TEXT NOT NULL,
      race TEXT NOT NULL,
      land INTEGER NOT NULL,
      networth INTEGER NOT NULL,
      honor_title TEXT
    );
  `);

  // Additive migrations
  const hasCol = (table: string, col: string) =>
    (db.prepare(`SELECT COUNT(*) as n FROM pragma_table_info('${table}') WHERE name='${col}'`).get() as { n: number }).n > 0;
  if (!hasCol("survey_intel", "thievery_effectiveness")) db.exec("ALTER TABLE survey_intel ADD COLUMN thievery_effectiveness REAL");
  if (!hasCol("survey_intel", "thief_prevent_chance"))   db.exec("ALTER TABLE survey_intel ADD COLUMN thief_prevent_chance REAL");
  if (!hasCol("survey_intel", "castles_effect"))         db.exec("ALTER TABLE survey_intel ADD COLUMN castles_effect REAL");
  if (!hasCol("province_effects", "remaining_ticks")) db.exec("ALTER TABLE province_effects ADD COLUMN remaining_ticks INTEGER");
  if (!hasCol("province_effects", "effectiveness_percent")) db.exec("ALTER TABLE province_effects ADD COLUMN effectiveness_percent REAL");
  if (!hasCol("kingdom_intel", "their_attitude_to_us")) db.exec("ALTER TABLE kingdom_intel ADD COLUMN their_attitude_to_us TEXT");
  if (!hasCol("kingdom_intel", "their_attitude_points")) db.exec("ALTER TABLE kingdom_intel ADD COLUMN their_attitude_points REAL");
  if (!hasCol("kingdom_intel", "our_attitude_to_them")) db.exec("ALTER TABLE kingdom_intel ADD COLUMN our_attitude_to_them TEXT");
  if (!hasCol("kingdom_intel", "our_attitude_points")) db.exec("ALTER TABLE kingdom_intel ADD COLUMN our_attitude_points REAL");
  if (!hasCol("kingdom_intel", "hostility_meter_visible_until")) db.exec("ALTER TABLE kingdom_intel ADD COLUMN hostility_meter_visible_until TEXT");
  if (!hasCol("kingdom_intel", "open_relations_json")) db.exec("ALTER TABLE kingdom_intel ADD COLUMN open_relations_json TEXT");
  if (!hasCol("kingdom_provinces", "slot")) db.exec("ALTER TABLE kingdom_provinces ADD COLUMN slot INTEGER");
}

// Get or create province identity, return ID
function ensureProvince(db: Database.Database, name: string, kingdom: string): number {
  // Self-intel (council_state/som/sos) arrives with kingdom="". Prefer an existing
  // province row with the same name and a real kingdom rather than creating a ghost.
  if (!kingdom) {
    const existing = db.prepare("SELECT id FROM provinces WHERE name = ? AND kingdom != '' LIMIT 1").get(name) as { id: number } | undefined;
    if (existing) return existing.id;
  }
  db.prepare("INSERT OR IGNORE INTO provinces (name, kingdom) VALUES (?, ?)").run(name, kingdom);
  const row = db.prepare("SELECT id FROM provinces WHERE name = ? AND kingdom = ?").get(name, kingdom) as { id: number };
  return row.id;
}

function recordSubmission(db: Database.Database, keyHash: string, provinceId: number) {
  db.prepare("INSERT OR IGNORE INTO intel_partitions (key_hash, province_id) VALUES (?, ?)").run(keyHash, provinceId);
}

function bindKeyToKingdom(db: Database.Database, keyHash: string, kingdom: string, source: string) {
  const existing = db.prepare(
    "SELECT kingdom FROM key_kingdom_bindings WHERE key_hash = ?"
  ).get(keyHash) as { kingdom: string } | undefined;

  if (existing && existing.kingdom !== kingdom) {
    console.warn(
      `[intel ${new Date().toISOString()}] key binding mismatch for ${keyHash.slice(0, 8)}: existing=${existing.kingdom} incoming=${kingdom} source=${source}`,
    );
    return;
  }

  db.prepare(`
    INSERT INTO key_kingdom_bindings (key_hash, kingdom, source)
    VALUES (?, ?, ?)
    ON CONFLICT(key_hash) DO NOTHING
  `).run(keyHash, kingdom, source);
}

export function storeSoT(data: SoTData, savedBy: string, keyHash: string, isSelfThrone = false) {
  const db = getDb();
  db.transaction(() => {
    const provId = ensureProvince(db, data.name, data.kingdom);
    recordSubmission(db, keyHash, provId);
    if (isSelfThrone && data.kingdom) {
      bindKeyToKingdom(db, keyHash, data.kingdom, "throne");
    }

    // 1. Overview
    db.prepare(`
      INSERT INTO province_overview (province_id, race, personality, honor_title, land, networth, source, saved_by, accuracy)
      VALUES (?, ?, ?, ?, ?, ?, 'sot', ?, ?)
    `).run(provId, data.race, data.personality ?? null, data.honorTitle ?? null, data.land, data.networth, savedBy, data.accuracy);

    // 2. Total military points (province-wide)
    db.prepare(`
      INSERT INTO total_military_points (province_id, off_points, def_points, saved_by, accuracy)
      VALUES (?, ?, ?, ?, ?)
    `).run(provId, data.offPoints, data.defPoints, savedBy, data.accuracy);

    // 3. Troops at home
    db.prepare(`
      INSERT INTO province_troops (province_id, soldiers, off_specs, def_specs, elites, war_horses, peasants, source, saved_by, accuracy)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'sot', ?, ?)
    `).run(provId, data.soldiers, data.offSpecs, data.defSpecs, data.elites, data.warHorses, data.peasants, savedBy, data.accuracy);

    // 4. Resources
    db.prepare(`
      INSERT INTO province_resources (province_id, money, food, runes, prisoners, trade_balance, building_efficiency, thieves, stealth, wizards, mana, saved_by, accuracy)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(provId, data.money, data.food, data.runes, data.prisoners, data.tradeBalance, data.buildingEfficiency, data.thieves, data.stealth, data.wizards, data.mana, savedBy, data.accuracy);

    // 5. Status
    db.prepare(`
      INSERT INTO province_status (province_id, plagued, overpopulated, hit_status, war, saved_by)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(provId, data.plagued ? 1 : 0, data.overpopulated ? 1 : 0, data.hitStatus, data.war ? 1 : 0, savedBy);

    const insertEffect = db.prepare(`
      INSERT INTO province_effects (province_id, effect_name, effect_kind, duration_text, remaining_ticks, effectiveness_percent, source, saved_by)
      VALUES (?, ?, ?, ?, ?, ?, 'sot', ?)
    `);
    for (const effect of data.activeEffects) {
      insertEffect.run(
        provId,
        effect.name,
        effect.kind,
        effect.durationText,
        effect.remainingTicks,
        effect.effectivenessPercent,
        savedBy,
      );
    }
  })();
}

export function storeSoD(data: SoDData, savedBy: string, keyHash: string) {
  const db = getDb();
  db.transaction(() => {
    const provId = ensureProvince(db, data.name, data.kingdom);
    recordSubmission(db, keyHash, provId);

    // SoD returns net modified def at home
    db.prepare(`
      INSERT INTO home_military_points (province_id, mod_off_at_home, mod_def_at_home, source, saved_by, accuracy)
      VALUES (?, NULL, ?, 'sod', ?, ?)
    `).run(provId, data.defPoints, savedBy, data.accuracy);
  })();
}

export function storeInfiltrate(data: InfiltrateData, savedBy: string, keyHash: string) {
  const db = getDb();
  db.transaction(() => {
    const provId = ensureProvince(db, data.name, data.kingdom);
    recordSubmission(db, keyHash, provId);
    db.prepare(`
      INSERT INTO province_resources (province_id, thieves, source, saved_by, accuracy)
      VALUES (?, ?, 'infiltrate', ?, ?)
    `).run(provId, data.thieves, savedBy, data.accuracy);
  })();
}

export function storeSoM(data: SoMData, savedBy: string, keyHash: string) {
  const db = getDb();
  db.transaction(() => {
    const provId = ensureProvince(db, data.name, data.kingdom);
    recordSubmission(db, keyHash, provId);

    // Troops at home from SoM home army
    const homeArmy = data.armies.find((a) => a.armyType === "home");
    if (homeArmy) {
      db.prepare(`
        INSERT INTO province_troops (province_id, soldiers, off_specs, def_specs, elites, war_horses, peasants, source, saved_by, accuracy)
        VALUES (?, ?, ?, ?, ?, ?, NULL, 'som', ?, ?)
      `).run(provId, homeArmy.soldiers, homeArmy.offSpecs, homeArmy.defSpecs, homeArmy.elites, homeArmy.warHorses, savedBy, data.accuracy);
    }

    // Net modified off/def at home
    db.prepare(`
      INSERT INTO home_military_points (province_id, mod_off_at_home, mod_def_at_home, source, saved_by, accuracy)
      VALUES (?, ?, ?, 'som', ?, ?)
    `).run(provId, data.netOffense, data.netDefense, savedBy, data.accuracy);

    // Military effectiveness + army detail
    const result = db.prepare(`
      INSERT INTO military_intel (province_id, ome, dme, saved_by, accuracy)
      VALUES (?, ?, ?, ?, ?)
    `).run(provId, data.ome, data.dme, savedBy, data.accuracy);

    const milIntelId = result.lastInsertRowid;

    // Army breakdown
    const ins = db.prepare(`
      INSERT INTO som_armies (military_intel_id, army_type, generals, soldiers, off_specs, def_specs, elites, war_horses, thieves, land_gained, return_days)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const a of data.armies) {
      ins.run(milIntelId, a.armyType, a.generals, a.soldiers, a.offSpecs, a.defSpecs, a.elites, a.warHorses, a.thieves, a.landGained, a.returnDays);
    }
  })();
}

export function storeSoS(data: SoSData, savedBy: string, keyHash: string) {
  const db = getDb();
  db.transaction(() => {
    const provId = ensureProvince(db, data.name, data.kingdom);
    recordSubmission(db, keyHash, provId);

    const result = db.prepare(`
      INSERT INTO sos_intel (province_id, saved_by, accuracy)
      VALUES (?, ?, ?)
    `).run(provId, savedBy, data.accuracy);

    const sosId = result.lastInsertRowid;
    const ins = db.prepare("INSERT INTO sos_sciences (sos_intel_id, science, books, effect) VALUES (?, ?, ?, ?)");
    for (const s of data.sciences) {
      ins.run(sosId, s.science, s.books, s.effect);
    }
  })();
}

export function storeSurvey(data: SurveyData, savedBy: string, keyHash: string) {
  const db = getDb();
  db.transaction(() => {
    const provId = ensureProvince(db, data.name, data.kingdom);
    recordSubmission(db, keyHash, provId);

    const result = db.prepare(`
      INSERT INTO survey_intel (province_id, saved_by, accuracy, thievery_effectiveness, thief_prevent_chance, castles_effect)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      provId,
      savedBy,
      data.accuracy,
      data.thieveryEffectiveness ?? null,
      data.thiefPreventChance ?? null,
      data.castlesEffect ?? null,
    );

    const surveyId = result.lastInsertRowid;
    const ins = db.prepare("INSERT INTO survey_buildings (survey_intel_id, building, built, in_progress) VALUES (?, ?, ?, ?)");
    for (const b of data.buildings) {
      ins.run(surveyId, b.building, b.built, b.inProgress);
    }
  })();
}

export function storeKingdom(data: KingdomData, savedBy: string, keyHash: string) {
  const db = getDb();
  db.transaction(() => {
    const result = db.prepare(`
      INSERT INTO kingdom_intel (
        name, location, war_target,
        their_attitude_to_us, their_attitude_points,
        our_attitude_to_them, our_attitude_points,
        hostility_meter_visible_until, open_relations_json, saved_by
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      data.name,
      data.location,
      data.warTarget,
      data.theirAttitudeToUs,
      data.theirAttitudePoints,
      data.ourAttitudeToThem,
      data.ourAttitudePoints,
      data.hostilityMeterVisibleUntil,
      JSON.stringify(data.openRelations),
      savedBy,
    );

    const kdId = result.lastInsertRowid;
    const ins = db.prepare("INSERT INTO kingdom_provinces (kingdom_intel_id, slot, name, race, land, networth, honor_title) VALUES (?, ?, ?, ?, ?, ?, ?)");

    for (const p of data.provinces) {
      const provId = ensureProvince(db, p.name, data.location);
      recordSubmission(db, keyHash, provId);
      ins.run(kdId, p.slot, p.name, p.race, p.land, p.networth, p.honorTitle);

      // Also write to province_overview
      db.prepare(`
        INSERT INTO province_overview (province_id, race, personality, honor_title, land, networth, source, saved_by)
        VALUES (?, ?, NULL, ?, ?, ?, 'kingdom', ?)
      `).run(provId, p.race, p.honorTitle, p.land, p.networth, savedBy);
    }
  })();
}

export function storeState(data: StateData, savedBy: string, keyHash: string) {
  const db = getDb();
  db.transaction(() => {
    const provId = ensureProvince(db, data.name, data.kingdom);
    recordSubmission(db, keyHash, provId);

    // Overview: land and networth (no race/personality from council_state)
    db.prepare(`
      INSERT INTO province_overview (province_id, land, networth, source, saved_by, accuracy)
      VALUES (?, ?, ?, 'state', ?, 100)
    `).run(provId, data.land, data.networth, savedBy);

    // Resources: thieves and wizards (self-intel is always 100% accurate)
    db.prepare(`
      INSERT INTO province_resources (province_id, thieves, wizards, source, saved_by, accuracy)
      VALUES (?, ?, ?, 'state', ?, 100)
    `).run(provId, data.thieves, data.wizards, savedBy);

    // Peasants live in province_troops
    db.prepare(`
      INSERT INTO province_troops (province_id, peasants, source, saved_by, accuracy)
      VALUES (?, ?, 'state', ?, 100)
    `).run(provId, data.peasants, savedBy);
  })();
}

// ── Read queries ────────────────────────────────────────────────────────────

export interface KingdomRow {
  location: string;
  province_count: number;
  last_seen: string | null;
}

export interface KingdomSnapshotProvince {
  slot: number | null;
  name: string;
  race: string;
  land: number;
  networth: number;
  honorTitle: string | null;
}

export interface KingdomSnapshot {
  id: number;
  name: string;
  location: string;
  warTarget: string | null;
  theirAttitudeToUs: string | null;
  theirAttitudePoints: number | null;
  ourAttitudeToThem: string | null;
  ourAttitudePoints: number | null;
  hostilityMeterVisibleUntil: string | null;
  openRelations: KingdomOpenRelation[];
  receivedAt: string;
  provinces: KingdomSnapshotProvince[];
}

export function getBoundKingdom(keyHash: string): string | null {
  const db = getDb();
  const row = db.prepare(
    "SELECT kingdom FROM key_kingdom_bindings WHERE key_hash = ?"
  ).get(keyHash) as { kingdom: string } | undefined;
  return row?.kingdom ?? null;
}

export function getKingdoms(keyHash: string): KingdomRow[] {
  const db = getDb();
  return db.prepare(`
    SELECT p.kingdom AS location,
           COUNT(DISTINCT p.id) AS province_count,
           MAX(po.received_at) AS last_seen
    FROM provinces p
    LEFT JOIN province_overview po ON po.province_id = p.id
    WHERE p.kingdom != ''
      AND EXISTS (
        SELECT 1 FROM intel_partitions
        WHERE key_hash = ? AND province_id = p.id
      )
    GROUP BY p.kingdom
    ORDER BY last_seen DESC
  `).all(keyHash) as KingdomRow[];
}

export function getLatestKingdomSnapshot(location: string, keyHash: string): KingdomSnapshot | null {
  const db = getDb();
  const snapshot = db.prepare(`
    SELECT ki.id, ki.name, ki.location, ki.war_target,
           ki.their_attitude_to_us, ki.their_attitude_points,
           ki.our_attitude_to_them, ki.our_attitude_points,
           ki.hostility_meter_visible_until, ki.open_relations_json,
           ki.received_at
    FROM kingdom_intel ki
    WHERE ki.location = ?
      AND NOT EXISTS (
        SELECT 1
        FROM kingdom_provinces kp
        WHERE kp.kingdom_intel_id = ki.id
          AND NOT EXISTS (
            SELECT 1
            FROM provinces p
            JOIN intel_partitions ip
              ON ip.province_id = p.id
             AND ip.key_hash = ?
            WHERE p.name = kp.name
              AND p.kingdom = ki.location
          )
      )
    ORDER BY ki.received_at DESC
    LIMIT 1
  `).get(location, keyHash) as {
    id: number;
    name: string;
    location: string;
    war_target: string | null;
    their_attitude_to_us: string | null;
    their_attitude_points: number | null;
    our_attitude_to_them: string | null;
    our_attitude_points: number | null;
    hostility_meter_visible_until: string | null;
    open_relations_json: string | null;
    received_at: string;
  } | undefined;

  if (!snapshot) return null;

  const provinces = db.prepare(`
    SELECT slot, name, race, land, networth, honor_title
    FROM kingdom_provinces
    WHERE kingdom_intel_id = ?
    ORDER BY networth DESC, name ASC
  `).all(snapshot.id) as {
    slot: number | null;
    name: string;
    race: string;
    land: number;
    networth: number;
    honor_title: string | null;
  }[];

  return {
    id: snapshot.id,
    name: snapshot.name,
    location: snapshot.location,
    warTarget: snapshot.war_target,
    theirAttitudeToUs: snapshot.their_attitude_to_us,
    theirAttitudePoints: snapshot.their_attitude_points,
    ourAttitudeToThem: snapshot.our_attitude_to_them,
    ourAttitudePoints: snapshot.our_attitude_points,
    hostilityMeterVisibleUntil: snapshot.hostility_meter_visible_until,
    openRelations: snapshot.open_relations_json ? JSON.parse(snapshot.open_relations_json) as KingdomOpenRelation[] : [],
    receivedAt: snapshot.received_at,
    provinces: provinces.map((p) => ({
      slot: p.slot,
      name: p.name,
      race: p.race,
      land: p.land,
      networth: p.networth,
      honorTitle: p.honor_title,
    })),
  };
}

export interface ProvinceRow {
  id: number;
  slot: number | null;
  name: string;
  kingdom: string;
  race: string | null;
  personality: string | null;
  land: number | null;
  networth: number | null;
  overview_age: string | null;
  overview_source: string | null;
  off_points: number | null;
  def_points: number | null;
  military_age: string | null;
  soldiers: number | null;
  off_specs: number | null;
  def_specs: number | null;
  elites: number | null;
  war_horses: number | null;
  peasants: number | null;
  troops_age: string | null;
  troops_source: string | null;
  soldiers_home: number | null;
  off_specs_home: number | null;
  def_specs_home: number | null;
  elites_home: number | null;
  troops_home_age: string | null;
  off_home: number | null;
  def_home: number | null;
  home_mil_age: string | null;
  money: number | null;
  food: number | null;
  runes: number | null;
  prisoners: number | null;
  trade_balance: number | null;
  building_efficiency: number | null;
  thieves: number | null;
  thieves_age: string | null;
  wizards: number | null;
  resources_age: string | null;
  resources_source: string | null;
  hit_status: string | null;
  status_age: string | null;
  effects_age?: string | null;
  good_spell_details?: string | null;
  bad_spell_details?: string | null;
  good_spell_count?: number | null;
  bad_spell_count?: number | null;
  ome: number | null;
  dme: number | null;
  som_age: string | null;
  sciences_age: string | null;
  crime_effect: number | null;
  channeling_effect: number | null;
  siege_effect: number | null;
  science_total_books: number | null;
  survey_age: string | null;
  watch_towers_effect: number | null;
  thieves_dens_effect: number | null;
  castles_effect: number | null;
  buildings_built: number | null;
  buildings_in_progress: number | null;
  armies_out_count: number | null;
  land_incoming: number | null;
  earliest_return: number | null;
}

export function getKingdomProvinces(kingdom: string, keyHash: string): ProvinceRow[] {
  const db = getDb();
  return db.prepare(`
    WITH latest_effects AS (
      SELECT province_id, effect_name, effect_kind, remaining_ticks, received_at,
             row_number() OVER (
               PARTITION BY province_id, effect_name, effect_kind
               ORDER BY received_at DESC, id DESC
             ) AS rn
      FROM province_effects
    ),
    spell_summary AS (
      SELECT province_id,
             MAX(received_at) AS effects_age,
             group_concat(CASE WHEN effect_kind = 'spell' AND effect_name NOT IN (${BAD_SPELL_SQL_LIST}) THEN effect_name || CASE WHEN remaining_ticks IS NOT NULL THEN ' (' || remaining_ticks || ')' ELSE '' END END, ' | ') AS good_spell_details,
             group_concat(CASE WHEN effect_kind = 'spell' AND effect_name IN (${BAD_SPELL_SQL_LIST}) THEN effect_name || CASE WHEN remaining_ticks IS NOT NULL THEN ' (' || remaining_ticks || ')' ELSE '' END END, ' | ') AS bad_spell_details,
             SUM(CASE WHEN effect_kind = 'spell' AND effect_name NOT IN (${BAD_SPELL_SQL_LIST}) THEN 1 ELSE 0 END) AS good_spell_count,
             SUM(CASE WHEN effect_kind = 'spell' AND effect_name IN (${BAD_SPELL_SQL_LIST}) THEN 1 ELSE 0 END) AS bad_spell_count
      FROM latest_effects
      WHERE rn = 1
      GROUP BY province_id
    )
    SELECT p.id, p.name, p.kingdom,
           (
             SELECT kp.slot
             FROM kingdom_intel ki
             JOIN kingdom_provinces kp
               ON kp.kingdom_intel_id = ki.id
             WHERE ki.location = p.kingdom
               AND kp.name = p.name
               AND NOT EXISTS (
                 SELECT 1
                 FROM kingdom_provinces kp2
                 WHERE kp2.kingdom_intel_id = ki.id
                   AND NOT EXISTS (
                     SELECT 1
                     FROM provinces p2
                     JOIN intel_partitions ip2
                       ON ip2.province_id = p2.id
                      AND ip2.key_hash = ?
                     WHERE p2.name = kp2.name
                       AND p2.kingdom = ki.location
                   )
               )
             ORDER BY ki.received_at DESC
             LIMIT 1
           ) AS slot,
           po.race, po.personality, po.land, po.networth, po.received_at AS overview_age, po.source AS overview_source,
           tmp.off_points, tmp.def_points, tmp.received_at AS military_age,
           pt.soldiers, pt.off_specs, pt.def_specs, pt.elites, pt.war_horses, pt.peasants, pt.received_at AS troops_age, pt.source AS troops_source,
           pt_home.soldiers AS soldiers_home, pt_home.off_specs AS off_specs_home, pt_home.def_specs AS def_specs_home, pt_home.elites AS elites_home, pt_home.received_at AS troops_home_age,
           pr.money, pr.food, pr.runes, pr.prisoners, pr.trade_balance, pr.building_efficiency, pr.wizards, pr.received_at AS resources_age, pr.source AS resources_source,
           (SELECT p2.thieves FROM province_resources p2 WHERE p2.province_id = p.id AND p2.thieves IS NOT NULL ORDER BY p2.received_at DESC LIMIT 1) AS thieves,
           (SELECT p2.received_at FROM province_resources p2 WHERE p2.province_id = p.id AND p2.thieves IS NOT NULL ORDER BY p2.received_at DESC LIMIT 1) AS thieves_age,
           ps.hit_status, ps.received_at AS status_age,
           ss.effects_age, ss.good_spell_details, ss.bad_spell_details, ss.good_spell_count, ss.bad_spell_count,
           hmp.mod_off_at_home AS off_home, hmp.mod_def_at_home AS def_home, hmp.received_at AS home_mil_age,
           mi.ome, mi.dme, mi.received_at AS som_age,
           (SELECT si.received_at FROM sos_intel si WHERE si.province_id = p.id ORDER BY si.received_at DESC LIMIT 1) AS sciences_age,
           (SELECT ss.effect FROM sos_intel si JOIN sos_sciences ss ON ss.sos_intel_id = si.id WHERE si.province_id = p.id AND ss.science = 'Crime' ORDER BY si.received_at DESC LIMIT 1) AS crime_effect,
           (SELECT ss.effect FROM sos_intel si JOIN sos_sciences ss ON ss.sos_intel_id = si.id WHERE si.province_id = p.id AND ss.science = 'Siege' ORDER BY si.received_at DESC LIMIT 1) AS siege_effect,
           (SELECT si.received_at FROM survey_intel si WHERE si.province_id = p.id ORDER BY si.received_at DESC LIMIT 1) AS survey_age,
           (SELECT si.thief_prevent_chance FROM survey_intel si WHERE si.province_id = p.id ORDER BY si.received_at DESC LIMIT 1) AS watch_towers_effect,
           (SELECT si.thievery_effectiveness FROM survey_intel si WHERE si.province_id = p.id ORDER BY si.received_at DESC LIMIT 1) AS thieves_dens_effect,
           (SELECT si.castles_effect FROM survey_intel si WHERE si.province_id = p.id ORDER BY si.received_at DESC LIMIT 1) AS castles_effect,
           (SELECT ss.effect FROM sos_intel si JOIN sos_sciences ss ON ss.sos_intel_id = si.id WHERE si.province_id = p.id AND ss.science = 'Channeling' ORDER BY si.received_at DESC LIMIT 1) AS channeling_effect,
           (SELECT SUM(ss.books) FROM sos_sciences ss WHERE ss.sos_intel_id = (SELECT id FROM sos_intel WHERE province_id = p.id ORDER BY received_at DESC LIMIT 1)) AS science_total_books,
           (SELECT SUM(sb.built) FROM survey_buildings sb WHERE sb.survey_intel_id = (SELECT id FROM survey_intel WHERE province_id = p.id ORDER BY received_at DESC LIMIT 1) AND sb.building != 'Barren Land') AS buildings_built,
           (SELECT SUM(sb.in_progress) FROM survey_buildings sb WHERE sb.survey_intel_id = (SELECT id FROM survey_intel WHERE province_id = p.id ORDER BY received_at DESC LIMIT 1)) AS buildings_in_progress,
           (SELECT COUNT(*) FROM som_armies WHERE military_intel_id = mi.id AND return_days IS NOT NULL) AS armies_out_count,
           (SELECT SUM(land_gained) FROM som_armies WHERE military_intel_id = mi.id AND return_days IS NOT NULL) AS land_incoming,
           (SELECT MIN(return_days) FROM som_armies WHERE military_intel_id = mi.id AND return_days IS NOT NULL) AS earliest_return
    FROM provinces p
    LEFT JOIN province_overview po ON po.id = (
      SELECT id FROM province_overview
      WHERE province_id = p.id ORDER BY received_at DESC LIMIT 1
    )
    LEFT JOIN total_military_points tmp ON tmp.id = (
      SELECT id FROM total_military_points
      WHERE province_id = p.id ORDER BY received_at DESC LIMIT 1
    )
    LEFT JOIN province_troops pt ON pt.id = (
      SELECT id FROM province_troops
      WHERE province_id = p.id AND source IN ('sot', 'state') ORDER BY received_at DESC LIMIT 1
    )
    LEFT JOIN province_troops pt_home ON pt_home.id = (
      SELECT id FROM province_troops
      WHERE province_id = p.id AND source = 'som' ORDER BY received_at DESC LIMIT 1
    )
    LEFT JOIN province_resources pr ON pr.id = (
      SELECT id FROM province_resources
      WHERE province_id = p.id AND source != 'infiltrate' ORDER BY received_at DESC LIMIT 1
    )
    LEFT JOIN province_status ps ON ps.id = (
      SELECT id FROM province_status
      WHERE province_id = p.id ORDER BY received_at DESC LIMIT 1
    )
    LEFT JOIN spell_summary ss ON ss.province_id = p.id
    LEFT JOIN home_military_points hmp ON hmp.id = (
      SELECT id FROM home_military_points
      WHERE province_id = p.id ORDER BY received_at DESC LIMIT 1
    )
    LEFT JOIN military_intel mi ON mi.id = (
      SELECT id FROM military_intel
      WHERE province_id = p.id ORDER BY received_at DESC LIMIT 1
    )
    WHERE p.kingdom = ?
      AND EXISTS (
        SELECT 1 FROM intel_partitions
        WHERE key_hash = ? AND province_id = p.id
      )
    ORDER BY po.networth DESC NULLS LAST
  `).all(keyHash, kingdom, keyHash) as ProvinceRow[];
}

export interface ArmyRow {
  armyType: string;
  generals: number;
  soldiers: number;
  offSpecs: number;
  defSpecs: number;
  elites: number;
  warHorses: number;
  thieves: number;
  landGained: number;
  returnDays: number | null;
}

export interface BuildingRow {
  building: string;
  built: number;
  inProgress: number;
}

export interface ScienceRow {
  science: string;
  books: number;
  effect: number;
}

export interface ProvinceDetail {
  province: { id: number; name: string; kingdom: string } | null;
  overview: { race: string | null; personality: string | null; honorTitle: string | null; land: number | null; networth: number | null; source: string; savedBy: string | null; receivedAt: string } | null;
  totalMilitary: { offPoints: number | null; defPoints: number | null; receivedAt: string } | null;
  homeMilitary: { modOffAtHome: number | null; modDefAtHome: number | null; source: string; receivedAt: string } | null;
  troops: { soldiers: number | null; offSpecs: number | null; defSpecs: number | null; elites: number | null; warHorses: number | null; peasants: number | null; source: string; receivedAt: string } | null;
  resources: { money: number | null; food: number | null; runes: number | null; prisoners: number | null; tradeBalance: number | null; buildingEfficiency: number | null; thieves: number | null; stealth: number | null; wizards: number | null; mana: number | null; receivedAt: string } | null;
  status: { plagued: boolean; overpopulated: boolean; hitStatus: string | null; war: boolean; receivedAt: string } | null;
  effects: { name: string; kind: string; durationText: string | null; remainingTicks: number | null; effectivenessPercent: number | null; receivedAt: string }[];
  militaryIntel: { ome: number | null; dme: number | null; receivedAt: string; armies: ArmyRow[] } | null;
  survey: { receivedAt: string; buildings: BuildingRow[] } | null;
  sciences: { receivedAt: string; sciences: ScienceRow[] } | null;
}

export interface KingdomRitual {
  name: string;
  remainingTicks: number | null;
  effectivenessPercent: number | null;
  receivedAt: string;
}

export function getKingdomRitual(kingdom: string, keyHash: string): KingdomRitual | null {
  const db = getDb();
  const row = db.prepare(`
    SELECT pe.effect_name, pe.remaining_ticks, pe.effectiveness_percent, pe.received_at
    FROM province_effects pe
    JOIN provinces p ON p.id = pe.province_id
    JOIN intel_partitions ip ON ip.province_id = p.id AND ip.key_hash = ?
    WHERE p.kingdom = ? AND pe.effect_kind = 'ritual'
    ORDER BY pe.received_at DESC, pe.id DESC
    LIMIT 1
  `).get(keyHash, kingdom) as { effect_name: string; remaining_ticks: number | null; effectiveness_percent: number | null; received_at: string } | undefined;
  if (!row) return null;
  return { name: row.effect_name, remainingTicks: row.remaining_ticks, effectivenessPercent: row.effectiveness_percent, receivedAt: row.received_at };
}

export function getProvinceDetail(name: string, kingdom: string, keyHash: string): ProvinceDetail {
  const db = getDb();

  const prov = db.prepare(
    "SELECT id, name, kingdom FROM provinces WHERE name = ? AND kingdom = ?"
  ).get(name, kingdom) as { id: number; name: string; kingdom: string } | undefined;

  if (!prov) return { province: null, overview: null, totalMilitary: null, homeMilitary: null, troops: null, resources: null, status: null, effects: [], militaryIntel: null, survey: null, sciences: null };

  // Auth check
  const allowed = db.prepare(
    "SELECT 1 FROM intel_partitions WHERE key_hash = ? AND province_id = ?"
  ).get(keyHash, prov.id);
  if (!allowed) return { province: null, overview: null, totalMilitary: null, homeMilitary: null, troops: null, resources: null, status: null, effects: [], militaryIntel: null, survey: null, sciences: null };

  const id = prov.id;

  const overviewRaw = db.prepare(
    "SELECT race, personality, honor_title, land, networth, source, saved_by, received_at FROM province_overview WHERE province_id = ? ORDER BY received_at DESC LIMIT 1"
  ).get(id) as any;
  const overview = overviewRaw ? { race: overviewRaw.race, personality: overviewRaw.personality, honorTitle: overviewRaw.honor_title, land: overviewRaw.land, networth: overviewRaw.networth, source: overviewRaw.source, savedBy: overviewRaw.saved_by, receivedAt: overviewRaw.received_at } : null;

  const tmRaw = db.prepare(
    "SELECT off_points, def_points, received_at FROM total_military_points WHERE province_id = ? ORDER BY received_at DESC LIMIT 1"
  ).get(id) as any;
  const totalMilitary = tmRaw ? { offPoints: tmRaw.off_points, defPoints: tmRaw.def_points, receivedAt: tmRaw.received_at } : null;

  const hmRaw = db.prepare(
    "SELECT mod_off_at_home, mod_def_at_home, source, received_at FROM home_military_points WHERE province_id = ? ORDER BY received_at DESC LIMIT 1"
  ).get(id) as any;
  const homeMilitary = hmRaw ? { modOffAtHome: hmRaw.mod_off_at_home, modDefAtHome: hmRaw.mod_def_at_home, source: hmRaw.source, receivedAt: hmRaw.received_at } : null;

  const troopsRaw = db.prepare(
    "SELECT soldiers, off_specs, def_specs, elites, war_horses, peasants, source, received_at FROM province_troops WHERE province_id = ? ORDER BY received_at DESC LIMIT 1"
  ).get(id) as any;
  const troops = troopsRaw ? { soldiers: troopsRaw.soldiers, offSpecs: troopsRaw.off_specs, defSpecs: troopsRaw.def_specs, elites: troopsRaw.elites, warHorses: troopsRaw.war_horses, peasants: troopsRaw.peasants, source: troopsRaw.source, receivedAt: troopsRaw.received_at } : null;

  const resRaw = db.prepare(
    "SELECT money, food, runes, prisoners, trade_balance, building_efficiency, thieves, stealth, wizards, mana, received_at FROM province_resources WHERE province_id = ? ORDER BY received_at DESC LIMIT 1"
  ).get(id) as any;
  const resources = resRaw ? { money: resRaw.money, food: resRaw.food, runes: resRaw.runes, prisoners: resRaw.prisoners, tradeBalance: resRaw.trade_balance, buildingEfficiency: resRaw.building_efficiency, thieves: resRaw.thieves, stealth: resRaw.stealth, wizards: resRaw.wizards, mana: resRaw.mana, receivedAt: resRaw.received_at } : null;

  const statusRaw = db.prepare(
    "SELECT plagued, overpopulated, hit_status, war, received_at FROM province_status WHERE province_id = ? ORDER BY received_at DESC LIMIT 1"
  ).get(id) as any;
  const status = statusRaw ? { plagued: !!statusRaw.plagued, overpopulated: !!statusRaw.overpopulated, hitStatus: statusRaw.hit_status, war: !!statusRaw.war, receivedAt: statusRaw.received_at } : null;

  const effects = db.prepare(
    `SELECT effect_name, effect_kind, duration_text, remaining_ticks, effectiveness_percent, received_at
     FROM (
       SELECT effect_name, effect_kind, duration_text, remaining_ticks, effectiveness_percent, received_at,
              row_number() OVER (
                PARTITION BY effect_name, effect_kind
                ORDER BY received_at DESC, id DESC
              ) AS rn
       FROM province_effects
       WHERE province_id = ?
     )
     WHERE rn = 1
     ORDER BY effect_kind ASC, effect_name ASC`
  ).all(id) as Array<{ effect_name: string; effect_kind: string; duration_text: string | null; remaining_ticks: number | null; effectiveness_percent: number | null; received_at: string }>;

  const miRaw = db.prepare(
    "SELECT id, ome, dme, received_at FROM military_intel WHERE province_id = ? ORDER BY received_at DESC LIMIT 1"
  ).get(id) as any;
  let militaryIntel = null;
  if (miRaw) {
    const armies = db.prepare(
      "SELECT army_type, generals, soldiers, off_specs, def_specs, elites, war_horses, thieves, land_gained, return_days FROM som_armies WHERE military_intel_id = ?"
    ).all(miRaw.id) as any[];
    militaryIntel = {
      ome: miRaw.ome, dme: miRaw.dme, receivedAt: miRaw.received_at,
      armies: armies.map((a) => ({ armyType: a.army_type, generals: a.generals, soldiers: a.soldiers, offSpecs: a.off_specs, defSpecs: a.def_specs, elites: a.elites, warHorses: a.war_horses, thieves: a.thieves, landGained: a.land_gained, returnDays: a.return_days })),
    };
  }

  const surveyRaw = db.prepare(
    "SELECT id, received_at FROM survey_intel WHERE province_id = ? ORDER BY received_at DESC LIMIT 1"
  ).get(id) as any;
  let survey = null;
  if (surveyRaw) {
    const buildings = db.prepare(
      "SELECT building, built, in_progress FROM survey_buildings WHERE survey_intel_id = ? ORDER BY built DESC"
    ).all(surveyRaw.id) as any[];
    survey = { receivedAt: surveyRaw.received_at, buildings: buildings.map((b) => ({ building: b.building, built: b.built, inProgress: b.in_progress })) };
  }

  const sosRaw = db.prepare(
    "SELECT id, received_at FROM sos_intel WHERE province_id = ? ORDER BY received_at DESC LIMIT 1"
  ).get(id) as any;
  let sciences = null;
  if (sosRaw) {
    const sciRows = db.prepare(
      "SELECT science, books, effect FROM sos_sciences WHERE sos_intel_id = ? ORDER BY books DESC"
    ).all(sosRaw.id) as any[];
    sciences = { receivedAt: sosRaw.received_at, sciences: sciRows.map((s) => ({ science: s.science, books: s.books, effect: s.effect })) };
  }

  return {
    province: prov,
    overview,
    totalMilitary,
    homeMilitary,
    troops,
    resources,
    status,
    effects: effects.map((effect) => ({
      name: effect.effect_name,
      kind: effect.effect_kind,
      durationText: effect.duration_text,
      remainingTicks: effect.remaining_ticks,
      effectivenessPercent: effect.effectiveness_percent,
      receivedAt: effect.received_at,
    })),
    militaryIntel,
    survey,
    sciences,
  };
}

export function cleanupExpired() {
  const db = getDb();
  const cutoff = `datetime('now', '-${TTL_DAYS} days')`;
  db.exec(`
    DELETE FROM province_overview WHERE received_at < ${cutoff};
    DELETE FROM total_military_points WHERE received_at < ${cutoff};
    DELETE FROM home_military_points WHERE received_at < ${cutoff};
    DELETE FROM province_troops WHERE received_at < ${cutoff};
    DELETE FROM province_resources WHERE received_at < ${cutoff};
    DELETE FROM province_status WHERE received_at < ${cutoff};
    DELETE FROM military_intel WHERE received_at < ${cutoff};
    DELETE FROM survey_intel WHERE received_at < ${cutoff};
    DELETE FROM sos_intel WHERE received_at < ${cutoff};
    DELETE FROM kingdom_intel WHERE received_at < ${cutoff};
  `);
}
