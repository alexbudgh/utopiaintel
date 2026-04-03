import Database from "better-sqlite3";
import path from "path";
import type {
  SoTData,
  SurveyData,
  SoMData,
  SoSData,
  SoDData,
  KingdomData,
  StateData,
} from "./parsers/types";

const DB_PATH = path.join(process.cwd(), "intel.db");
const TTL_DAYS = 7;

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!_db) {
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

    -- Kingdom-level intel
    CREATE TABLE IF NOT EXISTS kingdom_intel (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      location TEXT NOT NULL,
      war_target TEXT,
      source TEXT NOT NULL DEFAULT 'kingdom',
      saved_by TEXT,
      received_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_kingdom_loc_time
      ON kingdom_intel(location, received_at DESC);

    CREATE TABLE IF NOT EXISTS kingdom_provinces (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      kingdom_intel_id INTEGER NOT NULL REFERENCES kingdom_intel(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      race TEXT NOT NULL,
      land INTEGER NOT NULL,
      networth INTEGER NOT NULL,
      honor_title TEXT
    );
  `);
}

// Get or create province identity, return ID
function ensureProvince(db: Database.Database, name: string, kingdom: string): number {
  db.prepare("INSERT OR IGNORE INTO provinces (name, kingdom) VALUES (?, ?)").run(name, kingdom);
  const row = db.prepare("SELECT id FROM provinces WHERE name = ? AND kingdom = ?").get(name, kingdom) as { id: number };
  return row.id;
}

export function storeSoT(data: SoTData, savedBy: string) {
  const db = getDb();
  db.transaction(() => {
    const provId = ensureProvince(db, data.name, data.kingdom);

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
  })();
}

export function storeSoD(data: SoDData, savedBy: string) {
  const db = getDb();
  db.transaction(() => {
    const provId = ensureProvince(db, data.name, data.kingdom);

    // SoD returns net modified def at home
    db.prepare(`
      INSERT INTO home_military_points (province_id, mod_off_at_home, mod_def_at_home, source, saved_by, accuracy)
      VALUES (?, NULL, ?, 'sod', ?, ?)
    `).run(provId, data.defPoints, savedBy, data.accuracy);
  })();
}

export function storeSoM(data: SoMData, savedBy: string) {
  const db = getDb();
  db.transaction(() => {
    const provId = ensureProvince(db, data.name, data.kingdom);

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

export function storeSoS(data: SoSData, savedBy: string) {
  const db = getDb();
  db.transaction(() => {
    const provId = ensureProvince(db, data.name, data.kingdom);

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

export function storeSurvey(data: SurveyData, savedBy: string) {
  const db = getDb();
  db.transaction(() => {
    const provId = ensureProvince(db, data.name, data.kingdom);

    const result = db.prepare(`
      INSERT INTO survey_intel (province_id, saved_by, accuracy)
      VALUES (?, ?, ?)
    `).run(provId, savedBy, data.accuracy);

    const surveyId = result.lastInsertRowid;
    const ins = db.prepare("INSERT INTO survey_buildings (survey_intel_id, building, built, in_progress) VALUES (?, ?, ?, ?)");
    for (const b of data.buildings) {
      ins.run(surveyId, b.building, b.built, b.inProgress);
    }
  })();
}

export function storeKingdom(data: KingdomData, savedBy: string) {
  const db = getDb();
  db.transaction(() => {
    const result = db.prepare(`
      INSERT INTO kingdom_intel (name, location, war_target, saved_by)
      VALUES (?, ?, ?, ?)
    `).run(data.name, data.location, data.warTarget, savedBy);

    const kdId = result.lastInsertRowid;
    const ins = db.prepare("INSERT INTO kingdom_provinces (kingdom_intel_id, name, race, land, networth, honor_title) VALUES (?, ?, ?, ?, ?, ?)");

    for (const p of data.provinces) {
      const provId = ensureProvince(db, p.name, data.location);
      ins.run(kdId, p.name, p.race, p.land, p.networth, p.honorTitle);

      // Also write to province_overview
      db.prepare(`
        INSERT INTO province_overview (province_id, race, personality, honor_title, land, networth, source, saved_by)
        VALUES (?, ?, NULL, ?, ?, ?, 'kingdom', ?)
      `).run(provId, p.race, p.honorTitle, p.land, p.networth, savedBy);
    }
  })();
}

export function storeState(data: StateData, savedBy: string) {
  const db = getDb();
  db.transaction(() => {
    const provId = ensureProvince(db, data.name, data.kingdom);

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

export function getKingdoms(): KingdomRow[] {
  const db = getDb();
  return db.prepare(`
    SELECT p.kingdom AS location,
           COUNT(DISTINCT p.id) AS province_count,
           MAX(po.received_at) AS last_seen
    FROM provinces p
    LEFT JOIN province_overview po ON po.province_id = p.id
    WHERE p.kingdom != ''
    GROUP BY p.kingdom
    ORDER BY last_seen DESC
  `).all() as KingdomRow[];
}

export interface ProvinceRow {
  id: number;
  name: string;
  kingdom: string;
  race: string | null;
  land: number | null;
  networth: number | null;
  overview_age: string | null;
  off_points: number | null;
  def_points: number | null;
  military_age: string | null;
}

export function getKingdomProvinces(kingdom: string): ProvinceRow[] {
  const db = getDb();
  return db.prepare(`
    SELECT p.id, p.name, p.kingdom,
           po.race, po.land, po.networth, po.received_at AS overview_age,
           tmp.off_points, tmp.def_points, tmp.received_at AS military_age
    FROM provinces p
    LEFT JOIN province_overview po ON po.id = (
      SELECT id FROM province_overview
      WHERE province_id = p.id ORDER BY received_at DESC LIMIT 1
    )
    LEFT JOIN total_military_points tmp ON tmp.id = (
      SELECT id FROM total_military_points
      WHERE province_id = p.id ORDER BY received_at DESC LIMIT 1
    )
    WHERE p.kingdom = ?
    ORDER BY po.networth DESC NULLS LAST
  `).all(kingdom) as ProvinceRow[];
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
