import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
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
import type { IntelOpAttempt } from "./intel-ops";
import type { KingdomNewsData, KingdomNewsEvent } from "./parsers/kingdom_news";

const DB_PATH = process.env.INTEL_DB_PATH || path.join(process.cwd(), "intel.db");
const TTL_DAYS = 7;

let _db: Database.Database | null = null;
const BAD_SPELL_SQL_LIST = BAD_SPELL_NAMES.map((name) => `'${name.replaceAll("'", "''")}'`).join(", ");
let metricsCacheRefreshEnabled = true;

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

// Same-tick check matching lib/ui.ts sameTick() — SQLite integer division of epoch seconds by 3600
const SAME_TICK_EXPR = (a: string, b: string) =>
  `(strftime('%s', ${a}) / 3600) = (strftime('%s', ${b}) / 3600)`;

const latestSlotCte = (extraWhere = "") => {
  // When a kingdom filter is present, group only by slot (one kingdom).
  // Otherwise group by (location, slot) across all kingdoms.
  const kingdomKnown = extraWhere.includes("@kingdom");
  const innerWhere  = kingdomKnown ? "AND ki2.location = @kingdom" : "";
  const groupBy     = kingdomKnown ? "kp2.slot" : "ki2.location, kp2.slot";
  return `
  latest_slot AS MATERIALIZED (
    -- For each slot number, find the province name most recently seen in a
    -- kingdom snapshot for this shard. This avoids showing stale slot numbers
    -- for old province names after resets/renames.
    SELECT ki.location AS kingdom, kp.slot, kp.name
    FROM kingdom_provinces kp
    JOIN kingdom_intel ki ON ki.id = kp.kingdom_intel_id
    WHERE ki.key_hash = @keyHash
      AND kp.slot IS NOT NULL
      ${extraWhere}
      AND kp.id IN (
        SELECT MAX(kp2.id)
        FROM kingdom_provinces kp2
        JOIN kingdom_intel ki2 ON ki2.id = kp2.kingdom_intel_id
        WHERE ki2.key_hash = @keyHash
          ${innerWhere}
          AND kp2.slot IS NOT NULL
        GROUP BY ${groupBy}
      )
  )
`;};

export function updateMetricsCache(db: Database.Database, provinceId: number, keyHash: string): void {
  if (!metricsCacheRefreshEnabled) return;
  const p = { province_id: provinceId, key_hash: keyHash };
  // Preserve existing cached values when a metric is not currently reconstructable
  // from retained historical intel. This keeps cache refreshes from erasing a
  // known-good fallback after sparse updates or history cleanup.
  const upd = db.prepare(
    `UPDATE provinces SET
      cached_rtpa=COALESCE(?, cached_rtpa),
      cached_rtpa_age=COALESCE(?, cached_rtpa_age),
      cached_mtpa=COALESCE(?, cached_mtpa),
      cached_mtpa_age=COALESCE(?, cached_mtpa_age),
      cached_otpa=COALESCE(?, cached_otpa),
      cached_otpa_age=COALESCE(?, cached_otpa_age),
      cached_dtpa=COALESCE(?, cached_dtpa),
      cached_dtpa_age=COALESCE(?, cached_dtpa_age),
      cached_rwpa=COALESCE(?, cached_rwpa),
      cached_rwpa_age=COALESCE(?, cached_rwpa_age),
      cached_mwpa=COALESCE(?, cached_mwpa),
      cached_mwpa_age=COALESCE(?, cached_mwpa_age)
    WHERE id=?`
  );

  // ── rTPA: most recent same-tick (infiltrate thieves + overview land) ──────
  type RtpaRow = { thieves: number; land: number; age: string };
  const rtpaRow = db.prepare<typeof p, RtpaRow>(`
    SELECT pr.thieves, po.land, pr.received_at AS age
    FROM province_resources pr
    JOIN province_overview po
      ON po.province_id = pr.province_id AND po.key_hash = pr.key_hash
      AND po.land > 0
      AND ${SAME_TICK_EXPR("pr.received_at", "po.received_at")}
    WHERE pr.province_id = :province_id AND pr.key_hash = :key_hash AND pr.thieves IS NOT NULL
    ORDER BY pr.received_at DESC LIMIT 1
  `).get(p);

  let cached_rtpa: number | null = null, cached_rtpa_age: string | null = null;
  if (rtpaRow) {
    cached_rtpa = rawPerAcreValue(rtpaRow.thieves, rtpaRow.land);
    cached_rtpa_age = rtpaRow.age;
  }

  // ── mTPA: same-tick (infiltrate + overview + sos sciences crime) ──────────
  type MtpaRow = {
    thieves: number;
    land: number;
    race: string | null;
    honor_title: string | null;
    personality: string | null;
    crime_effect: number;
    age: string;
  };
  const mtpaRow = db.prepare<typeof p, MtpaRow>(`
    SELECT pr.thieves, po.land, po.race,
      COALESCE(po.honor_title, (
        SELECT po2.honor_title FROM province_overview po2
        WHERE po2.province_id = pr.province_id AND po2.honor_title IS NOT NULL
        ORDER BY po2.received_at DESC LIMIT 1
      )) AS honor_title,
      COALESCE(po.personality, (
        SELECT po2.personality FROM province_overview po2
        WHERE po2.province_id = pr.province_id AND po2.personality IS NOT NULL
        ORDER BY po2.received_at DESC LIMIT 1
      )) AS personality,
      ss.effect AS crime_effect,
      pr.received_at AS age
    FROM province_resources pr
    JOIN province_overview po
      ON po.province_id = pr.province_id AND po.key_hash = pr.key_hash
      AND po.land > 0
      AND ${SAME_TICK_EXPR("pr.received_at", "po.received_at")}
    JOIN sos_intel si
      ON si.province_id = pr.province_id AND si.key_hash = pr.key_hash
      AND ${SAME_TICK_EXPR("pr.received_at", "si.received_at")}
    JOIN sos_sciences ss ON ss.sos_intel_id = si.id AND ss.science = 'Crime'
    WHERE pr.province_id = :province_id AND pr.key_hash = :key_hash AND pr.thieves IS NOT NULL
    ORDER BY pr.received_at DESC LIMIT 1
  `).get(p);

  let cached_mtpa: number | null = null, cached_mtpa_age: string | null = null;
  if (mtpaRow) {
    const rtpa = rawPerAcreValue(mtpaRow.thieves, mtpaRow.land);
    cached_mtpa = computeMtpaValue(
      rtpa,
      mtpaRow.crime_effect,
      mtpaRow.race,
      mtpaRow.honor_title,
      mtpaRow.personality,
    );
    cached_mtpa_age = mtpaRow.age;
  }

  // ── oTPA / dTPA: same-tick + survey (thieves' dens / watch towers) ────────
  type OdtpaRow = MtpaRow & { thieves_dens_effect: number | null; watch_towers_effect: number | null };
  const odtpaRow = db.prepare<typeof p, OdtpaRow>(`
    SELECT pr.thieves, po.land, po.race,
      COALESCE(po.honor_title, (
        SELECT po2.honor_title FROM province_overview po2
        WHERE po2.province_id = pr.province_id AND po2.honor_title IS NOT NULL
        ORDER BY po2.received_at DESC LIMIT 1
      )) AS honor_title,
      COALESCE(po.personality, (
        SELECT po2.personality FROM province_overview po2
        WHERE po2.province_id = pr.province_id AND po2.personality IS NOT NULL
        ORDER BY po2.received_at DESC LIMIT 1
      )) AS personality,
      ss.effect AS crime_effect,
      srv.thievery_effectiveness AS thieves_dens_effect,
      srv.thief_prevent_chance AS watch_towers_effect,
      pr.received_at AS age
    FROM province_resources pr
    JOIN province_overview po
      ON po.province_id = pr.province_id AND po.key_hash = pr.key_hash
      AND po.land > 0
      AND ${SAME_TICK_EXPR("pr.received_at", "po.received_at")}
    JOIN sos_intel si
      ON si.province_id = pr.province_id AND si.key_hash = pr.key_hash
      AND ${SAME_TICK_EXPR("pr.received_at", "si.received_at")}
    JOIN sos_sciences ss ON ss.sos_intel_id = si.id AND ss.science = 'Crime'
    JOIN survey_intel srv
      ON srv.province_id = pr.province_id AND srv.key_hash = pr.key_hash
      AND ${SAME_TICK_EXPR("pr.received_at", "srv.received_at")}
    WHERE pr.province_id = :province_id AND pr.key_hash = :key_hash AND pr.thieves IS NOT NULL
    ORDER BY pr.received_at DESC LIMIT 1
  `).get(p);

  let cached_otpa: number | null = null, cached_otpa_age: string | null = null;
  let cached_dtpa: number | null = null, cached_dtpa_age: string | null = null;
  if (odtpaRow) {
    const rtpa = rawPerAcreValue(odtpaRow.thieves, odtpaRow.land);
    const mtpa = computeMtpaValue(
      rtpa,
      odtpaRow.crime_effect,
      odtpaRow.race,
      odtpaRow.honor_title,
      odtpaRow.personality,
    );
    cached_otpa = computeOtpaValue(mtpa, odtpaRow.thieves_dens_effect);
    if (cached_otpa != null) {
      cached_otpa_age = odtpaRow.age;
    }
    cached_dtpa = computeDtpaValue(mtpa, odtpaRow.watch_towers_effect);
    if (cached_dtpa != null) {
      cached_dtpa_age = odtpaRow.age;
    }
  }

  // ── rWPA direct: most recent same-tick (throne/state wizards + overview) ──
  type RwpaDirectRow = {
    wizards: number;
    land: number;
    race: string | null;
    honor_title: string | null;
    personality: string | null;
    mana: number | null;
    age: string;
  };
  const rwpaDirectRow = db.prepare<typeof p, RwpaDirectRow>(`
    SELECT pr.wizards, po.land, po.race, pr.mana,
      COALESCE(po.honor_title, (
        SELECT po2.honor_title FROM province_overview po2
        WHERE po2.province_id = pr.province_id AND po2.honor_title IS NOT NULL
        ORDER BY po2.received_at DESC LIMIT 1
      )) AS honor_title,
      COALESCE(po.personality, (
        SELECT po2.personality FROM province_overview po2
        WHERE po2.province_id = pr.province_id AND po2.personality IS NOT NULL
        ORDER BY po2.received_at DESC LIMIT 1
      )) AS personality,
      pr.received_at AS age
    FROM province_resources pr
    JOIN province_overview po
      ON po.province_id = pr.province_id AND po.key_hash = pr.key_hash
      AND po.land > 0
      AND ${SAME_TICK_EXPR("pr.received_at", "po.received_at")}
    WHERE pr.province_id = :province_id AND pr.key_hash = :key_hash AND pr.wizards IS NOT NULL
    ORDER BY pr.received_at DESC LIMIT 1
  `).get(p);

  // ── mWPA direct: same as above but also needs same-tick channeling ────────
  type MwpaDirectRow = RwpaDirectRow & { channeling_effect: number };
  const mwpaDirectRow = db.prepare<typeof p, MwpaDirectRow>(`
    SELECT pr.wizards, po.land, po.race, pr.mana,
      COALESCE(po.honor_title, (
        SELECT po2.honor_title FROM province_overview po2
        WHERE po2.province_id = pr.province_id AND po2.honor_title IS NOT NULL
        ORDER BY po2.received_at DESC LIMIT 1
      )) AS honor_title,
      COALESCE(po.personality, (
        SELECT po2.personality FROM province_overview po2
        WHERE po2.province_id = pr.province_id AND po2.personality IS NOT NULL
        ORDER BY po2.received_at DESC LIMIT 1
      )) AS personality,
      ss.effect AS channeling_effect,
      pr.received_at AS age
    FROM province_resources pr
    JOIN province_overview po
      ON po.province_id = pr.province_id AND po.key_hash = pr.key_hash
      AND po.land > 0
      AND ${SAME_TICK_EXPR("pr.received_at", "po.received_at")}
    JOIN sos_intel si
      ON si.province_id = pr.province_id AND si.key_hash = pr.key_hash
      AND ${SAME_TICK_EXPR("pr.received_at", "si.received_at")}
    JOIN sos_sciences ss ON ss.sos_intel_id = si.id AND ss.science = 'Channeling'
    WHERE pr.province_id = :province_id AND pr.key_hash = :key_hash AND pr.wizards IS NOT NULL
    ORDER BY pr.received_at DESC LIMIT 1
  `).get(p);

  // ── rWPA / mWPA back-calc: same-tick residual inputs. Total troops and
  // resources come from SoT/throne; SoM home troops are intentionally ignored.
  type RwpaBackRow = {
    thieves: number; land: number; networth: number; race: string;
    honor_title: string | null; personality: string | null; mana: number | null;
    science_total_books: number | null; buildings_built: number | null; buildings_in_progress: number | null;
    soldiers: number | null; off_specs: number | null; def_specs: number | null;
    elites: number | null; war_horses: number | null; peasants: number | null;
    money: number | null; prisoners: number | null;
    channeling_effect: number | null; age: string;
  };
  const rwpaBackRow = db.prepare<typeof p, RwpaBackRow>(`
    SELECT pr.thieves, po.land, po.networth, po.race,
      COALESCE(po.honor_title, (
        SELECT po2.honor_title FROM province_overview po2
        WHERE po2.province_id = pr.province_id AND po2.honor_title IS NOT NULL
        ORDER BY po2.received_at DESC LIMIT 1
      )) AS honor_title,
      COALESCE(po.personality, (
        SELECT po2.personality FROM province_overview po2
        WHERE po2.province_id = pr.province_id AND po2.personality IS NOT NULL
        ORDER BY po2.received_at DESC LIMIT 1
      )) AS personality,
      (SELECT pr2.mana FROM province_resources pr2
       WHERE pr2.province_id = pr.province_id AND pr2.key_hash = pr.key_hash AND pr2.mana IS NOT NULL
       ORDER BY pr2.received_at DESC LIMIT 1) AS mana,
      (SELECT SUM(ss2.books) FROM sos_sciences ss2 WHERE ss2.sos_intel_id = si.id) AS science_total_books,
      (SELECT SUM(sb.built) FROM survey_buildings sb
       WHERE sb.survey_intel_id = srv.id AND sb.building != 'Barren Land') AS buildings_built,
      (SELECT SUM(sb.in_progress) FROM survey_buildings sb WHERE sb.survey_intel_id = srv.id) AS buildings_in_progress,
      pt.soldiers, pt.off_specs, pt.def_specs, pt.elites, pt.war_horses, pt.peasants,
      pr_sot.money, pr_sot.prisoners,
      (SELECT ss2.effect FROM sos_sciences ss2 WHERE ss2.sos_intel_id = si.id AND ss2.science = 'Channeling') AS channeling_effect,
      pr.received_at AS age
    FROM province_resources pr
    JOIN province_overview po
      ON po.province_id = pr.province_id AND po.key_hash = pr.key_hash
      AND po.land > 0 AND po.networth IS NOT NULL AND po.race IS NOT NULL
      AND ${SAME_TICK_EXPR("pr.received_at", "po.received_at")}
    JOIN sos_intel si
      ON si.province_id = pr.province_id AND si.key_hash = pr.key_hash
      AND ${SAME_TICK_EXPR("pr.received_at", "si.received_at")}
    JOIN survey_intel srv
      ON srv.province_id = pr.province_id AND srv.key_hash = pr.key_hash
      AND ${SAME_TICK_EXPR("pr.received_at", "srv.received_at")}
    JOIN province_troops pt
      ON pt.province_id = pr.province_id AND pt.key_hash = pr.key_hash
      AND pt.source IN ('sot', 'throne')
      AND ${SAME_TICK_EXPR("pr.received_at", "pt.received_at")}
    JOIN province_resources pr_sot
      ON pr_sot.province_id = pr.province_id AND pr_sot.key_hash = pr.key_hash
      AND pr_sot.source IN ('sot', 'throne')
      AND ${SAME_TICK_EXPR("pr.received_at", "pr_sot.received_at")}
    WHERE pr.province_id = :province_id AND pr.key_hash = :key_hash AND pr.thieves IS NOT NULL
    ORDER BY pr.received_at DESC LIMIT 1
  `).get(p);

  // Pick best rWPA: direct (more accurate) preferred over back-calc
  let cached_rwpa: number | null = null, cached_rwpa_age: string | null = null;
  let cached_mwpa: number | null = null, cached_mwpa_age: string | null = null;

  if (rwpaDirectRow) {
    cached_rwpa = rawPerAcreValue(rwpaDirectRow.wizards, rwpaDirectRow.land);
    cached_rwpa_age = rwpaDirectRow.age;
    if (mwpaDirectRow) {
      cached_mwpa = computeMwpaValue(
        cached_rwpa,
        mwpaDirectRow.channeling_effect,
        mwpaDirectRow.race,
        mwpaDirectRow.honor_title,
        mwpaDirectRow.personality,
        mwpaDirectRow.mana,
      );
      cached_mwpa_age = mwpaDirectRow.age;
    }
  } else if (rwpaBackRow) {
    const w = computeWizardCount(rwpaBackRow);
    if (w != null) {
      cached_rwpa = rawPerAcreValue(w, rwpaBackRow.land);
      cached_rwpa_age = rwpaBackRow.age;
      cached_mwpa = computeMwpaValue(
        cached_rwpa,
        rwpaBackRow.channeling_effect,
        rwpaBackRow.race,
        rwpaBackRow.honor_title,
        rwpaBackRow.personality,
        rwpaBackRow.mana,
      );
      if (cached_mwpa != null) {
        cached_mwpa_age = rwpaBackRow.age;
      }
    }
  }

  upd.run(
    cached_rtpa, cached_rtpa_age,
    cached_mtpa, cached_mtpa_age,
    cached_otpa, cached_otpa_age,
    cached_dtpa, cached_dtpa_age,
    cached_rwpa, cached_rwpa_age,
    cached_mwpa, cached_mwpa_age,
    provinceId,
  );
}

export function setMetricsCacheRefreshEnabled(enabled: boolean): () => void {
  const previous = metricsCacheRefreshEnabled;
  metricsCacheRefreshEnabled = enabled;
  return () => {
    metricsCacheRefreshEnabled = previous;
  };
}

export function initSchema(db: Database.Database) {
  db.exec(`
    -- Identity only
    CREATE TABLE IF NOT EXISTS provinces (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      kingdom TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(name, kingdom)
    );
    CREATE INDEX IF NOT EXISTS idx_provinces_kingdom ON provinces(kingdom);

    -- Dimension: overview (race, personality, land, nw, honor)
    -- Sources: sot, kingdom
    CREATE TABLE IF NOT EXISTS province_overview (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      province_id INTEGER NOT NULL REFERENCES provinces(id),
      key_hash TEXT,
      race TEXT,
      personality TEXT,
      honor_title TEXT,
      ruler TEXT,
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
      key_hash TEXT,
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
      key_hash TEXT,
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
      key_hash TEXT,
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
      key_hash TEXT,
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
      key_hash TEXT,
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
      key_hash TEXT,
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
      key_hash TEXT,
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
      key_hash TEXT,
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
      key_hash TEXT,
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
    CREATE UNIQUE INDEX IF NOT EXISTS idx_sos_sciences_unique
      ON sos_sciences(sos_intel_id, science);

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
      key_hash TEXT,
      name TEXT NOT NULL,
      location TEXT NOT NULL,
      kingdom_title TEXT,
      total_networth INTEGER,
      total_land INTEGER,
      total_honor INTEGER,
      wars_won INTEGER,
      war_losses INTEGER,
      networth_rank INTEGER,
      land_rank INTEGER,
      honor_rank INTEGER,
      war_target TEXT,
      their_attitude_to_us TEXT,
      their_attitude_points REAL,
      our_attitude_to_them TEXT,
      our_attitude_points REAL,
      hostility_meter_visible_until TEXT,
      open_relations_json TEXT,
      war_doctrines_json TEXT,
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

    CREATE TABLE IF NOT EXISTS kingdom_news (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      kingdom TEXT NOT NULL,
      game_date TEXT NOT NULL,
      event_type TEXT NOT NULL,
      raw_text TEXT NOT NULL,
      attacker_name TEXT,
      attacker_kingdom TEXT,
      defender_name TEXT,
      defender_kingdom TEXT,
      acres INTEGER,
      books INTEGER,
      sender_name TEXT,
      receiver_name TEXT,
      relation_kingdom TEXT,
      dragon_type TEXT,
      dragon_name TEXT,
      received_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(kingdom, game_date, raw_text)
    );
    CREATE INDEX IF NOT EXISTS idx_kingdom_news_kd_date
      ON kingdom_news(kingdom, game_date DESC);

    CREATE TABLE IF NOT EXISTS kingdom_news_sharded (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      key_hash TEXT NOT NULL,
      kingdom TEXT NOT NULL,
      game_date TEXT NOT NULL,
      game_date_ord INTEGER,
      event_type TEXT NOT NULL,
      raw_text TEXT NOT NULL,
      attacker_name TEXT,
      attacker_kingdom TEXT,
      defender_name TEXT,
      defender_kingdom TEXT,
      acres INTEGER,
      books INTEGER,
      sender_name TEXT,
      receiver_name TEXT,
      relation_kingdom TEXT,
      dragon_type TEXT,
      dragon_name TEXT,
      received_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(key_hash, kingdom, game_date, raw_text)
    );
    CREATE INDEX IF NOT EXISTS idx_kingdom_news_sharded_kd_ord
      ON kingdom_news_sharded(key_hash, kingdom, game_date_ord DESC);

    CREATE TABLE IF NOT EXISTS rob_ops (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      province_id INTEGER NOT NULL REFERENCES provinces(id),
      key_hash TEXT NOT NULL,
      op TEXT NOT NULL,
      target_name TEXT,
      target_slot INTEGER,
      target_kingdom TEXT,
      outcome TEXT NOT NULL,
      amount_stolen INTEGER,
      thieves_lost INTEGER NOT NULL DEFAULT 0,
      thieves INTEGER,
      stealth INTEGER,
      saved_by TEXT,
      received_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_rob_ops_prov
      ON rob_ops(province_id, key_hash, received_at DESC);

    CREATE TABLE IF NOT EXISTS intel_ops (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      province_id INTEGER NOT NULL REFERENCES provinces(id),
      key_hash TEXT NOT NULL,
      op TEXT NOT NULL,
      intel_type TEXT NOT NULL,
      outcome TEXT NOT NULL,
      target_name TEXT,
      target_slot INTEGER,
      target_kingdom TEXT,
      accuracy INTEGER,
      thieves_lost INTEGER NOT NULL DEFAULT 0,
      saved_by TEXT,
      received_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_intel_ops_prov
      ON intel_ops(province_id, key_hash, received_at DESC);

    CREATE TABLE IF NOT EXISTS sorcery_ops (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      province_id INTEGER NOT NULL REFERENCES provinces(id),
      key_hash TEXT NOT NULL,
      spell TEXT NOT NULL,
      outcome TEXT NOT NULL,
      runes_spent INTEGER,
      wizards_lost INTEGER NOT NULL DEFAULT 0,
      duration_days INTEGER,
      target_name TEXT,
      target_slot INTEGER,
      target_kingdom TEXT,
      wizards INTEGER,
      runes INTEGER,
      mana INTEGER,
      saved_by TEXT,
      received_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_sorcery_ops_prov
      ON sorcery_ops(province_id, key_hash, received_at DESC);

    CREATE TABLE IF NOT EXISTS attack_ops (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      province_id INTEGER NOT NULL REFERENCES provinces(id),
      key_hash TEXT NOT NULL,
      attack_type TEXT NOT NULL,
      outcome TEXT NOT NULL,
      target_name TEXT,
      target_kingdom TEXT,
      acres_taken INTEGER,
      buildings_survived INTEGER,
      specialist_credits INTEGER,
      peasants_settled INTEGER,
      massacred INTEGER,
      enemy_killed INTEGER,
      enemy_imprisoned INTEGER,
      return_days REAL,
      saved_by TEXT,
      received_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_attack_ops_prov
      ON attack_ops(province_id, key_hash, received_at DESC);
  `);

  // Additive migrations
  const hasCol = (table: string, col: string) =>
    (db.prepare(`SELECT COUNT(*) as n FROM pragma_table_info('${table}') WHERE name='${col}'`).get() as { n: number }).n > 0;
  if (!hasCol("survey_intel", "thievery_effectiveness")) db.exec("ALTER TABLE survey_intel ADD COLUMN thievery_effectiveness REAL");
  if (!hasCol("survey_intel", "thief_prevent_chance"))   db.exec("ALTER TABLE survey_intel ADD COLUMN thief_prevent_chance REAL");
  if (!hasCol("survey_intel", "castles_effect"))         db.exec("ALTER TABLE survey_intel ADD COLUMN castles_effect REAL");
  if (!hasCol("province_overview", "key_hash")) db.exec("ALTER TABLE province_overview ADD COLUMN key_hash TEXT");
  if (!hasCol("province_overview", "ruler")) db.exec("ALTER TABLE province_overview ADD COLUMN ruler TEXT");
  if (!hasCol("total_military_points", "key_hash")) db.exec("ALTER TABLE total_military_points ADD COLUMN key_hash TEXT");
  if (!hasCol("home_military_points", "key_hash")) db.exec("ALTER TABLE home_military_points ADD COLUMN key_hash TEXT");
  if (!hasCol("province_troops", "key_hash")) db.exec("ALTER TABLE province_troops ADD COLUMN key_hash TEXT");
  if (!hasCol("province_resources", "key_hash")) db.exec("ALTER TABLE province_resources ADD COLUMN key_hash TEXT");
  if (!hasCol("province_status", "key_hash")) db.exec("ALTER TABLE province_status ADD COLUMN key_hash TEXT");
  if (!hasCol("province_effects", "key_hash")) db.exec("ALTER TABLE province_effects ADD COLUMN key_hash TEXT");
  if (!hasCol("military_intel", "key_hash")) db.exec("ALTER TABLE military_intel ADD COLUMN key_hash TEXT");
  if (!hasCol("survey_intel", "key_hash")) db.exec("ALTER TABLE survey_intel ADD COLUMN key_hash TEXT");
  if (!hasCol("sos_intel", "key_hash")) db.exec("ALTER TABLE sos_intel ADD COLUMN key_hash TEXT");
  if (!hasCol("kingdom_intel", "key_hash")) db.exec("ALTER TABLE kingdom_intel ADD COLUMN key_hash TEXT");
  if (!hasCol("province_effects", "remaining_ticks")) db.exec("ALTER TABLE province_effects ADD COLUMN remaining_ticks INTEGER");
  if (!hasCol("province_effects", "effectiveness_percent")) db.exec("ALTER TABLE province_effects ADD COLUMN effectiveness_percent REAL");
  if (!hasCol("kingdom_intel", "their_attitude_to_us")) db.exec("ALTER TABLE kingdom_intel ADD COLUMN their_attitude_to_us TEXT");
  if (!hasCol("kingdom_intel", "kingdom_title")) db.exec("ALTER TABLE kingdom_intel ADD COLUMN kingdom_title TEXT");
  if (!hasCol("kingdom_intel", "total_networth")) db.exec("ALTER TABLE kingdom_intel ADD COLUMN total_networth INTEGER");
  if (!hasCol("kingdom_intel", "total_land")) db.exec("ALTER TABLE kingdom_intel ADD COLUMN total_land INTEGER");
  if (!hasCol("kingdom_intel", "total_honor")) db.exec("ALTER TABLE kingdom_intel ADD COLUMN total_honor INTEGER");
  if (!hasCol("kingdom_intel", "wars_won")) db.exec("ALTER TABLE kingdom_intel ADD COLUMN wars_won INTEGER");
  if (!hasCol("kingdom_intel", "war_losses")) db.exec("ALTER TABLE kingdom_intel ADD COLUMN war_losses INTEGER");
  if (!hasCol("kingdom_intel", "networth_rank")) db.exec("ALTER TABLE kingdom_intel ADD COLUMN networth_rank INTEGER");
  if (!hasCol("kingdom_intel", "land_rank")) db.exec("ALTER TABLE kingdom_intel ADD COLUMN land_rank INTEGER");
  if (!hasCol("kingdom_intel", "honor_rank")) db.exec("ALTER TABLE kingdom_intel ADD COLUMN honor_rank INTEGER");
  if (!hasCol("kingdom_intel", "their_attitude_points")) db.exec("ALTER TABLE kingdom_intel ADD COLUMN their_attitude_points REAL");
  if (!hasCol("kingdom_intel", "our_attitude_to_them")) db.exec("ALTER TABLE kingdom_intel ADD COLUMN our_attitude_to_them TEXT");
  if (!hasCol("kingdom_intel", "our_attitude_points")) db.exec("ALTER TABLE kingdom_intel ADD COLUMN our_attitude_points REAL");
  if (!hasCol("kingdom_intel", "hostility_meter_visible_until")) db.exec("ALTER TABLE kingdom_intel ADD COLUMN hostility_meter_visible_until TEXT");
  if (!hasCol("kingdom_intel", "open_relations_json")) db.exec("ALTER TABLE kingdom_intel ADD COLUMN open_relations_json TEXT");
  if (!hasCol("kingdom_intel", "war_doctrines_json")) db.exec("ALTER TABLE kingdom_intel ADD COLUMN war_doctrines_json TEXT");
  if (!hasCol("kingdom_provinces", "slot")) db.exec("ALTER TABLE kingdom_provinces ADD COLUMN slot INTEGER");
  if (!hasCol("province_status", "overpop_deserters")) db.exec("ALTER TABLE province_status ADD COLUMN overpop_deserters INTEGER");
  if (!hasCol("province_status", "dragon_type")) db.exec("ALTER TABLE province_status ADD COLUMN dragon_type TEXT");
  if (!hasCol("province_status", "dragon_name")) db.exec("ALTER TABLE province_status ADD COLUMN dragon_name TEXT");
  if (!hasCol("military_intel", "source")) db.exec("ALTER TABLE military_intel ADD COLUMN source TEXT NOT NULL DEFAULT 'som'");
  if (!hasCol("province_resources", "total_pop")) db.exec("ALTER TABLE province_resources ADD COLUMN total_pop INTEGER");
  if (!hasCol("province_resources", "max_pop"))   db.exec("ALTER TABLE province_resources ADD COLUMN max_pop INTEGER");
  if (!hasCol("province_resources", "free_specialist_credits")) db.exec("ALTER TABLE province_resources ADD COLUMN free_specialist_credits INTEGER");
  if (!hasCol("province_resources", "free_building_credits")) db.exec("ALTER TABLE province_resources ADD COLUMN free_building_credits INTEGER");
  if (!hasCol("kingdom_news", "game_date_ord")) {
    db.exec("ALTER TABLE kingdom_news ADD COLUMN game_date_ord INTEGER");
    // Backfill ordinal for existing rows
    const allRows = db.prepare("SELECT id, game_date FROM kingdom_news").all() as { id: number; game_date: string }[];
    const upd = db.prepare("UPDATE kingdom_news SET game_date_ord = ? WHERE id = ?");
    db.transaction(() => { for (const r of allRows) upd.run(parseUtopiaDate(r.game_date), r.id); })();
    db.exec("CREATE INDEX IF NOT EXISTS idx_kingdom_news_kd_ord ON kingdom_news(kingdom, game_date_ord DESC)");
  }
  if (!hasCol("rob_ops", "troops_assassinated")) db.exec("ALTER TABLE rob_ops ADD COLUMN troops_assassinated INTEGER");
  if (!hasCol("rob_ops", "kidnapped"))           db.exec("ALTER TABLE rob_ops ADD COLUMN kidnapped INTEGER");
  if (!hasCol("rob_ops", "acres_burned"))        db.exec("ALTER TABLE rob_ops ADD COLUMN acres_burned INTEGER");
  if (!hasCol("rob_ops", "effect_duration"))     db.exec("ALTER TABLE rob_ops ADD COLUMN effect_duration INTEGER");
  if (!hasCol("intel_ops", "thieves_lost"))      db.exec("ALTER TABLE intel_ops ADD COLUMN thieves_lost INTEGER NOT NULL DEFAULT 0");

  if (!hasCol("provinces", "cached_rtpa")) {
    db.exec("ALTER TABLE provinces ADD COLUMN cached_rtpa REAL");
    db.exec("ALTER TABLE provinces ADD COLUMN cached_rtpa_age TEXT");
    db.exec("ALTER TABLE provinces ADD COLUMN cached_mtpa REAL");
    db.exec("ALTER TABLE provinces ADD COLUMN cached_mtpa_age TEXT");
    db.exec("ALTER TABLE provinces ADD COLUMN cached_otpa REAL");
    db.exec("ALTER TABLE provinces ADD COLUMN cached_otpa_age TEXT");
    db.exec("ALTER TABLE provinces ADD COLUMN cached_dtpa REAL");
    db.exec("ALTER TABLE provinces ADD COLUMN cached_dtpa_age TEXT");
    db.exec("ALTER TABLE provinces ADD COLUMN cached_rwpa REAL");
    db.exec("ALTER TABLE provinces ADD COLUMN cached_rwpa_age TEXT");
    db.exec("ALTER TABLE provinces ADD COLUMN cached_mwpa REAL");
    db.exec("ALTER TABLE provinces ADD COLUMN cached_mwpa_age TEXT");
    // Backfill cache from existing history
    const pairs = db.prepare(
      "SELECT DISTINCT province_id, key_hash FROM intel_partitions WHERE key_hash IS NOT NULL"
    ).all() as Array<{ province_id: number; key_hash: string }>;
    db.transaction(() => {
      for (const { province_id, key_hash } of pairs) {
        updateMetricsCache(db, province_id, key_hash);
      }
    })();
  }

  const hasIndex = (name: string) =>
    (db.prepare("SELECT COUNT(*) as n FROM sqlite_master WHERE type = 'index' AND name = ?").get(name) as { n: number }).n > 0;
  const ensureUniqueSubmissionIndex = (name: string, table: string, columns: string) => {
    if (hasIndex(name)) return;
    db.exec(`
      DELETE FROM ${table}
      WHERE key_hash IS NOT NULL
        AND id NOT IN (
        SELECT MIN(id)
        FROM ${table}
        WHERE key_hash IS NOT NULL
        GROUP BY ${columns}
      );
      CREATE UNIQUE INDEX IF NOT EXISTS ${name}
        ON ${table}(${columns});
    `);
  };

  ensureUniqueSubmissionIndex(
    "idx_overview_unique_submission",
    "province_overview",
    "province_id, key_hash, source, saved_by, received_at"
  );
  ensureUniqueSubmissionIndex(
    "idx_totmil_unique_submission",
    "total_military_points",
    "province_id, key_hash, source, saved_by, received_at"
  );
  ensureUniqueSubmissionIndex(
    "idx_homemil_unique_submission",
    "home_military_points",
    "province_id, key_hash, source, saved_by, received_at"
  );
  ensureUniqueSubmissionIndex(
    "idx_troops_unique_submission",
    "province_troops",
    "province_id, key_hash, source, saved_by, received_at"
  );
  ensureUniqueSubmissionIndex(
    "idx_resources_unique_submission",
    "province_resources",
    "province_id, key_hash, source, saved_by, received_at"
  );
  ensureUniqueSubmissionIndex(
    "idx_status_unique_submission",
    "province_status",
    "province_id, key_hash, source, saved_by, received_at"
  );
  ensureUniqueSubmissionIndex(
    "idx_effects_unique_submission",
    "province_effects",
    "province_id, key_hash, source, saved_by, received_at, effect_name, effect_kind"
  );
  ensureUniqueSubmissionIndex(
    "idx_milintel_unique_submission",
    "military_intel",
    "province_id, key_hash, source, saved_by, received_at"
  );
  ensureUniqueSubmissionIndex(
    "idx_survey_unique_submission",
    "survey_intel",
    "province_id, key_hash, source, saved_by, received_at"
  );
  ensureUniqueSubmissionIndex(
    "idx_kingdom_unique_submission",
    "kingdom_intel",
    "key_hash, location, source, saved_by, received_at"
  );
  ensureUniqueSubmissionIndex(
    "idx_attack_ops_unique_submission",
    "attack_ops",
    "province_id, key_hash, received_at"
  );
  ensureUniqueSubmissionIndex(
    "idx_rob_ops_unique_submission",
    "rob_ops",
    "province_id, key_hash, received_at"
  );
  ensureUniqueSubmissionIndex(
    "idx_intel_ops_unique_submission",
    "intel_ops",
    "province_id, key_hash, received_at, op"
  );
  ensureUniqueSubmissionIndex(
    "idx_sorcery_ops_unique_submission",
    "sorcery_ops",
    "province_id, key_hash, received_at"
  );

  // Performance indexes: key_hash-first compound indexes so per-shard queries
  // avoid full table scans on large history tables.
  if (!hasIndex("idx_provinces_kingdom")) {
    db.exec("CREATE INDEX IF NOT EXISTS idx_provinces_kingdom ON provinces(kingdom)");
  }
  if (!hasIndex("idx_overview_keyhash_prov_time")) {
    db.exec("CREATE INDEX IF NOT EXISTS idx_overview_keyhash_prov_time ON province_overview(key_hash, province_id, received_at DESC, id DESC)");
  }
  if (!hasIndex("idx_kingdom_intel_keyhash_loc")) {
    db.exec("CREATE INDEX IF NOT EXISTS idx_kingdom_intel_keyhash_loc ON kingdom_intel(key_hash, location)");
  }
  if (!hasIndex("idx_kingdom_provinces_intel_slot")) {
    db.exec("CREATE INDEX IF NOT EXISTS idx_kingdom_provinces_intel_slot ON kingdom_provinces(kingdom_intel_id, slot)");
  }
  if (!hasIndex("idx_kingdom_provinces_intel_name")) {
    db.exec("CREATE INDEX IF NOT EXISTS idx_kingdom_provinces_intel_name ON kingdom_provinces(kingdom_intel_id, name)");
  }
}

// SQL fragments for province_overview — used in both the list query and detail query.
// Each field is fetched from the most recent row where it is non-null, independently.
// state rows have NULL race/personality/honor; kingdom rows have NULL personality.
// Scalar subqueries for per-field latest-non-null values, used in SELECT clause
const OVERVIEW_RACE_SQL    = `(SELECT race         FROM province_overview WHERE province_id = p.id AND key_hash = @keyHash AND race         IS NOT NULL ORDER BY received_at DESC LIMIT 1) AS race`;
const OVERVIEW_PERS_SQL    = `(SELECT personality  FROM province_overview WHERE province_id = p.id AND key_hash = @keyHash AND personality  IS NOT NULL ORDER BY received_at DESC LIMIT 1) AS personality`;
const OVERVIEW_HONOR_SQL   = `(SELECT honor_title  FROM province_overview WHERE province_id = p.id AND key_hash = @keyHash AND honor_title  IS NOT NULL ORDER BY received_at DESC LIMIT 1) AS honor_title`;

function queryOverview(db: Database.Database, provId: number, keyHash: string) {
  const row = db.prepare(`
    SELECT
      land, networth, source, saved_by, received_at,
      (SELECT race        FROM province_overview WHERE province_id = ? AND key_hash = ? AND race        IS NOT NULL ORDER BY received_at DESC LIMIT 1) AS race,
      (SELECT personality FROM province_overview WHERE province_id = ? AND key_hash = ? AND personality IS NOT NULL ORDER BY received_at DESC LIMIT 1) AS personality,
      (SELECT honor_title FROM province_overview WHERE province_id = ? AND key_hash = ? AND honor_title IS NOT NULL ORDER BY received_at DESC LIMIT 1) AS honor_title,
      (SELECT ruler       FROM province_overview WHERE province_id = ? AND key_hash = ? AND ruler       IS NOT NULL ORDER BY received_at DESC LIMIT 1) AS ruler
    FROM province_overview WHERE province_id = ? AND key_hash = ? ORDER BY received_at DESC LIMIT 1
  `).get(provId, keyHash, provId, keyHash, provId, keyHash, provId, keyHash, provId, keyHash) as any;
  if (!row) return null;
  return {
    race: row.race ?? null,
    personality: row.personality ?? null,
    honorTitle: row.honor_title ?? null,
    ruler: row.ruler ?? null,
    land: row.land,
    networth: row.networth,
    source: row.source,
    savedBy: row.saved_by,
    receivedAt: row.received_at,
  };
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

export function storeSoT(data: SoTData, savedBy: string, keyHash: string, isSelfThrone = false, receivedAt?: string) {
  const db = getDb();
  const src = isSelfThrone ? "throne" : "sot";
  db.transaction(() => {
    const provId = ensureProvince(db, data.name, data.kingdom);
    recordSubmission(db, keyHash, provId);
    if (isSelfThrone && data.kingdom) {
      bindKeyToKingdom(db, keyHash, data.kingdom, "throne");
      db.prepare(`
        UPDATE kingdom_intel SET war_target = ?
        WHERE id = (SELECT id FROM kingdom_intel WHERE location = ? AND key_hash = ? ORDER BY id DESC LIMIT 1)
      `).run(data.warTarget ?? null, data.kingdom, keyHash);
    }

    // 1. Overview
    db.prepare(`
      INSERT OR IGNORE INTO province_overview (province_id, key_hash, race, personality, honor_title, ruler, land, networth, source, saved_by, accuracy, received_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, datetime('now')))
    `).run(provId, keyHash, data.race, data.personality ?? null, data.honorTitle ?? null, data.ruler ?? null, data.land, data.networth, src, savedBy, data.accuracy, receivedAt ?? null);

    // 2. Total military points (province-wide)
    db.prepare(`
      INSERT OR IGNORE INTO total_military_points (province_id, key_hash, off_points, def_points, source, saved_by, accuracy, received_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, COALESCE(?, datetime('now')))
    `).run(provId, keyHash, data.offPoints, data.defPoints, src, savedBy, data.accuracy, receivedAt ?? null);

    // 3. Troops at home
    db.prepare(`
      INSERT OR IGNORE INTO province_troops (province_id, key_hash, soldiers, off_specs, def_specs, elites, war_horses, peasants, source, saved_by, accuracy, received_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, datetime('now')))
    `).run(provId, keyHash, data.soldiers, data.offSpecs, data.defSpecs, data.elites, data.warHorses, data.peasants, src, savedBy, data.accuracy, receivedAt ?? null);

    // 4. Resources
    db.prepare(`
      INSERT OR IGNORE INTO province_resources (province_id, key_hash, money, food, runes, prisoners, trade_balance, building_efficiency, thieves, stealth, wizards, mana, source, saved_by, accuracy, received_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, datetime('now')))
    `).run(provId, keyHash, data.money, data.food, data.runes, data.prisoners, data.tradeBalance, data.buildingEfficiency, data.thieves, data.stealth, data.wizards, data.mana, src, savedBy, data.accuracy, receivedAt ?? null);

    // 5. Status
    db.prepare(`
      INSERT OR IGNORE INTO province_status (province_id, key_hash, plagued, overpopulated, overpop_deserters, dragon_type, dragon_name, hit_status, war, source, saved_by, received_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, datetime('now')))
    `).run(provId, keyHash, data.plagued ? 1 : 0, data.overpopulated ? 1 : 0, data.overpopDeserters ?? null, data.dragonType ?? null, data.dragonName ?? null, data.hitStatus, data.war ? 1 : 0, src, savedBy, receivedAt ?? null);

    const insertEffect = db.prepare(`
      INSERT OR IGNORE INTO province_effects (province_id, key_hash, effect_name, effect_kind, duration_text, remaining_ticks, effectiveness_percent, source, saved_by, received_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, datetime('now')))
    `);
    for (const effect of data.activeEffects) {
      insertEffect.run(
        provId,
        keyHash,
        effect.name,
        effect.kind,
        effect.durationText,
        effect.remainingTicks,
        effect.effectivenessPercent,
        src,
        savedBy,
        receivedAt ?? null,
      );
    }

    // 6. Armies out (self-throne only)
    if (isSelfThrone && data.armiesOut?.length) {
      const milResult = db.prepare(`
        INSERT OR IGNORE INTO military_intel (province_id, key_hash, ome, dme, source, saved_by, accuracy, received_at)
        VALUES (?, ?, NULL, NULL, 'throne', ?, ?, COALESCE(?, datetime('now')))
      `).run(provId, keyHash, savedBy, data.accuracy, receivedAt ?? null);
      if (milResult.changes === 0) return;
      const milId = milResult.lastInsertRowid;
      const insArmy = db.prepare(`
        INSERT INTO som_armies (military_intel_id, army_type, land_gained, return_days)
        VALUES (?, ?, ?, ?)
      `);
      data.armiesOut.forEach((a, i) => {
        insArmy.run(milId, `out_${i + 1}`, a.acres, a.daysLeft);
      });
    }
    updateMetricsCache(db, provId, keyHash);
  })();
}

export function storeSoD(data: SoDData, savedBy: string, keyHash: string, receivedAt?: string) {
  const db = getDb();
  db.transaction(() => {
    const provId = ensureProvince(db, data.name, data.kingdom);
    recordSubmission(db, keyHash, provId);

    // SoD returns net modified def at home
    db.prepare(`
      INSERT OR IGNORE INTO home_military_points (province_id, key_hash, mod_off_at_home, mod_def_at_home, source, saved_by, accuracy, received_at)
      VALUES (?, ?, NULL, ?, 'sod', ?, ?, COALESCE(?, datetime('now')))
    `).run(provId, keyHash, data.defPoints, savedBy, data.accuracy, receivedAt ?? null);
  })();
}

export function storeInfiltrate(data: InfiltrateData, savedBy: string, keyHash: string, receivedAt?: string) {
  const db = getDb();
  db.transaction(() => {
    const provId = ensureProvince(db, data.name, data.kingdom);
    recordSubmission(db, keyHash, provId);
    db.prepare(`
      INSERT OR IGNORE INTO province_resources (province_id, key_hash, thieves, source, saved_by, accuracy, received_at)
      VALUES (?, ?, ?, 'infiltrate', ?, ?, COALESCE(?, datetime('now')))
    `).run(provId, keyHash, data.thieves, savedBy, data.accuracy, receivedAt ?? null);
    updateMetricsCache(db, provId, keyHash);
  })();
}

export function storeSoM(data: SoMData, savedBy: string, keyHash: string, isSelf = false, receivedAt?: string) {
  const db = getDb();
  const src = isSelf ? "council_military" : "som";
  db.transaction(() => {
    const provId = ensureProvince(db, data.name, data.kingdom);
    recordSubmission(db, keyHash, provId);

    // Troops at home from SoM home army
    const homeArmy = data.armies.find((a) => a.armyType === "home");
    if (homeArmy) {
      db.prepare(`
        INSERT OR IGNORE INTO province_troops (province_id, key_hash, soldiers, off_specs, def_specs, elites, war_horses, peasants, source, saved_by, accuracy, received_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, COALESCE(?, datetime('now')))
      `).run(provId, keyHash, homeArmy.soldiers, homeArmy.offSpecs, homeArmy.defSpecs, homeArmy.elites, homeArmy.warHorses, src, savedBy, data.accuracy, receivedAt ?? null);
    }

    // Net modified off/def at home
    db.prepare(`
      INSERT OR IGNORE INTO home_military_points (province_id, key_hash, mod_off_at_home, mod_def_at_home, source, saved_by, accuracy, received_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, COALESCE(?, datetime('now')))
    `).run(provId, keyHash, data.netOffense, data.netDefense, src, savedBy, data.accuracy, receivedAt ?? null);

    // Military effectiveness + army detail
    const result = db.prepare(`
      INSERT OR IGNORE INTO military_intel (province_id, key_hash, ome, dme, source, saved_by, accuracy, received_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, COALESCE(?, datetime('now')))
    `).run(provId, keyHash, data.ome, data.dme, src, savedBy, data.accuracy, receivedAt ?? null);
    if (result.changes === 0) return;

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

export function storeTrainArmy(data: TrainArmyData, savedBy: string, keyHash: string, receivedAt?: string) {
  const db = getDb();
  db.transaction(() => {
    const provId = ensureProvince(db, data.name, data.kingdom);
    recordSubmission(db, keyHash, provId);
    db.prepare(`
      INSERT OR IGNORE INTO province_resources (province_id, key_hash, free_specialist_credits, source, saved_by, accuracy, received_at)
      VALUES (?, ?, ?, 'train_army', ?, 100, COALESCE(?, datetime('now')))
    `).run(provId, keyHash, data.freeSpecialistCredits, savedBy, receivedAt ?? null);
  })();
}

export function storeBuild(data: BuildData, savedBy: string, keyHash: string, receivedAt?: string) {
  const db = getDb();
  db.transaction(() => {
    const provId = ensureProvince(db, data.name, data.kingdom);
    recordSubmission(db, keyHash, provId);
    db.prepare(`
      INSERT OR IGNORE INTO province_resources (province_id, key_hash, free_building_credits, source, saved_by, accuracy, received_at)
      VALUES (?, ?, ?, 'build', ?, 100, COALESCE(?, datetime('now')))
    `).run(provId, keyHash, data.freeBuildingCredits, savedBy, receivedAt ?? null);
  })();
}

export function storeRob(data: RobData, savedBy: string, keyHash: string, receivedAt?: string) {
  const db = getDb();
  db.transaction(() => {
    const provId = ensureProvince(db, data.name, "");
    recordSubmission(db, keyHash, provId);
    const result = db.prepare(`
      INSERT OR IGNORE INTO rob_ops
        (province_id, key_hash, op, target_name, target_slot, target_kingdom,
         outcome, amount_stolen, thieves_lost, thieves, stealth,
         troops_assassinated, kidnapped, acres_burned, effect_duration,
         saved_by, received_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, datetime('now')))
    `).run(
      provId, keyHash, data.op,
      data.targetName, data.targetSlot, data.targetKingdom,
      data.outcome, data.amountStolen, data.thievesLost,
      data.thieves, data.stealth,
      data.troopsAssassinated, data.kidnapped, data.acresBurned, data.effectDuration,
      savedBy, receivedAt ?? null,
    );
    if (result.changes === 0) return;
    if (data.thieves != null) {
      db.prepare(`
        INSERT OR IGNORE INTO province_resources (province_id, key_hash, thieves, source, saved_by, accuracy, received_at)
        VALUES (?, ?, ?, 'rob', ?, 100, COALESCE(?, datetime('now')))
      `).run(provId, keyHash, data.thieves, savedBy, receivedAt ?? null);
    }
  })();
}

export function storeIntelOp(data: IntelOpAttempt, savedBy: string, keyHash: string, receivedAt?: string) {
  const db = getDb();
  db.transaction(() => {
    const provId = ensureProvince(db, savedBy, "");
    recordSubmission(db, keyHash, provId);
    const target = resolveIntelOpTarget(db, data, keyHash);
    db.prepare(`
      INSERT OR IGNORE INTO intel_ops
        (province_id, key_hash, op, intel_type, outcome,
         target_name, target_slot, target_kingdom, accuracy, thieves_lost,
         saved_by, received_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, datetime('now')))
    `).run(
      provId, keyHash, data.op, data.intelType, data.outcome,
      target.targetName, target.targetSlot, target.targetKingdom, data.accuracy, data.thievesLost,
      savedBy, receivedAt ?? null,
    );
  })();
}

function resolveIntelOpTarget(db: Database.Database, data: IntelOpAttempt, keyHash: string) {
  let targetName = data.targetName;
  let targetSlot = data.targetSlot;
  const targetKingdom = data.targetKingdom;

  if (targetKingdom && targetName == null && targetSlot != null) {
    const row = db.prepare(`
      SELECT kp.name
      FROM kingdom_provinces kp
      JOIN kingdom_intel ki ON ki.id = kp.kingdom_intel_id
      WHERE ki.key_hash = ? AND ki.location = ? AND kp.slot = ?
      ORDER BY ki.received_at DESC, ki.id DESC
      LIMIT 1
    `).get(keyHash, targetKingdom, targetSlot) as { name: string } | undefined;
    targetName = row?.name ?? null;
  }

  if (targetKingdom && targetSlot == null && targetName) {
    const row = db.prepare(`
      SELECT kp.slot
      FROM kingdom_provinces kp
      JOIN kingdom_intel ki ON ki.id = kp.kingdom_intel_id
      WHERE ki.key_hash = ? AND ki.location = ? AND kp.name = ?
      ORDER BY ki.received_at DESC, ki.id DESC
      LIMIT 1
    `).get(keyHash, targetKingdom, targetName) as { slot: number | null } | undefined;
    targetSlot = row?.slot ?? null;
  }

  return { targetName, targetSlot, targetKingdom };
}

export function storeSorcery(data: SorceryData, savedBy: string, keyHash: string, receivedAt?: string) {
  const db = getDb();
  db.transaction(() => {
    const provId = ensureProvince(db, data.name, "");
    recordSubmission(db, keyHash, provId);
    const result = db.prepare(`
      INSERT OR IGNORE INTO sorcery_ops
        (province_id, key_hash, spell, outcome, runes_spent, wizards_lost,
         duration_days, target_name, target_slot, target_kingdom,
         wizards, runes, mana, saved_by, received_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, datetime('now')))
    `).run(
      provId, keyHash, data.spell, data.outcome, data.runesSpent, data.wizardsLost,
      data.durationDays, data.targetName, data.targetSlot, data.targetKingdom,
      data.wizards, data.runes, data.mana, savedBy, receivedAt ?? null,
    );
    if (result.changes === 0) return;
    if (data.wizards != null || data.runes != null) {
      db.prepare(`
        INSERT OR IGNORE INTO province_resources
          (province_id, key_hash, wizards, runes, mana, source, saved_by, accuracy, received_at)
        VALUES (?, ?, ?, ?, ?, 'sorcery', ?, 100, COALESCE(?, datetime('now')))
      `).run(provId, keyHash, data.wizards, data.runes, data.mana, savedBy, receivedAt ?? null);
    }
  })();
}

export function storeAttack(data: AttackData, savedBy: string, keyHash: string, receivedAt?: string) {
  const db = getDb();
  db.transaction(() => {
    const provId = ensureProvince(db, data.name, "");
    recordSubmission(db, keyHash, provId);
    db.prepare(`
      INSERT OR IGNORE INTO attack_ops
        (province_id, key_hash, attack_type, outcome, target_name, target_kingdom,
         acres_taken, buildings_survived, specialist_credits, peasants_settled,
         massacred, enemy_killed, enemy_imprisoned, return_days, saved_by, received_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, datetime('now')))
    `).run(
      provId, keyHash, data.attackType, data.outcome,
      data.targetName, data.targetKingdom,
      data.acresTaken, data.buildingsSurvived, data.specialistCredits, data.peasantsSettled,
      data.massacred, data.enemyKilled, data.enemyImprisoned, data.returnDays, savedBy, receivedAt ?? null,
    );
  })();
}

export function storeSoS(data: SoSData, savedBy: string, keyHash: string, isSelf = false, receivedAt?: string) {
  const db = getDb();
  const src = isSelf ? "council_science" : "sos";
  db.transaction(() => {
    const provId = ensureProvince(db, data.name, data.kingdom);
    recordSubmission(db, keyHash, provId);

    const result = db.prepare(`
      INSERT OR IGNORE INTO sos_intel (province_id, key_hash, source, saved_by, accuracy, received_at)
      VALUES (?, ?, ?, ?, ?, COALESCE(?, datetime('now')))
    `).run(provId, keyHash, src, savedBy, data.accuracy, receivedAt ?? null);
    if (result.changes === 0) return;

    const sosId = result.lastInsertRowid;
    const ins = db.prepare("INSERT INTO sos_sciences (sos_intel_id, science, books, effect) VALUES (?, ?, ?, ?)");
    for (const s of data.sciences) {
      ins.run(sosId, s.science, s.books, s.effect);
    }
    updateMetricsCache(db, provId, keyHash);
  })();
}

export function storeSurvey(data: SurveyData, savedBy: string, keyHash: string, isSelf = false, receivedAt?: string) {
  const db = getDb();
  const src = isSelf ? "council_internal" : "survey";
  db.transaction(() => {
    const provId = ensureProvince(db, data.name, data.kingdom);
    recordSubmission(db, keyHash, provId);

    const result = db.prepare(`
      INSERT OR IGNORE INTO survey_intel (province_id, key_hash, source, saved_by, accuracy, thievery_effectiveness, thief_prevent_chance, castles_effect, received_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, datetime('now')))
    `).run(
      provId,
      keyHash,
      src,
      savedBy,
      data.accuracy,
      data.thieveryEffectiveness ?? null,
      data.thiefPreventChance ?? null,
      data.castlesEffect ?? null,
      receivedAt ?? null,
    );
    if (result.changes === 0) return;

    const surveyId = result.lastInsertRowid;
    const ins = db.prepare("INSERT INTO survey_buildings (survey_intel_id, building, built, in_progress) VALUES (?, ?, ?, ?)");
    for (const b of data.buildings) {
      ins.run(surveyId, b.building, b.built, b.inProgress);
    }
    updateMetricsCache(db, provId, keyHash);
  })();
}

export function storeKingdom(data: KingdomData, savedBy: string, keyHash: string, receivedAt?: string) {
  const db = getDb();
  db.transaction(() => {
    const result = db.prepare(`
      INSERT OR IGNORE INTO kingdom_intel (
        key_hash, name, location, kingdom_title, total_networth, total_land, total_honor, wars_won, war_losses, networth_rank, land_rank, honor_rank, war_target,
        their_attitude_to_us, their_attitude_points,
        our_attitude_to_them, our_attitude_points,
        hostility_meter_visible_until, open_relations_json, war_doctrines_json, saved_by, received_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, datetime('now')))
    `).run(
      keyHash,
      data.name,
      data.location,
      data.kingdomTitle,
      data.totalNetworth,
      data.totalLand,
      data.totalHonor,
      data.warsWon,
      data.warLosses,
      data.networthRank,
      data.landRank,
      data.honorRank,
      data.warTarget,
      data.theirAttitudeToUs,
      data.theirAttitudePoints,
      data.ourAttitudeToThem,
      data.ourAttitudePoints,
      data.hostilityMeterVisibleUntil,
      JSON.stringify(data.openRelations),
      data.warDoctrines.length > 0 ? JSON.stringify(data.warDoctrines) : null,
      savedBy,
      receivedAt ?? null,
    );
    if (result.changes === 0) return;

    const kdId = result.lastInsertRowid;
    const ins = db.prepare("INSERT INTO kingdom_provinces (kingdom_intel_id, slot, name, race, land, networth, honor_title) VALUES (?, ?, ?, ?, ?, ?, ?)");

    for (const p of data.provinces) {
      const provId = ensureProvince(db, p.name, data.location);
      recordSubmission(db, keyHash, provId);
      ins.run(kdId, p.slot, p.name, p.race, p.land, p.networth, p.honorTitle);

      // Also write to province_overview
      db.prepare(`
        INSERT OR IGNORE INTO province_overview (province_id, key_hash, race, personality, honor_title, land, networth, source, saved_by, received_at)
        VALUES (?, ?, ?, NULL, ?, ?, ?, 'kingdom', ?, COALESCE(?, datetime('now')))
      `).run(provId, keyHash, p.race, p.honorTitle, p.land, p.networth, savedBy, receivedAt ?? null);
    }
  })();
}

export function storeState(data: StateData, savedBy: string, keyHash: string, receivedAt?: string) {
  const db = getDb();
  db.transaction(() => {
    const provId = ensureProvince(db, data.name, data.kingdom);
    recordSubmission(db, keyHash, provId);

    // Overview: land and networth (no race/personality from council_state)
    db.prepare(`
      INSERT OR IGNORE INTO province_overview (province_id, key_hash, land, networth, source, saved_by, accuracy, received_at)
      VALUES (?, ?, ?, ?, 'state', ?, 100, COALESCE(?, datetime('now')))
    `).run(provId, keyHash, data.land, data.networth, savedBy, receivedAt ?? null);

    // Resources: thieves, wizards, and direct population counts (self-intel is always 100% accurate)
    db.prepare(`
      INSERT OR IGNORE INTO province_resources (province_id, key_hash, thieves, wizards, total_pop, max_pop, source, saved_by, accuracy, received_at)
      VALUES (?, ?, ?, ?, ?, ?, 'state', ?, 100, COALESCE(?, datetime('now')))
    `).run(provId, keyHash, data.thieves, data.wizards, data.totalPop ?? null, data.maxPop ?? null, savedBy, receivedAt ?? null);

    // Peasants live in province_troops
    db.prepare(`
      INSERT OR IGNORE INTO province_troops (province_id, key_hash, peasants, source, saved_by, accuracy, received_at)
      VALUES (?, ?, ?, 'state', ?, 100, COALESCE(?, datetime('now')))
    `).run(provId, keyHash, data.peasants, savedBy, receivedAt ?? null);
    updateMetricsCache(db, provId, keyHash);
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
  kingdomTitle: string | null;
  totalNetworth: number | null;
  totalLand: number | null;
  totalHonor: number | null;
  warsWon: number | null;
  warLosses: number | null;
  networthRank: number | null;
  landRank: number | null;
  honorRank: number | null;
  warTarget: string | null;
  theirAttitudeToUs: string | null;
  theirAttitudePoints: number | null;
  ourAttitudeToThem: string | null;
  ourAttitudePoints: number | null;
  hostilityMeterVisibleUntil: string | null;
  openRelations: KingdomOpenRelation[];
  warDoctrines: WarDoctrine[];
  receivedAt: string;
  provinces: KingdomSnapshotProvince[];
}

export interface KingdomSnapshotHistoryPoint {
  id: number;
  name: string;
  location: string;
  kingdomTitle: string | null;
  totalNetworth: number | null;
  totalLand: number | null;
  totalHonor: number | null;
  warsWon: number | null;
  warLosses: number | null;
  networthRank: number | null;
  landRank: number | null;
  honorRank: number | null;
  receivedAt: string;
}

export function getBoundKingdom(keyHash: string): string | null {
  return createDbApi(getDb()).getBoundKingdom(keyHash);
}

export function getKingdoms(keyHash: string): KingdomRow[] {
  return createDbApi(getDb()).getKingdoms(keyHash);
}

export function getLatestKingdomSnapshot(location: string, keyHash: string): KingdomSnapshot | null {
  return createDbApi(getDb()).getLatestKingdomSnapshot(location, keyHash);
}

export function getKingdomSnapshotHistory(location: string, keyHash: string): KingdomSnapshotHistoryPoint[] {
  return createDbApi(getDb()).getKingdomSnapshotHistory(location, keyHash);
}

export interface RecentOp {
  op_type: string;
  op_category: string;
  received_at: string;
  saved_by: string | null;
  province_name: string;
  kingdom: string;
  actor_name: string | null;
  actor_kingdom: string | null;
  outcome: string | null;
  summary: string | null;
  detail_value: number | null;
  detail_kind: string | null;
  slot: number | null;
}

export function getRecentOps(keyHash: string, limit = 20, since?: string): RecentOp[] {
  return createDbApi(getDb()).getRecentOps(keyHash, limit, since);
}

export interface ProvinceRow {
  id: number;
  slot: number | null;
  name: string;
  kingdom: string;
  race: string | null;
  personality: string | null;
  honor_title: string | null;
  land: number | null;
  networth: number | null;
  overview_age: string | null;
  overview_source: string | null;
  off_points: number | null;
  def_points: number | null;
  military_age: string | null;
  military_source: string | null;
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
  home_mil_source: string | null;
  money: number | null;
  food: number | null;
  runes: number | null;
  prisoners: number | null;
  trade_balance: number | null;
  building_efficiency: number | null;
  thieves: number | null;
  thieves_age: string | null;
  stealth: number | null;
  wizards: number | null;
  mana: number | null;
  total_pop: number | null;
  max_pop: number | null;
  resources_age: string | null;
  resources_source: string | null;
  free_specialist_credits: number | null;
  free_specialist_credits_age: string | null;
  free_building_credits: number | null;
  free_building_credits_age: string | null;
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
  throne_age: string | null;
  sciences_age: string | null;
  crime_effect: number | null;
  channeling_effect: number | null;
  siege_effect: number | null;
  shielding_effect: number | null;
  science_total_books: number | null;
  survey_age: string | null;
  watch_towers_effect: number | null;
  thieves_dens_effect: number | null;
  castles_effect: number | null;
  housing_effect: number | null;
  barren_land: number | null;
  homes_built: number | null;
  guilds_built: number | null;
  buildings_built: number | null;
  buildings_in_progress: number | null;
  armies_out_count: number | null;
  land_incoming: number | null;
  earliest_return: number | null;
  som_armies_json: string | null;
  throne_armies_json: string | null;
  armies_out_json: string | null;
  cached_rtpa?: number | null;
  cached_rtpa_age?: string | null;
  cached_mtpa?: number | null;
  cached_mtpa_age?: string | null;
  cached_otpa?: number | null;
  cached_otpa_age?: string | null;
  cached_dtpa?: number | null;
  cached_dtpa_age?: string | null;
  cached_rwpa?: number | null;
  cached_rwpa_age?: string | null;
  cached_mwpa?: number | null;
  cached_mwpa_age?: string | null;
}

type SomArmy = { type: string; generals: number; soldiers: number; offSpecs: number; defSpecs: number; elites: number; warHorses: number; thieves: number; land: number; eta: number };
type ThroneArmy = { type: string; land: number; eta: number };

function mergeArmyArrays(somArmies: SomArmy[], throneArmies: ThroneArmy[], throneNewer: boolean): ArmyRow[] {
  if (!throneNewer || throneArmies.length === 0) {
    return somArmies.map((a) => ({
      armyType: a.type, generals: a.generals, soldiers: a.soldiers,
      offSpecs: a.offSpecs, defSpecs: a.defSpecs, elites: a.elites,
      warHorses: a.warHorses, thieves: a.thieves, landGained: a.land, returnDays: a.eta,
    }));
  }
  const somByType = new Map(somArmies.map((a) => [a.type, a]));
  const outArmies: ArmyRow[] = throneArmies.map((t) => {
    const s = somByType.get(t.type);
    return {
      armyType: t.type,
      generals: s?.generals ?? null, soldiers: s?.soldiers ?? null,
      offSpecs: s?.offSpecs ?? null, defSpecs: s?.defSpecs ?? null, elites: s?.elites ?? null,
      warHorses: s?.warHorses ?? null, thieves: s?.thieves ?? null,
      landGained: t.land ?? s?.land ?? null, returnDays: t.eta,
    };
  });
  const nonOutArmies: ArmyRow[] = somArmies
    .filter((a) => !a.type.startsWith("out_"))
    .map((a) => ({
      armyType: a.type, generals: a.generals, soldiers: a.soldiers,
      offSpecs: a.offSpecs, defSpecs: a.defSpecs, elites: a.elites,
      warHorses: a.warHorses, thieves: a.thieves, landGained: a.land, returnDays: a.eta,
    }));
  return [...nonOutArmies, ...outArmies];
}

function mergeArmiesJson(
  somJson: string | null,
  throneJson: string | null,
  somAge: string | null,
  throneAge: string | null,
): string | null {
  if (!somJson && !throneJson) return null;
  const throneNewer = !!(throneAge && (!somAge || throneAge > somAge));
  const somArmies: SomArmy[] = somJson ? JSON.parse(somJson) : [];
  const throneArmies: ThroneArmy[] = throneJson ? JSON.parse(throneJson) : [];
  const merged = mergeArmyArrays(somArmies, throneArmies, throneNewer);
  return merged.length ? JSON.stringify(merged.map((a) => ({
    type: a.armyType, soldiers: a.soldiers ?? 0, offSpecs: a.offSpecs ?? 0,
    defSpecs: a.defSpecs ?? 0, elites: a.elites ?? 0, land: a.landGained ?? 0, eta: a.returnDays,
  }))) : null;
}

export function getKingdomProvinces(kingdom: string, keyHash: string): ProvinceRow[] {
  return createDbApi(getDb()).getKingdomProvinces(kingdom, keyHash);
}

export interface ArmyRow {
  armyType: string;
  generals: number | null;
  soldiers: number | null;
  offSpecs: number | null;
  defSpecs: number | null;
  elites: number | null;
  warHorses: number | null;
  thieves: number | null;
  landGained: number | null;
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
  province: { id: number; name: string; kingdom: string; slot: number | null } | null;
  overview: { race: string | null; personality: string | null; honorTitle: string | null; ruler: string | null; land: number | null; networth: number | null; source: string; savedBy: string | null; receivedAt: string } | null;
  totalMilitary: { offPoints: number | null; defPoints: number | null; source: string; receivedAt: string } | null;
  homeMilitary: { modOffAtHome: number | null; modDefAtHome: number | null; source: string; receivedAt: string } | null;
  sot: { soldiers: number | null; offSpecs: number | null; defSpecs: number | null; elites: number | null; warHorses: number | null; peasants: number | null; source: string; receivedAt: string } | null;
  resources: { money: number | null; food: number | null; runes: number | null; prisoners: number | null; tradeBalance: number | null; buildingEfficiency: number | null; thieves: number | null; thievesAge: string | null; stealth: number | null; wizards: number | null; mana: number | null; totalPop: number | null; maxPop: number | null; freeSpecialistCredits: number | null; freeSpecialistCreditsAge: string | null; freeBuildingCredits: number | null; freeBuildingCreditsAge: string | null; receivedAt: string } | null;
  status: { plagued: boolean; overpopulated: boolean; overpopDeserters: number | null; dragonType: string | null; dragonName: string | null; hitStatus: string | null; war: boolean; receivedAt: string } | null;
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

export interface KingdomDragon {
  dragonType: string;
  dragonName: string;
  receivedAt: string;
}

function getKingdomProvincesForDb(db: Database.Database, kingdom: string, keyHash: string): ProvinceRow[] {
  const baseRows = db.prepare(`
    WITH ${latestSlotCte("AND ki.location = @kingdom")}
    SELECT p.id, p.name, p.kingdom,
           (SELECT ls.slot FROM latest_slot ls WHERE ls.kingdom = p.kingdom AND ls.name = p.name) AS slot,
           ${OVERVIEW_RACE_SQL}, ${OVERVIEW_PERS_SQL}, ${OVERVIEW_HONOR_SQL}, po.land, po.networth, po.received_at AS overview_age, po.source AS overview_source,
           p.cached_rtpa, p.cached_rtpa_age,
           p.cached_mtpa, p.cached_mtpa_age,
           p.cached_otpa, p.cached_otpa_age,
           p.cached_dtpa, p.cached_dtpa_age,
           p.cached_rwpa, p.cached_rwpa_age,
           p.cached_mwpa, p.cached_mwpa_age
    FROM provinces p
    JOIN province_overview po ON po.id = (
      SELECT po2.id FROM province_overview po2
      WHERE po2.province_id = p.id AND po2.key_hash = @keyHash
      ORDER BY po2.received_at DESC, po2.id DESC
      LIMIT 1
    )
    WHERE p.kingdom = @kingdom
      AND EXISTS (
        SELECT 1 FROM intel_partitions
        WHERE key_hash = @keyHash AND province_id = p.id
      )
      -- Hide superseded provinces: after a reset, the old name keeps its slot
      -- in historical snapshots. Show a province only if it is the current
      -- holder of its slot (in latest_slot), or if it never appeared on any
      -- kingdom page at all (SoT-only intel, no slot).
      AND (
        EXISTS (SELECT 1 FROM latest_slot WHERE kingdom = p.kingdom AND name = p.name)
        OR NOT EXISTS (
          SELECT 1 FROM kingdom_provinces kp
          JOIN kingdom_intel ki ON kp.kingdom_intel_id = ki.id
          WHERE ki.location = p.kingdom AND ki.key_hash = @keyHash AND kp.name = p.name
        )
      )
    ORDER BY po.networth DESC NULLS LAST
  `).all({ keyHash, kingdom }) as Array<Partial<ProvinceRow> & { id: number; name: string; kingdom: string }>;

  const rows = baseRows.map((base) => ({
    ...base,
    off_points: null, def_points: null, military_age: null, military_source: null,
    soldiers: null, off_specs: null, def_specs: null, elites: null, war_horses: null, peasants: null, troops_age: null, troops_source: null,
    soldiers_home: null, off_specs_home: null, def_specs_home: null, elites_home: null, troops_home_age: null,
    off_home: null, def_home: null, home_mil_age: null, home_mil_source: null,
    money: null, food: null, runes: null, prisoners: null, trade_balance: null, building_efficiency: null,
    thieves: null, thieves_age: null, stealth: null, wizards: null, mana: null, total_pop: null, max_pop: null,
    resources_age: null, resources_source: null, free_specialist_credits: null, free_specialist_credits_age: null,
    free_building_credits: null, free_building_credits_age: null, hit_status: null, status_age: null,
    effects_age: null, good_spell_details: null, bad_spell_details: null, good_spell_count: null, bad_spell_count: null,
    ome: null, dme: null, som_age: null, throne_age: null, sciences_age: null, crime_effect: null,
    channeling_effect: null, siege_effect: null, shielding_effect: null, science_total_books: null,
    survey_age: null, watch_towers_effect: null, thieves_dens_effect: null, castles_effect: null, housing_effect: null,
    barren_land: null, homes_built: null, guilds_built: null, buildings_built: null, buildings_in_progress: null,
    armies_out_count: null, land_incoming: null, earliest_return: null,
    som_armies_json: null, throne_armies_json: null, armies_out_json: null,
  })) as ProvinceRow[];

  if (rows.length === 0) return rows;

  hydrateKingdomProvinceRows(db, rows, keyHash);

  for (const row of rows) {
    row.armies_out_json = mergeArmiesJson(row.som_armies_json, row.throne_armies_json, row.som_age, row.throne_age);
    const allArmiesHome = (row.armies_out_count ?? 0) === 0;
    const homeMilitaryNewer = !!row.home_mil_age && (!row.military_age || row.home_mil_age > row.military_age);
    const homeMilitaryFromSoM = row.home_mil_source === "som" || row.home_mil_source === "council_military";
    if (row.som_age && allArmiesHome && homeMilitaryNewer && homeMilitaryFromSoM) {
      if (row.off_home != null) row.off_points = row.off_home;
      if (row.def_home != null) row.def_points = row.def_home;
      if (row.off_home != null || row.def_home != null) {
        row.military_age = row.home_mil_age;
        row.military_source = row.home_mil_source;
      }
    }
  }
  return rows;
}

function hydrateKingdomProvinceRows(db: Database.Database, rows: ProvinceRow[], keyHash: string) {
  const byId = new Map(rows.map((row) => [row.id, row]));
  const ids = rows.map((row) => row.id);
  const idList = ids.map(() => "?").join(", ");
  const params = () => [keyHash, ...ids];

  const totalMilitaryRows = db.prepare(`
    SELECT province_id, off_points, def_points, received_at AS military_age, source AS military_source
    FROM (
      SELECT tmp.*,
             row_number() OVER (PARTITION BY tmp.province_id ORDER BY tmp.received_at DESC, tmp.id DESC) AS rn
      FROM total_military_points tmp
      WHERE tmp.key_hash = ? AND tmp.province_id IN (${idList})
    )
    WHERE rn = 1
  `).all(...params()) as any[];
  for (const source of totalMilitaryRows) {
    Object.assign(byId.get(source.province_id)!, {
      off_points: source.off_points,
      def_points: source.def_points,
      military_age: source.military_age,
      military_source: source.military_source,
    });
  }

  const troopRows = db.prepare(`
    SELECT province_id, source_group, soldiers, off_specs, def_specs, elites, war_horses, peasants, received_at, source
    FROM (
      SELECT pt.*,
             CASE
               WHEN pt.source IN ('sot', 'throne') THEN 'total'
               WHEN pt.source IN ('som', 'council_military') THEN 'home'
             END AS source_group,
             row_number() OVER (
               PARTITION BY pt.province_id,
                            CASE
                              WHEN pt.source IN ('sot', 'throne') THEN 'total'
                              WHEN pt.source IN ('som', 'council_military') THEN 'home'
                            END
               ORDER BY pt.received_at DESC, pt.id DESC
             ) AS rn
      FROM province_troops pt
      WHERE pt.key_hash = ?
        AND pt.province_id IN (${idList})
        AND pt.source IN ('sot', 'throne', 'som', 'council_military')
    )
    WHERE rn = 1
  `).all(...params()) as any[];
  for (const source of troopRows) {
    const row = byId.get(source.province_id)!;
    if (source.source_group === "total") {
      Object.assign(row, {
        soldiers: source.soldiers,
        off_specs: source.off_specs,
        def_specs: source.def_specs,
        elites: source.elites,
        war_horses: source.war_horses,
        peasants: source.peasants,
        troops_age: source.received_at,
        troops_source: source.source,
      });
    } else {
      Object.assign(row, {
        soldiers_home: source.soldiers,
        off_specs_home: source.off_specs,
        def_specs_home: source.def_specs,
        elites_home: source.elites,
        troops_home_age: source.received_at,
      });
    }
  }

  const resourceRows = db.prepare(`
    SELECT province_id, money, food, runes, prisoners, trade_balance, building_efficiency, stealth, wizards, mana,
           received_at AS resources_age, source AS resources_source
    FROM (
      SELECT pr.*,
             row_number() OVER (PARTITION BY pr.province_id ORDER BY pr.received_at DESC, pr.id DESC) AS rn
      FROM province_resources pr
      WHERE pr.key_hash = ?
        AND pr.province_id IN (${idList})
        AND pr.source IN ('sot', 'throne')
    )
    WHERE rn = 1
  `).all(...params()) as any[];
  for (const source of resourceRows) {
    Object.assign(byId.get(source.province_id)!, {
      money: source.money,
      food: source.food,
      runes: source.runes,
      prisoners: source.prisoners,
      trade_balance: source.trade_balance,
      building_efficiency: source.building_efficiency,
      stealth: source.stealth,
      wizards: source.wizards,
      mana: source.mana,
      resources_age: source.resources_age,
      resources_source: source.resources_source,
    });
  }

  const resourceFieldRows = db.prepare(`
    SELECT province_id, total_pop, max_pop, thieves, free_specialist_credits, free_building_credits, received_at
    FROM province_resources
    WHERE key_hash = ?
      AND province_id IN (${idList})
      AND (
        total_pop IS NOT NULL
        OR max_pop IS NOT NULL
        OR thieves IS NOT NULL
        OR free_specialist_credits IS NOT NULL
        OR free_building_credits IS NOT NULL
      )
    ORDER BY province_id ASC, received_at DESC, id DESC
  `).all(...params()) as any[];
  for (const source of resourceFieldRows) {
    const row = byId.get(source.province_id)!;
    if (row.total_pop == null && source.total_pop != null) row.total_pop = source.total_pop;
    if (row.max_pop == null && source.max_pop != null) row.max_pop = source.max_pop;
    if (row.thieves == null && source.thieves != null) {
      row.thieves = source.thieves;
      row.thieves_age = source.received_at;
    }
    if (row.free_specialist_credits == null && source.free_specialist_credits != null) {
      row.free_specialist_credits = source.free_specialist_credits;
      row.free_specialist_credits_age = source.received_at;
    }
    if (row.free_building_credits == null && source.free_building_credits != null) {
      row.free_building_credits = source.free_building_credits;
      row.free_building_credits_age = source.received_at;
    }
  }

  const statusRows = db.prepare(`
    SELECT province_id, hit_status, received_at AS status_age
    FROM (
      SELECT ps.*,
             row_number() OVER (PARTITION BY ps.province_id ORDER BY ps.received_at DESC, ps.id DESC) AS rn
      FROM province_status ps
      WHERE ps.key_hash = ? AND ps.province_id IN (${idList})
    )
    WHERE rn = 1
  `).all(...params()) as any[];
  for (const source of statusRows) {
    Object.assign(byId.get(source.province_id)!, {
      hit_status: source.hit_status,
      status_age: source.status_age,
    });
  }

  const spellRows = db.prepare(`
    WITH latest_effects AS (
      SELECT pe.province_id, pe.effect_name, pe.effect_kind, pe.remaining_ticks, pe.received_at,
             row_number() OVER (
               PARTITION BY pe.province_id, pe.effect_name, pe.effect_kind
               ORDER BY pe.id DESC
             ) AS rn
      FROM province_effects pe
      WHERE pe.key_hash = ?
        AND pe.province_id IN (${idList})
        AND pe.received_at = (
          SELECT MAX(pe2.received_at)
          FROM province_effects pe2
          WHERE pe2.province_id = pe.province_id AND pe2.key_hash = pe.key_hash
        )
    )
    SELECT province_id,
           MAX(received_at) AS effects_age,
           group_concat(CASE WHEN effect_kind = 'spell' AND effect_name NOT IN (${BAD_SPELL_SQL_LIST}) THEN effect_name || CASE WHEN remaining_ticks IS NOT NULL THEN ' (' || remaining_ticks || ')' ELSE '' END END, ' | ') AS good_spell_details,
           group_concat(CASE WHEN effect_kind = 'spell' AND effect_name IN (${BAD_SPELL_SQL_LIST}) THEN effect_name || CASE WHEN remaining_ticks IS NOT NULL THEN ' (' || remaining_ticks || ')' ELSE '' END END, ' | ') AS bad_spell_details,
           SUM(CASE WHEN effect_kind = 'spell' AND effect_name NOT IN (${BAD_SPELL_SQL_LIST}) THEN 1 ELSE 0 END) AS good_spell_count,
           SUM(CASE WHEN effect_kind = 'spell' AND effect_name IN (${BAD_SPELL_SQL_LIST}) THEN 1 ELSE 0 END) AS bad_spell_count
    FROM latest_effects
    WHERE rn = 1
    GROUP BY province_id
  `).all(...params()) as any[];
  for (const source of spellRows) {
    Object.assign(byId.get(source.province_id)!, {
      effects_age: source.effects_age,
      good_spell_details: source.good_spell_details,
      bad_spell_details: source.bad_spell_details,
      good_spell_count: source.good_spell_count,
      bad_spell_count: source.bad_spell_count,
    });
  }

  const scienceRows = db.prepare(`
    WITH latest_sos AS (
      SELECT *
      FROM (
        SELECT si.id, si.province_id, si.received_at,
               row_number() OVER (PARTITION BY si.province_id ORDER BY si.received_at DESC, si.id DESC) AS rn
        FROM sos_intel si
        WHERE si.key_hash = ? AND si.province_id IN (${idList})
      )
      WHERE rn = 1
    )
    SELECT si.province_id,
           si.received_at AS sciences_age,
           MAX(CASE WHEN ss.science = 'Crime' THEN ss.effect END) AS crime_effect,
           MAX(CASE WHEN ss.science = 'Siege' THEN ss.effect END) AS siege_effect,
           MAX(CASE WHEN ss.science = 'Channeling' THEN ss.effect END) AS channeling_effect,
           MAX(CASE WHEN ss.science = 'Shielding' THEN ss.effect END) AS shielding_effect,
           MAX(CASE WHEN ss.science = 'Housing' THEN ss.effect END) AS housing_effect,
           SUM(ss.books) AS science_total_books
    FROM latest_sos si
    LEFT JOIN sos_sciences ss ON ss.sos_intel_id = si.id
    GROUP BY si.province_id, si.received_at
  `).all(...params()) as any[];
  for (const source of scienceRows) {
    Object.assign(byId.get(source.province_id)!, {
      sciences_age: source.sciences_age,
      crime_effect: source.crime_effect,
      siege_effect: source.siege_effect,
      channeling_effect: source.channeling_effect,
      shielding_effect: source.shielding_effect,
      housing_effect: source.housing_effect,
      science_total_books: source.science_total_books,
    });
  }

  const surveyRows = db.prepare(`
    WITH latest_survey AS (
      SELECT *
      FROM (
        SELECT si.id, si.province_id, si.received_at, si.thief_prevent_chance, si.thievery_effectiveness, si.castles_effect,
               row_number() OVER (PARTITION BY si.province_id ORDER BY si.received_at DESC, si.id DESC) AS rn
        FROM survey_intel si
        WHERE si.key_hash = ? AND si.province_id IN (${idList})
      )
      WHERE rn = 1
    )
    SELECT si.province_id,
           si.received_at AS survey_age,
           si.thief_prevent_chance AS watch_towers_effect,
           si.thievery_effectiveness AS thieves_dens_effect,
           si.castles_effect,
           MAX(CASE WHEN sb.building = 'Barren Land' THEN sb.built END) AS barren_land,
           MAX(CASE WHEN sb.building = 'Homes' THEN sb.built END) AS homes_built,
           MAX(CASE WHEN sb.building = 'Guilds' THEN sb.built END) AS guilds_built,
           SUM(CASE WHEN sb.building != 'Barren Land' THEN sb.built ELSE 0 END) AS buildings_built,
           SUM(sb.in_progress) AS buildings_in_progress
    FROM latest_survey si
    LEFT JOIN survey_buildings sb ON sb.survey_intel_id = si.id
    GROUP BY si.province_id, si.received_at, si.thief_prevent_chance, si.thievery_effectiveness, si.castles_effect
  `).all(...params()) as any[];
  for (const source of surveyRows) {
    Object.assign(byId.get(source.province_id)!, {
      survey_age: source.survey_age,
      watch_towers_effect: source.watch_towers_effect,
      thieves_dens_effect: source.thieves_dens_effect,
      castles_effect: source.castles_effect,
      barren_land: source.barren_land,
      homes_built: source.homes_built,
      guilds_built: source.guilds_built,
      buildings_built: source.buildings_built,
      buildings_in_progress: source.buildings_in_progress,
    });
  }

  const homeMilitaryRows = db.prepare(`
    SELECT province_id, mod_off_at_home AS off_home, mod_def_at_home AS def_home,
           received_at AS home_mil_age, source AS home_mil_source
    FROM (
      SELECT hmp.*,
             row_number() OVER (PARTITION BY hmp.province_id ORDER BY hmp.received_at DESC, hmp.id DESC) AS rn
      FROM home_military_points hmp
      WHERE hmp.key_hash = ? AND hmp.province_id IN (${idList})
    )
    WHERE rn = 1
  `).all(...params()) as any[];
  for (const source of homeMilitaryRows) {
    Object.assign(byId.get(source.province_id)!, {
      off_home: source.off_home,
      def_home: source.def_home,
      home_mil_age: source.home_mil_age,
      home_mil_source: source.home_mil_source,
    });
  }

  const militaryRows = db.prepare(`
    SELECT province_id, source_group, ome, dme, received_at
    FROM (
      SELECT mi.*,
             CASE
               WHEN mi.source IN ('som', 'council_military') THEN 'som'
               WHEN mi.source = 'throne' THEN 'throne'
             END AS source_group,
             row_number() OVER (
               PARTITION BY mi.province_id,
                            CASE
                              WHEN mi.source IN ('som', 'council_military') THEN 'som'
                              WHEN mi.source = 'throne' THEN 'throne'
                            END
               ORDER BY mi.received_at DESC, mi.id DESC
             ) AS rn
      FROM military_intel mi
      WHERE mi.key_hash = ?
        AND mi.province_id IN (${idList})
        AND (mi.source IN ('som', 'council_military') OR mi.source = 'throne')
    )
    WHERE rn = 1
  `).all(...params()) as any[];
  for (const source of militaryRows) {
    const row = byId.get(source.province_id)!;
    if (source.source_group === "som") {
      row.ome = source.ome;
      row.dme = source.dme;
      row.som_age = source.received_at;
    } else {
      row.throne_age = source.received_at;
    }
  }

  const armyRows = db.prepare(`
    WITH latest_military AS (
      SELECT *
      FROM (
        SELECT mi.*,
               CASE
                 WHEN mi.source IN ('som', 'council_military') THEN 'som'
                 WHEN mi.source = 'throne' THEN 'throne'
               END AS source_group,
               row_number() OVER (
                 PARTITION BY mi.province_id,
                              CASE
                                WHEN mi.source IN ('som', 'council_military') THEN 'som'
                                WHEN mi.source = 'throne' THEN 'throne'
                              END
                 ORDER BY mi.received_at DESC, mi.id DESC
               ) AS rn
        FROM military_intel mi
        WHERE mi.key_hash = ?
          AND mi.province_id IN (${idList})
          AND (mi.source IN ('som', 'council_military') OR mi.source = 'throne')
      )
      WHERE rn = 1
    ),
    latest_military_som AS (
      SELECT id, province_id, received_at
      FROM latest_military
      WHERE source_group = 'som'
    ),
    latest_military_throne AS (
      SELECT id, province_id, received_at
      FROM latest_military
      WHERE source_group = 'throne'
    ),
    latest_army_intel AS (
      SELECT COALESCE(ms.province_id, mt.province_id) AS province_id,
             CASE
               WHEN mt.id IS NOT NULL AND (ms.id IS NULL OR mt.received_at > ms.received_at)
                 THEN mt.id
               ELSE ms.id
             END AS military_intel_id
      FROM latest_military_som ms
      LEFT JOIN latest_military_throne mt ON mt.province_id = ms.province_id
      UNION ALL
      SELECT mt.province_id, mt.id
      FROM latest_military_throne mt
      LEFT JOIN latest_military_som ms ON ms.province_id = mt.province_id
      WHERE ms.id IS NULL
    ),
    army_summary AS (
      SELECT lai.province_id,
             COUNT(sa.id) AS armies_out_count,
             SUM(sa.land_gained) AS land_incoming,
             MIN(sa.return_days) AS earliest_return
      FROM latest_army_intel lai
      LEFT JOIN som_armies sa ON sa.military_intel_id = lai.military_intel_id AND sa.return_days IS NOT NULL
      GROUP BY lai.province_id
    ),
    som_armies_summary AS (
      SELECT ms.province_id,
             json_group_array(json_object('type', sa.army_type, 'generals', sa.generals, 'soldiers', sa.soldiers, 'offSpecs', sa.off_specs, 'defSpecs', sa.def_specs, 'elites', sa.elites, 'warHorses', sa.war_horses, 'thieves', sa.thieves, 'land', sa.land_gained, 'eta', sa.return_days)) AS som_armies_json
      FROM latest_military_som ms
      JOIN som_armies sa ON sa.military_intel_id = ms.id AND sa.return_days IS NOT NULL
      GROUP BY ms.province_id
    ),
    throne_armies_summary AS (
      SELECT mt.province_id,
             json_group_array(json_object('type', sa.army_type, 'land', sa.land_gained, 'eta', sa.return_days)) AS throne_armies_json
      FROM latest_military_throne mt
      JOIN som_armies sa ON sa.military_intel_id = mt.id AND sa.return_days IS NOT NULL
      GROUP BY mt.province_id
    )
    SELECT army.province_id, army.armies_out_count, army.land_incoming, army.earliest_return,
           som_armies.som_armies_json, throne_armies.throne_armies_json
    FROM army_summary army
    LEFT JOIN som_armies_summary som_armies ON som_armies.province_id = army.province_id
    LEFT JOIN throne_armies_summary throne_armies ON throne_armies.province_id = army.province_id
  `).all(...params()) as any[];
  for (const source of armyRows) {
    Object.assign(byId.get(source.province_id)!, {
      armies_out_count: source.armies_out_count,
      land_incoming: source.land_incoming,
      earliest_return: source.earliest_return,
      som_armies_json: source.som_armies_json,
      throne_armies_json: source.throne_armies_json,
    });
  }
}

export function getKingdomRitual(kingdom: string, keyHash: string): KingdomRitual | null {
  return createDbApi(getDb()).getKingdomRitual(kingdom, keyHash);
}

export function getKingdomDragon(kingdom: string, keyHash: string): KingdomDragon | null {
  return createDbApi(getDb()).getKingdomDragon(kingdom, keyHash);
}

export function getProvinceDetail(name: string, kingdom: string, keyHash: string): ProvinceDetail {
  return createDbApi(getDb()).getProvinceDetail(name, kingdom, keyHash);
}

function getProvinceDetailForDb(db: Database.Database, name: string, kingdom: string, keyHash: string): ProvinceDetail {
  const prov = db.prepare(
    "SELECT id, name, kingdom FROM provinces WHERE name = ? AND kingdom = ?"
  ).get(name, kingdom) as { id: number; name: string; kingdom: string } | undefined;

  if (!prov) return { province: null, overview: null, totalMilitary: null, homeMilitary: null, sot: null, resources: null, status: null, effects: [], militaryIntel: null, survey: null, sciences: null };

  // Auth check
  const allowed = db.prepare(
    "SELECT 1 FROM intel_partitions WHERE key_hash = ? AND province_id = ?"
  ).get(keyHash, prov.id);
  if (!allowed) return { province: null, overview: null, totalMilitary: null, homeMilitary: null, sot: null, resources: null, status: null, effects: [], militaryIntel: null, survey: null, sciences: null };

  const id = prov.id;
  const slotRow = db.prepare(`
    WITH ${latestSlotCte("AND ki.location = @kingdom")}
    SELECT slot FROM latest_slot WHERE kingdom = @kingdom AND name = @name LIMIT 1
  `).get({ keyHash, kingdom, name }) as { slot: number } | undefined;

  const overview = queryOverview(db, id, keyHash);

  const tmRaw = db.prepare(
    "SELECT off_points, def_points, source, received_at FROM total_military_points WHERE province_id = ? AND key_hash = ? ORDER BY received_at DESC LIMIT 1"
  ).get(id, keyHash) as { off_points: number | null; def_points: number | null; source: string; received_at: string } | undefined;
  const hmRaw = db.prepare(
    "SELECT mod_off_at_home, mod_def_at_home, source, received_at FROM home_military_points WHERE province_id = ? AND key_hash = ? ORDER BY received_at DESC LIMIT 1"
  ).get(id, keyHash) as { mod_off_at_home: number | null; mod_def_at_home: number | null; source: string; received_at: string } | undefined;
  const homeMilitary = hmRaw ? { modOffAtHome: hmRaw.mod_off_at_home, modDefAtHome: hmRaw.mod_def_at_home, source: hmRaw.source, receivedAt: hmRaw.received_at } : null;

  const armySnapshot = db.prepare(`
    SELECT chosen.id AS military_intel_id, COUNT(sa.id) AS armies_out_count
    FROM (
      SELECT CASE
        WHEN throne.id IS NOT NULL AND (som.id IS NULL OR throne.received_at > som.received_at)
          THEN throne.id
        ELSE som.id
      END AS id
      FROM (
        SELECT id, received_at FROM military_intel
        WHERE province_id = ? AND key_hash = ? AND source IN ('som', 'council_military')
        ORDER BY received_at DESC LIMIT 1
      ) som
      LEFT JOIN (
        SELECT id, received_at FROM military_intel
        WHERE province_id = ? AND key_hash = ? AND source = 'throne'
        ORDER BY received_at DESC LIMIT 1
      ) throne ON 1 = 1
    ) chosen
    LEFT JOIN som_armies sa ON sa.military_intel_id = chosen.id AND sa.return_days IS NOT NULL
  `).get(id, keyHash, id, keyHash) as { military_intel_id: number | null; armies_out_count: number } | undefined;

  const allArmiesHome = armySnapshot?.military_intel_id != null && (armySnapshot.armies_out_count ?? 0) === 0;
  const homeMilitaryNewer = !!hmRaw && (!tmRaw || hmRaw.received_at > tmRaw.received_at);
  const homeMilitaryFromSoM = hmRaw?.source === "som" || hmRaw?.source === "council_military";
  const totalMilitary = homeMilitaryFromSoM && homeMilitaryNewer && allArmiesHome && (hmRaw.mod_off_at_home != null || hmRaw.mod_def_at_home != null)
    ? { offPoints: hmRaw.mod_off_at_home, defPoints: hmRaw.mod_def_at_home, source: hmRaw.source, receivedAt: hmRaw.received_at }
    : tmRaw
      ? { offPoints: tmRaw.off_points, defPoints: tmRaw.def_points, source: tmRaw.source, receivedAt: tmRaw.received_at }
      : null;

  const troopsRaw = db.prepare(
    "SELECT soldiers, off_specs, def_specs, elites, war_horses, peasants, source, received_at FROM province_troops WHERE province_id = ? AND key_hash = ? AND source IN ('sot', 'throne') ORDER BY received_at DESC LIMIT 1"
  ).get(id, keyHash) as any;
  const sot = troopsRaw ? { soldiers: troopsRaw.soldiers, offSpecs: troopsRaw.off_specs, defSpecs: troopsRaw.def_specs, elites: troopsRaw.elites, warHorses: troopsRaw.war_horses, peasants: troopsRaw.peasants, source: troopsRaw.source, receivedAt: troopsRaw.received_at } : null;

  const resRaw = db.prepare(
    "SELECT money, food, runes, prisoners, trade_balance, building_efficiency, stealth, wizards, mana, received_at FROM province_resources WHERE province_id = ? AND key_hash = ? AND source IN ('sot', 'throne') ORDER BY received_at DESC LIMIT 1"
  ).get(id, keyHash) as any;
  const totalPopRaw = db.prepare(
    "SELECT total_pop, max_pop FROM province_resources WHERE province_id = ? AND key_hash = ? AND total_pop IS NOT NULL ORDER BY received_at DESC LIMIT 1"
  ).get(id, keyHash) as { total_pop: number; max_pop: number | null } | undefined;
  const thievesRaw = db.prepare(
    "SELECT thieves, received_at FROM province_resources WHERE province_id = ? AND key_hash = ? AND thieves IS NOT NULL ORDER BY received_at DESC LIMIT 1"
  ).get(id, keyHash) as { thieves: number; received_at: string } | undefined;
  const creditsRaw = db.prepare(
    "SELECT free_specialist_credits, received_at FROM province_resources WHERE province_id = ? AND key_hash = ? AND free_specialist_credits IS NOT NULL ORDER BY received_at DESC LIMIT 1"
  ).get(id, keyHash) as { free_specialist_credits: number; received_at: string } | undefined;
  const buildCreditsRaw = db.prepare(
    "SELECT free_building_credits, received_at FROM province_resources WHERE province_id = ? AND key_hash = ? AND free_building_credits IS NOT NULL ORDER BY received_at DESC LIMIT 1"
  ).get(id, keyHash) as { free_building_credits: number; received_at: string } | undefined;
  const resources = resRaw ? { money: resRaw.money, food: resRaw.food, runes: resRaw.runes, prisoners: resRaw.prisoners, tradeBalance: resRaw.trade_balance, buildingEfficiency: resRaw.building_efficiency, thieves: thievesRaw?.thieves ?? null, thievesAge: thievesRaw?.received_at ?? null, stealth: resRaw.stealth, wizards: resRaw.wizards, mana: resRaw.mana, totalPop: totalPopRaw?.total_pop ?? null, maxPop: totalPopRaw?.max_pop ?? null, freeSpecialistCredits: creditsRaw?.free_specialist_credits ?? null, freeSpecialistCreditsAge: creditsRaw?.received_at ?? null, freeBuildingCredits: buildCreditsRaw?.free_building_credits ?? null, freeBuildingCreditsAge: buildCreditsRaw?.received_at ?? null, receivedAt: resRaw.received_at } : null;

  const statusRaw = db.prepare(
    "SELECT plagued, overpopulated, overpop_deserters, dragon_type, dragon_name, hit_status, war, received_at FROM province_status WHERE province_id = ? AND key_hash = ? ORDER BY received_at DESC LIMIT 1"
  ).get(id, keyHash) as any;
  const status = statusRaw ? { plagued: !!statusRaw.plagued, overpopulated: !!statusRaw.overpopulated, overpopDeserters: statusRaw.overpop_deserters ?? null, dragonType: statusRaw.dragon_type ?? null, dragonName: statusRaw.dragon_name ?? null, hitStatus: statusRaw.hit_status, war: !!statusRaw.war, receivedAt: statusRaw.received_at } : null;

  const effects = db.prepare(
    `SELECT effect_name, effect_kind, duration_text, remaining_ticks, effectiveness_percent, received_at
     FROM (
       SELECT effect_name, effect_kind, duration_text, remaining_ticks, effectiveness_percent, received_at,
              row_number() OVER (
                PARTITION BY effect_name, effect_kind
                ORDER BY id DESC
              ) AS rn
       FROM province_effects
       WHERE province_id = ?
         AND key_hash = ?
         AND received_at = (SELECT MAX(pe2.received_at) FROM province_effects pe2 WHERE pe2.province_id = ?)
     )
     WHERE rn = 1
     ORDER BY effect_kind ASC, effect_name ASC`
  ).all(id, keyHash, id) as Array<{ effect_name: string; effect_kind: string; duration_text: string | null; remaining_ticks: number | null; effectiveness_percent: number | null; received_at: string }>;

  const miRaw = db.prepare(
    "SELECT id, ome, dme, received_at FROM military_intel WHERE province_id = ? AND key_hash = ? AND source IN ('som', 'council_military') ORDER BY received_at DESC LIMIT 1"
  ).get(id, keyHash) as any;
  const miThroneRaw = db.prepare(
    "SELECT id, received_at FROM military_intel WHERE province_id = ? AND key_hash = ? AND source = 'throne' ORDER BY received_at DESC LIMIT 1"
  ).get(id, keyHash) as any;
  let militaryIntel = null;
  if (miRaw || miThroneRaw) {
    const somRaw: any[] = miRaw ? db.prepare(
      "SELECT army_type, generals, soldiers, off_specs, def_specs, elites, war_horses, thieves, land_gained, return_days FROM som_armies WHERE military_intel_id = ?"
    ).all(miRaw.id) : [];
    const throneRaw: any[] = miThroneRaw ? db.prepare(
      "SELECT army_type, land_gained, return_days FROM som_armies WHERE military_intel_id = ?"
    ).all(miThroneRaw.id) : [];

    const somArmies: SomArmy[] = somRaw.map((a) => ({
      type: a.army_type, generals: a.generals, soldiers: a.soldiers,
      offSpecs: a.off_specs, defSpecs: a.def_specs, elites: a.elites,
      warHorses: a.war_horses, thieves: a.thieves, land: a.land_gained, eta: a.return_days,
    }));
    const throneArmies: ThroneArmy[] = throneRaw.map((a) => ({ type: a.army_type, land: a.land_gained, eta: a.return_days }));
    const throneNewer = !!(miThroneRaw && (!miRaw || miThroneRaw.received_at > miRaw.received_at));

    militaryIntel = {
      ome: miRaw?.ome ?? null, dme: miRaw?.dme ?? null, receivedAt: miRaw?.received_at ?? miThroneRaw?.received_at,
      armies: mergeArmyArrays(somArmies, throneArmies, throneNewer),
    };
  }

  const surveyRaw = db.prepare(
    "SELECT id, received_at FROM survey_intel WHERE province_id = ? AND key_hash = ? ORDER BY received_at DESC LIMIT 1"
  ).get(id, keyHash) as any;
  let survey = null;
  if (surveyRaw) {
    const buildings = db.prepare(
      "SELECT building, built, in_progress FROM survey_buildings WHERE survey_intel_id = ? ORDER BY built DESC"
    ).all(surveyRaw.id) as any[];
    survey = { receivedAt: surveyRaw.received_at, buildings: buildings.map((b) => ({ building: b.building, built: b.built, inProgress: b.in_progress })) };
  }

  const sosRaw = db.prepare(
    "SELECT id, received_at FROM sos_intel WHERE province_id = ? AND key_hash = ? ORDER BY received_at DESC LIMIT 1"
  ).get(id, keyHash) as any;
  let sciences = null;
  if (sosRaw) {
    const sciRows = db.prepare(
      "SELECT science, books, effect FROM sos_sciences WHERE sos_intel_id = ? ORDER BY books DESC"
    ).all(sosRaw.id) as any[];
    sciences = { receivedAt: sosRaw.received_at, sciences: sciRows.map((s) => ({ science: s.science, books: s.books, effect: s.effect })) };
  }

  return {
    province: { ...prov, slot: slotRow?.slot ?? null },
    overview,
    totalMilitary,
    homeMilitary,
    sot,
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

export function storeKingdomNews(data: KingdomNewsData, keyHash: string, isSnatched = false, receivedAt?: string, urlKingdom?: string | null) {
  const db = getDb();
  let kingdom: string | null;
  if (isSnatched) {
    kingdom = data.targetKingdom ?? urlKingdom ?? null;
  } else {
    kingdom = getBoundKingdom(keyHash);
  }
  if (!kingdom) return;

  const ins = db.prepare(`
    INSERT OR IGNORE INTO kingdom_news_sharded (
      key_hash, kingdom, game_date, game_date_ord, event_type, raw_text,
      attacker_name, attacker_kingdom,
      defender_name, defender_kingdom,
      acres, books,
      sender_name, receiver_name,
      relation_kingdom,
      dragon_type, dragon_name,
      received_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, datetime('now')))
  `);

  const insertMany = db.transaction((events: KingdomNewsEvent[]) => {
    for (const e of events) {
      ins.run(
        keyHash,
        kingdom, e.gameDate, parseUtopiaDate(e.gameDate), e.eventType, e.rawText,
        e.attackerName, e.attackerKingdom,
        e.defenderName, e.defenderKingdom,
        e.acres, e.books,
        e.senderName, e.receiverName,
        e.relationKingdom,
        e.dragonType, e.dragonName,
        receivedAt ?? null,
      );
    }
  });

  insertMany(data.events);
}

export interface KingdomNewsRow {
  id: number;
  kingdom: string;
  gameDate: string;
  eventType: string;
  rawText: string;
  attackerName: string | null;
  attackerKingdom: string | null;
  defenderName: string | null;
  defenderKingdom: string | null;
  acres: number | null;
  books: number | null;
  senderName: string | null;
  receiverName: string | null;
  relationKingdom: string | null;
  dragonType: string | null;
  dragonName: string | null;
  receivedAt: string;
}

const UTOPIA_MONTH_DAYS = 24; // days per Utopia month

export function getKingdomNews(kingdom: string, keyHash: string, from?: string, to?: string): { events: KingdomNewsRow[]; effectiveFrom: string | null } {
  return createDbApi(getDb()).getKingdomNews(kingdom, keyHash, from, to);
}

/** Returns the game_date of the most recent war_declared event for this kingdom, or null if none. */
export function getLatestWarDate(kingdom: string, keyHash: string): string | null {
  return createDbApi(getDb()).getLatestWarDate(kingdom, keyHash);
}

const COMBAT_TYPES = `'march','ambush','raze','pillage','loot','failed_attack'`;

export interface NewsProvinceSummary {
  provinceName: string | null;
  slot: number | null;
  // Total + per-type hits made (as attacker)
  hitsMade: number;
  marchMade: number;
  ambushMade: number;
  razeMade: number;
  plunderMade: number;
  lootMade: number;
  failedMade: number;
  // Acre/book outcomes as attacker
  marchAcresGained: number;
  ambushAcresGained: number;
  razeAcresDealt: number;
  booksLooted: number;
  // Total + per-type hits taken (as defender)
  hitsTaken: number;
  marchTaken: number;
  ambushTaken: number;
  razeTaken: number;
  plunderTaken: number;
  lootTaken: number;
  failedTaken: number;
  // Acre outcomes as defender
  marchAcresLost: number;
  ambushAcresLost: number;
  razeAcresLost: number;
}

export interface NewsKingdomSummary {
  kingdom: string;
  kingdomName: string | null;
  provinces: NewsProvinceSummary[];
  totalHitsMade: number;
  totalMarchMade: number;
  totalAmbushMade: number;
  totalRazeMade: number;
  totalPlunderMade: number;
  totalLootMade: number;
  totalFailedMade: number;
  totalMarchAcresGained: number;
  totalAmbushAcresGained: number;
  totalRazeAcresDealt: number;
  totalHitsTaken: number;
  totalMarchTaken: number;
  totalAmbushTaken: number;
  totalRazeTaken: number;
  totalPlunderTaken: number;
  totalLootTaken: number;
  totalFailedTaken: number;
  totalMarchAcresLost: number;
  totalAmbushAcresLost: number;
  totalRazeAcresLost: number;
}

export interface KingdomNewsSummary {
  ourKingdom: string;
  totalMarchAcresIn: number;
  totalRazeAcresIn: number;
  totalMarchAcresOut: number;
  totalRazeAcresOut: number;
  uniqueAttackers: number;
  byKingdom: NewsKingdomSummary[];
}

export function getKingdomNewsSummary(kingdom: string, keyHash: string, from?: string, to?: string): KingdomNewsSummary {
  return createDbApi(getDb()).getKingdomNewsSummary(kingdom, keyHash, from, to);
}

export function cleanupExpired() {
  return createDbApi(getDb()).cleanupExpired();
}

export interface ProvinceHistoryPoint {
  receivedAt: string;
  networth: number | null;
  land: number | null;
  peasants: number | null;
  soldiers: number | null;
  offSpecs: number | null;
  defSpecs: number | null;
  elites: number | null;
  warHorses: number | null;
  offPoints: number | null;
  defPoints: number | null;
  money: number | null;
  food: number | null;
  runes: number | null;
  thieves: number | null;
  wizards: number | null;
  attacksTaken: ProvinceHistoryAttack[];
  thieveryOpsTaken: ProvinceHistoryThieveryOp[];
  sorceryOpsTaken: ProvinceHistorySorceryOp[];
  meta: Partial<Record<string, { sources: string[]; savedBy: string[] }>>;
}

export interface ProvinceHistoryAttack {
  receivedAt: string;
  attackType: string;
  attackerName: string;
  attackerKingdom: string;
  acresTaken: number | null;
  killed: number | null;
  imprisoned: number | null;
  massacred: number | null;
}

export interface ProvinceHistoryThieveryOp {
  receivedAt: string;
  op: string;
  outcome: "success" | "failure";
  amountStolen: number | null;
  thievesLost: number;
  attackerName: string;
  attackerKingdom: string;
  troopsAssassinated: number | null;
  kidnapped: number | null;
  acresBurned: number | null;
  effectDuration: number | null;
}

export interface ProvinceHistorySorceryOp {
  receivedAt: string;
  spell: string;
  outcome: "success" | "failure";
  durationDays: number | null;
  wizardsLost: number;
  casterName: string;
  casterKingdom: string;
}

export function getProvinceHistory(name: string, kingdom: string, keyHash: string): ProvinceHistoryPoint[] {
  return createDbApi(getDb()).getProvinceHistory(name, kingdom, keyHash);
}

export interface DbApi {
  getBoundKingdom(keyHash: string): string | null;
  getKingdoms(keyHash: string): KingdomRow[];
  getLatestKingdomSnapshot(location: string, keyHash: string): KingdomSnapshot | null;
  getKingdomSnapshotHistory(location: string, keyHash: string): KingdomSnapshotHistoryPoint[];
  getRecentOps(keyHash: string, limit?: number, since?: string): RecentOp[];
  getKingdomProvinces(kingdom: string, keyHash: string): ProvinceRow[];
  getKingdomRitual(kingdom: string, keyHash: string): KingdomRitual | null;
  getKingdomDragon(kingdom: string, keyHash: string): KingdomDragon | null;
  getProvinceDetail(name: string, kingdom: string, keyHash: string): ProvinceDetail;
  getKingdomNews(kingdom: string, keyHash: string, from?: string, to?: string): { events: KingdomNewsRow[]; effectiveFrom: string | null };
  getLatestWarDate(kingdom: string, keyHash: string): string | null;
  getKingdomNewsSummary(kingdom: string, keyHash: string, from?: string, to?: string): KingdomNewsSummary;
  getProvinceHistory(name: string, kingdom: string, keyHash: string): ProvinceHistoryPoint[];
  cleanupExpired(): void;
}

export function createDbApi(db: Database.Database): DbApi {
  return {
    getBoundKingdom(keyHash) {
      const row = db.prepare(
        "SELECT kingdom FROM key_kingdom_bindings WHERE key_hash = ?"
      ).get(keyHash) as { kingdom: string } | undefined;
      return row?.kingdom ?? null;
    },

    getKingdoms(keyHash) {
      return db.prepare(`
        WITH ${latestSlotCte()}
        SELECT p.kingdom AS location,
               COUNT(DISTINCT p.id) AS province_count,
               MAX(po.received_at) AS last_seen
        FROM provinces p
        LEFT JOIN province_overview po ON po.province_id = p.id AND po.key_hash = @keyHash
        WHERE p.kingdom != ''
          AND EXISTS (
            SELECT 1 FROM intel_partitions
            WHERE key_hash = @keyHash AND province_id = p.id
          )
          AND (
            EXISTS (
              SELECT 1 FROM latest_slot ls
              WHERE ls.kingdom = p.kingdom AND ls.name = p.name
            )
            OR NOT EXISTS (
              SELECT 1
              FROM kingdom_provinces kp
              JOIN kingdom_intel ki ON kp.kingdom_intel_id = ki.id
              WHERE ki.location = p.kingdom
                AND ki.key_hash = @keyHash
                AND kp.name = p.name
            )
          )
        GROUP BY p.kingdom
        ORDER BY last_seen DESC
      `).all({ keyHash }) as KingdomRow[];
    },

    getLatestKingdomSnapshot(location, keyHash) {
      const snapshot = db.prepare(`
        SELECT ki.id, ki.name, ki.location, ki.kingdom_title,
               ki.total_networth, ki.total_land, ki.total_honor, ki.wars_won, ki.war_losses, ki.networth_rank, ki.land_rank, ki.honor_rank,
               ki.war_target,
               ki.their_attitude_to_us, ki.their_attitude_points,
               ki.our_attitude_to_them, ki.our_attitude_points,
               ki.hostility_meter_visible_until, ki.open_relations_json, ki.war_doctrines_json,
               ki.received_at
        FROM kingdom_intel ki
        WHERE ki.location = ?
          AND ki.key_hash = ?
        ORDER BY ki.received_at DESC, ki.id DESC
        LIMIT 1
      `).get(location, keyHash) as {
        id: number;
        name: string;
        location: string;
        kingdom_title: string | null;
        total_networth: number | null;
        total_land: number | null;
        total_honor: number | null;
        wars_won: number | null;
        war_losses: number | null;
        networth_rank: number | null;
        land_rank: number | null;
        honor_rank: number | null;
        war_target: string | null;
        their_attitude_to_us: string | null;
        their_attitude_points: number | null;
        our_attitude_to_them: string | null;
        our_attitude_points: number | null;
        hostility_meter_visible_until: string | null;
        open_relations_json: string | null;
        war_doctrines_json: string | null;
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
        kingdomTitle: snapshot.kingdom_title,
        totalNetworth: snapshot.total_networth,
        totalLand: snapshot.total_land,
        totalHonor: snapshot.total_honor,
        warsWon: snapshot.wars_won,
        warLosses: snapshot.war_losses,
        networthRank: snapshot.networth_rank,
        landRank: snapshot.land_rank,
        honorRank: snapshot.honor_rank,
        warTarget: snapshot.war_target,
        theirAttitudeToUs: snapshot.their_attitude_to_us,
        theirAttitudePoints: snapshot.their_attitude_points,
        ourAttitudeToThem: snapshot.our_attitude_to_them,
        ourAttitudePoints: snapshot.our_attitude_points,
        hostilityMeterVisibleUntil: snapshot.hostility_meter_visible_until,
        openRelations: snapshot.open_relations_json ? JSON.parse(snapshot.open_relations_json) as KingdomOpenRelation[] : [],
        warDoctrines: snapshot.war_doctrines_json ? JSON.parse(snapshot.war_doctrines_json) as WarDoctrine[] : [],
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
    },

    getKingdomSnapshotHistory(location, keyHash) {
      const rows = db.prepare(`
        SELECT ki.id, ki.name, ki.location, ki.kingdom_title,
               ki.total_networth, ki.total_land, ki.total_honor, ki.wars_won, ki.war_losses, ki.networth_rank, ki.land_rank, ki.honor_rank,
               ki.received_at
        FROM kingdom_intel ki
        WHERE ki.location = ?
          AND (ki.total_networth IS NOT NULL OR ki.total_land IS NOT NULL OR ki.total_honor IS NOT NULL)
          AND ki.key_hash = ?
        ORDER BY ki.received_at ASC, ki.id ASC
      `).all(location, keyHash) as {
        id: number;
        name: string;
        location: string;
        kingdom_title: string | null;
        total_networth: number | null;
        total_land: number | null;
        total_honor: number | null;
        wars_won: number | null;
        war_losses: number | null;
        networth_rank: number | null;
        land_rank: number | null;
        honor_rank: number | null;
        received_at: string;
      }[];

      return rows.map((row) => ({
        id: row.id,
        name: row.name,
        location: row.location,
        kingdomTitle: row.kingdom_title,
        totalNetworth: row.total_networth,
        totalLand: row.total_land,
        totalHonor: row.total_honor,
        warsWon: row.wars_won,
        warLosses: row.war_losses,
        networthRank: row.networth_rank,
        landRank: row.land_rank,
        honorRank: row.honor_rank,
        receivedAt: row.received_at,
      }));
    },

    getRecentOps(keyHash, limit = 20, since) {
      const sinceClause = since ? "WHERE received_at > @since" : "";
      return db.prepare(`
        WITH ${latestSlotCte()},
        ops AS (
          SELECT 'SoT' AS op_type, 'intel' AS op_category, po.received_at, po.saved_by,
                 p.name AS province_name, p.kingdom,
                 NULL AS actor_name, NULL AS actor_kingdom,
                 'success' AS outcome, NULL AS summary,
                 NULL AS detail_value, NULL AS detail_kind
          FROM province_overview po JOIN provinces p ON p.id = po.province_id
          WHERE po.key_hash = @keyHash AND po.source = 'sot'
          UNION ALL
          SELECT 'SoM', 'intel', mi.received_at, mi.saved_by,
                 p.name, p.kingdom,
                 NULL, NULL, 'success', NULL, NULL, NULL
          FROM military_intel mi JOIN provinces p ON p.id = mi.province_id
          WHERE mi.key_hash = @keyHash AND mi.source = 'som'
          UNION ALL
          SELECT 'SoD', 'intel', hmp.received_at, hmp.saved_by,
                 p.name, p.kingdom,
                 NULL, NULL, 'success', NULL, NULL, NULL
          FROM home_military_points hmp JOIN provinces p ON p.id = hmp.province_id
          WHERE hmp.key_hash = @keyHash AND hmp.source = 'sod'
          UNION ALL
          SELECT 'SoS', 'intel', si.received_at, si.saved_by,
                 p.name, p.kingdom,
                 NULL, NULL, 'success', NULL, NULL, NULL
          FROM sos_intel si JOIN provinces p ON p.id = si.province_id
          WHERE si.key_hash = @keyHash AND si.source = 'sos'
          UNION ALL
          SELECT 'Survey', 'intel', sv.received_at, sv.saved_by,
                 p.name, p.kingdom,
                 NULL, NULL, 'success', NULL, NULL, NULL
          FROM survey_intel sv JOIN provinces p ON p.id = sv.province_id
          WHERE sv.key_hash = @keyHash AND sv.source = 'survey'
          UNION ALL
          SELECT 'Infiltrate', 'intel', pr.received_at, pr.saved_by,
                 p.name, p.kingdom,
                 NULL, NULL, 'success', NULL, NULL, NULL
          FROM province_resources pr JOIN provinces p ON p.id = pr.province_id
          WHERE pr.key_hash = @keyHash AND pr.source = 'infiltrate'
          UNION ALL
          SELECT io.intel_type, 'intel', io.received_at, io.saved_by,
                 COALESCE(io.target_name, 'Unknown'), COALESCE(io.target_kingdom, ''),
                 p.name, p.kingdom,
                 io.outcome,
                 NULL,
                 CASE WHEN io.thieves_lost > 0 THEN io.thieves_lost ELSE NULL END,
                 CASE WHEN io.thieves_lost > 0 THEN 'thieves_lost' ELSE NULL END
          FROM intel_ops io JOIN provinces p ON p.id = io.province_id
          WHERE io.key_hash = @keyHash AND io.outcome = 'failure'
          UNION ALL
          SELECT ro.op, 'thievery', ro.received_at, ro.saved_by,
                 COALESCE(ro.target_name, p.name), COALESCE(ro.target_kingdom, p.kingdom, ''),
                 p.name, p.kingdom,
                 ro.outcome,
                 NULL,
                 CASE
                   WHEN ro.amount_stolen IS NOT NULL THEN ro.amount_stolen
                   WHEN ro.troops_assassinated IS NOT NULL THEN ro.troops_assassinated
                   WHEN ro.kidnapped IS NOT NULL THEN ro.kidnapped
                   WHEN ro.acres_burned IS NOT NULL THEN ro.acres_burned
                   WHEN ro.effect_duration IS NOT NULL THEN ro.effect_duration
                   WHEN ro.thieves_lost > 0 THEN ro.thieves_lost
                   ELSE NULL
                 END,
                 CASE
                   WHEN ro.amount_stolen IS NOT NULL THEN 'amount_stolen'
                   WHEN ro.troops_assassinated IS NOT NULL THEN 'troops_assassinated'
                   WHEN ro.kidnapped IS NOT NULL THEN 'kidnapped'
                   WHEN ro.acres_burned IS NOT NULL THEN 'acres_burned'
                   WHEN ro.effect_duration IS NOT NULL THEN 'effect_duration'
                   WHEN ro.thieves_lost > 0 THEN 'thieves_lost'
                   ELSE NULL
                 END
          FROM rob_ops ro JOIN provinces p ON p.id = ro.province_id
          WHERE ro.key_hash = @keyHash
          UNION ALL
          SELECT so.spell, 'sorcery', so.received_at, so.saved_by,
                 COALESCE(so.target_name, p.name), COALESCE(so.target_kingdom, p.kingdom, ''),
                 p.name, p.kingdom,
                 so.outcome,
                 NULL,
                 CASE
                   WHEN so.duration_days IS NOT NULL THEN so.duration_days
                   WHEN so.wizards_lost > 0 THEN so.wizards_lost
                   WHEN so.runes_spent IS NOT NULL THEN so.runes_spent
                   ELSE NULL
                 END,
                 CASE
                   WHEN so.duration_days IS NOT NULL THEN 'duration_days'
                   WHEN so.wizards_lost > 0 THEN 'wizards_lost'
                   WHEN so.runes_spent IS NOT NULL THEN 'runes_spent'
                   ELSE NULL
                 END
          FROM sorcery_ops so JOIN provinces p ON p.id = so.province_id
          WHERE so.key_hash = @keyHash
          UNION ALL
          SELECT ao.attack_type, 'attack', ao.received_at, ao.saved_by,
                 COALESCE(ao.target_name, p.name), COALESCE(ao.target_kingdom, p.kingdom, ''),
                 p.name, p.kingdom,
                 ao.outcome,
                 NULL,
                 CASE
                   WHEN ao.acres_taken IS NOT NULL THEN ao.acres_taken
                   WHEN ao.massacred IS NOT NULL THEN ao.massacred
                   WHEN ao.enemy_killed IS NOT NULL THEN ao.enemy_killed
                   WHEN ao.enemy_imprisoned IS NOT NULL THEN ao.enemy_imprisoned
                   WHEN ao.return_days IS NOT NULL THEN ao.return_days
                   ELSE NULL
                 END,
                 CASE
                   WHEN ao.acres_taken IS NOT NULL THEN 'acres_taken'
                   WHEN ao.massacred IS NOT NULL THEN 'massacred'
                   WHEN ao.enemy_killed IS NOT NULL THEN 'enemy_killed'
                   WHEN ao.enemy_imprisoned IS NOT NULL THEN 'enemy_imprisoned'
                   WHEN ao.return_days IS NOT NULL THEN 'return_days'
                   ELSE NULL
                 END
          FROM attack_ops ao JOIN provinces p ON p.id = ao.province_id
          WHERE ao.key_hash = @keyHash
        )
        SELECT op_type, op_category, received_at, saved_by, province_name, kingdom,
               actor_name, actor_kingdom, outcome, summary, detail_value, detail_kind,
               (SELECT ls.slot FROM latest_slot ls WHERE ls.kingdom = ops.kingdom AND ls.name = ops.province_name) AS slot
        FROM ops
        ${sinceClause}
        ORDER BY received_at DESC
        LIMIT @limit
      `).all({ keyHash, since: since ?? null, limit }) as RecentOp[];
    },

    getKingdomProvinces(kingdom, keyHash) {
      return getKingdomProvincesForDb(db, kingdom, keyHash);
    },

    getKingdomRitual(kingdom, keyHash) {
      const latestObservation = db.prepare(`
        SELECT ps.received_at
        FROM province_status ps
        JOIN provinces p ON p.id = ps.province_id
        WHERE p.kingdom = ? AND ps.key_hash = ? AND ps.source IN ('sot', 'throne')
        ORDER BY ps.received_at DESC, ps.id DESC
        LIMIT 1
      `).get(kingdom, keyHash) as { received_at: string } | undefined;

      const row = db.prepare(`
        SELECT pe.effect_name, pe.remaining_ticks, pe.effectiveness_percent, pe.received_at
        FROM province_effects pe
        JOIN provinces p ON p.id = pe.province_id
        WHERE p.kingdom = ? AND pe.key_hash = ? AND pe.effect_kind = 'ritual'
        ORDER BY pe.received_at DESC, pe.id DESC
        LIMIT 1
      `).get(kingdom, keyHash) as { effect_name: string; remaining_ticks: number | null; effectiveness_percent: number | null; received_at: string } | undefined;
      if (!row || (latestObservation && latestObservation.received_at > row.received_at)) return null;
      return { name: row.effect_name, remainingTicks: row.remaining_ticks, effectivenessPercent: row.effectiveness_percent, receivedAt: row.received_at };
    },

    getKingdomDragon(kingdom, keyHash) {
      const row = db.prepare(`
        SELECT ps.dragon_type, ps.dragon_name, ps.received_at
        FROM province_status ps
        JOIN provinces p ON p.id = ps.province_id
        WHERE p.kingdom = ? AND ps.key_hash = ? AND ps.source IN ('sot', 'throne')
        ORDER BY ps.received_at DESC, ps.id DESC
        LIMIT 1
      `).get(kingdom, keyHash) as { dragon_type: string | null; dragon_name: string | null; received_at: string } | undefined;
      if (!row || !row.dragon_type || !row.dragon_name) return null;
      return { dragonType: row.dragon_type, dragonName: row.dragon_name, receivedAt: row.received_at };
    },

    getProvinceDetail(name, kingdom, keyHash) {
      return getProvinceDetailForDb(db, name, kingdom, keyHash);
    },

    getKingdomNews(kingdom, keyHash, from, to) {
      const hasAccess = db.prepare(`
        SELECT 1 FROM kingdom_news_sharded
        WHERE key_hash = ? AND kingdom = ?
        LIMIT 1
      `).get(keyHash, kingdom);
      if (!hasAccess) return { events: [], effectiveFrom: null };

      let fromOrd: number;
      let toOrd: number;
      let effectiveFrom: string | null = from ?? null;
      if (from || to) {
        fromOrd = from ? parseUtopiaDate(from) : 0;
        toOrd   = to   ? parseUtopiaDate(to)   : 999999;
      } else {
        const maxRow = db.prepare(`SELECT MAX(game_date_ord) as m FROM kingdom_news_sharded WHERE key_hash = ? AND kingdom = ?`).get(keyHash, kingdom) as { m: number | null };
        const maxOrd = maxRow?.m ?? 0;
        fromOrd = maxOrd - 3 * UTOPIA_MONTH_DAYS + 1;
        toOrd   = 999999;
        effectiveFrom = formatUtopiaDate(fromOrd);
      }

      const rows = db.prepare(`
        SELECT id, kingdom, game_date, event_type, raw_text,
               attacker_name, attacker_kingdom,
               defender_name, defender_kingdom,
               acres, books,
               sender_name, receiver_name,
               relation_kingdom,
               dragon_type, dragon_name,
               received_at
        FROM kingdom_news_sharded
        WHERE key_hash = ? AND kingdom = ? AND game_date_ord >= ? AND game_date_ord <= ?
        ORDER BY game_date_ord DESC, id DESC
      `).all(keyHash, kingdom, fromOrd, toOrd) as Array<{
        id: number;
        kingdom: string;
        game_date: string;
        event_type: string;
        raw_text: string;
        attacker_name: string | null;
        attacker_kingdom: string | null;
        defender_name: string | null;
        defender_kingdom: string | null;
        acres: number | null;
        books: number | null;
        sender_name: string | null;
        receiver_name: string | null;
        relation_kingdom: string | null;
        dragon_type: string | null;
        dragon_name: string | null;
        received_at: string;
      }>;

      const events = rows.map((r) => ({
        id: r.id,
        kingdom: r.kingdom,
        gameDate: r.game_date,
        eventType: r.event_type,
        rawText: r.raw_text,
        attackerName: r.attacker_name,
        attackerKingdom: r.attacker_kingdom,
        defenderName: r.defender_name,
        defenderKingdom: r.defender_kingdom,
        acres: r.acres,
        books: r.books,
        senderName: r.sender_name,
        receiverName: r.receiver_name,
        relationKingdom: r.relation_kingdom,
        dragonType: r.dragon_type,
        dragonName: r.dragon_name,
        receivedAt: r.received_at,
      }));
      return { events, effectiveFrom };
    },

    getLatestWarDate(kingdom, keyHash) {
      const hasAccess = db.prepare(`
        SELECT 1 FROM kingdom_news_sharded
        WHERE key_hash = ? AND kingdom = ?
        LIMIT 1
      `).get(keyHash, kingdom);
      if (!hasAccess) return null;
      const row = db.prepare(`
        SELECT game_date FROM kingdom_news_sharded
        WHERE key_hash = ? AND kingdom = ? AND event_type = 'war_declared'
        ORDER BY game_date_ord DESC, id DESC
        LIMIT 1
      `).get(keyHash, kingdom) as { game_date: string } | undefined;
      return row?.game_date ?? null;
    },

    getKingdomNewsSummary(kingdom, keyHash, from, to) {
      const hasAccess = db.prepare(`
        SELECT 1 FROM kingdom_news_sharded
        WHERE key_hash = ? AND kingdom = ?
        LIMIT 1
      `).get(keyHash, kingdom);
      const empty: KingdomNewsSummary = { ourKingdom: kingdom, totalMarchAcresIn: 0, totalRazeAcresIn: 0, totalMarchAcresOut: 0, totalRazeAcresOut: 0, uniqueAttackers: 0, byKingdom: [] };
      if (!hasAccess) return empty;

      let fromOrd: number;
      let toOrd: number;
      if (from || to) {
        fromOrd = from ? parseUtopiaDate(from) : 0;
        toOrd   = to   ? parseUtopiaDate(to)   : 999999;
      } else {
        const maxRow = db.prepare(`SELECT MAX(game_date_ord) as m FROM kingdom_news_sharded WHERE key_hash = ? AND kingdom = ?`).get(keyHash, kingdom) as { m: number | null };
        const maxOrd = maxRow?.m ?? 0;
        fromOrd = maxOrd - 3 * UTOPIA_MONTH_DAYS + 1;
        toOrd   = 999999;
      }

      const combatRows = db.prepare(`
        SELECT attacker_name, attacker_kingdom, defender_name, defender_kingdom,
               event_type, acres, books
        FROM kingdom_news_sharded
        WHERE key_hash = ? AND kingdom = ? AND event_type IN (${COMBAT_TYPES})
          AND attacker_kingdom IS NOT NULL AND defender_kingdom IS NOT NULL
          AND game_date_ord >= ? AND game_date_ord <= ?
      `).all(keyHash, kingdom, fromOrd, toOrd) as {
        attacker_name: string | null; attacker_kingdom: string;
        defender_name: string | null; defender_kingdom: string;
        event_type: string; acres: number | null; books: number | null;
      }[];

      type AttackerEntry = {
        attacker_name: string | null; attacker_kingdom: string;
        hits: number; marchHits: number; ambushHits: number; razeHits: number; pillageHits: number; lootHits: number; failedHits: number;
        marchAcres: number; ambushAcres: number; razeAcres: number; books: number;
      };
      type DefenderEntry = {
        defender_name: string | null; defender_kingdom: string;
        hits: number; marchHits: number; ambushHits: number; razeHits: number; pillageHits: number; lootHits: number; failedHits: number;
        marchAcres: number; ambushAcres: number; razeAcres: number;
      };

      const newAttacker = (name: string | null, kd: string): AttackerEntry =>
        ({ attacker_name: name, attacker_kingdom: kd, hits: 0, marchHits: 0, ambushHits: 0, razeHits: 0, pillageHits: 0, lootHits: 0, failedHits: 0, marchAcres: 0, ambushAcres: 0, razeAcres: 0, books: 0 });
      const newDefender = (name: string | null, kd: string): DefenderEntry =>
        ({ defender_name: name, defender_kingdom: kd, hits: 0, marchHits: 0, ambushHits: 0, razeHits: 0, pillageHits: 0, lootHits: 0, failedHits: 0, marchAcres: 0, ambushAcres: 0, razeAcres: 0 });

      const attackerMap = new Map<string, AttackerEntry>();
      const defenderMap = new Map<string, DefenderEntry>();

      for (const r of combatRows) {
        const ak = `${r.attacker_name ?? ""}\0${r.attacker_kingdom}`;
        const a = attackerMap.get(ak) ?? newAttacker(r.attacker_name, r.attacker_kingdom);
        a.hits++;
        if      (r.event_type === "march")         { a.marchHits++;   a.marchAcres  += r.acres ?? 0; }
        else if (r.event_type === "ambush")        { a.ambushHits++;  a.ambushAcres += r.acres ?? 0; }
        else if (r.event_type === "raze")          { a.razeHits++;    a.razeAcres   += r.acres ?? 0; }
        else if (r.event_type === "pillage")       { a.pillageHits++; }
        else if (r.event_type === "loot")          { a.lootHits++;    a.books       += r.books ?? 0; }
        else if (r.event_type === "failed_attack") { a.failedHits++; }
        attackerMap.set(ak, a);

        const dk = `${r.defender_name ?? ""}\0${r.defender_kingdom}`;
        const d = defenderMap.get(dk) ?? newDefender(r.defender_name, r.defender_kingdom);
        d.hits++;
        if      (r.event_type === "march")         { d.marchHits++;   d.marchAcres  += r.acres ?? 0; }
        else if (r.event_type === "ambush")        { d.ambushHits++;  d.ambushAcres += r.acres ?? 0; }
        else if (r.event_type === "raze")          { d.razeHits++;    d.razeAcres   += r.acres ?? 0; }
        else if (r.event_type === "pillage")       { d.pillageHits++; }
        else if (r.event_type === "loot")          { d.lootHits++; }
        else if (r.event_type === "failed_attack") { d.failedHits++; }
        defenderMap.set(dk, d);
      }

      const asAttacker = [...attackerMap.values()];
      const asDefender = [...defenderMap.values()];

      type ProvKey = string;
      type ProvEntry = {
        kd: string; name: string | null;
        hitsMade: number; marchMade: number; ambushMade: number; razeMade: number; pillageMade: number; lootMade: number; failedMade: number;
        marchAcresGained: number; ambushAcresGained: number; razeAcresDealt: number; booksLooted: number;
        hitsTaken: number; marchTaken: number; ambushTaken: number; razeTaken: number; pillageTaken: number; lootTaken: number; failedTaken: number;
        marchAcresLost: number; ambushAcresLost: number; razeAcresLost: number;
      };

      const provMap = new Map<ProvKey, ProvEntry>();
      const provKey = (name: string | null, kd: string) => `${name ?? ""}\0${kd}`;
      const emptyProv = (name: string | null, kd: string): ProvEntry => ({
        kd, name,
        hitsMade: 0, marchMade: 0, ambushMade: 0, razeMade: 0, pillageMade: 0, lootMade: 0, failedMade: 0,
        marchAcresGained: 0, ambushAcresGained: 0, razeAcresDealt: 0, booksLooted: 0,
        hitsTaken: 0, marchTaken: 0, ambushTaken: 0, razeTaken: 0, pillageTaken: 0, lootTaken: 0, failedTaken: 0,
        marchAcresLost: 0, ambushAcresLost: 0, razeAcresLost: 0,
      });

      for (const r of asAttacker) {
        const k = provKey(r.attacker_name, r.attacker_kingdom);
        const p = provMap.get(k) ?? emptyProv(r.attacker_name, r.attacker_kingdom);
        p.hitsMade += r.hits; p.marchMade += r.marchHits; p.ambushMade += r.ambushHits; p.razeMade += r.razeHits;
        p.pillageMade += r.pillageHits; p.lootMade += r.lootHits; p.failedMade += r.failedHits;
        p.marchAcresGained += r.marchAcres; p.ambushAcresGained += r.ambushAcres; p.razeAcresDealt += r.razeAcres; p.booksLooted += r.books;
        provMap.set(k, p);
      }
      for (const r of asDefender) {
        const k = provKey(r.defender_name, r.defender_kingdom);
        const p = provMap.get(k) ?? emptyProv(r.defender_name, r.defender_kingdom);
        p.hitsTaken += r.hits; p.marchTaken += r.marchHits; p.ambushTaken += r.ambushHits; p.razeTaken += r.razeHits;
        p.pillageTaken += r.pillageHits; p.lootTaken += r.lootHits; p.failedTaken += r.failedHits;
        p.marchAcresLost += r.marchAcres; p.ambushAcresLost += r.ambushAcres; p.razeAcresLost += r.razeAcres;
        provMap.set(k, p);
      }

      const kingdoms = [...new Set([...provMap.values()].map((p) => p.kd))];
      const slotMap = new Map<string, number | null>();
      if (kingdoms.length > 0) {
        const placeholders = kingdoms.map(() => "?").join(",");
        const slotRows = db.prepare(`
          SELECT kp.name, ki.location as kingdom, kp.slot
          FROM kingdom_provinces kp
          JOIN kingdom_intel ki ON ki.id = kp.kingdom_intel_id
          WHERE ki.key_hash = ? AND ki.location IN (${placeholders}) AND kp.name IS NOT NULL
        `).all(keyHash, ...kingdoms) as { name: string; kingdom: string; slot: number | null }[];
        for (const r of slotRows) slotMap.set(`${r.name}\0${r.kingdom}`, r.slot);
      }

      const kdMap = new Map<string, NewsProvinceSummary[]>();
      for (const p of provMap.values()) {
        const slot = p.name ? (slotMap.get(`${p.name}\0${p.kd}`) ?? null) : null;
        const list = kdMap.get(p.kd) ?? [];
        list.push({
          provinceName: p.name, slot,
          hitsMade: p.hitsMade, marchMade: p.marchMade, ambushMade: p.ambushMade, razeMade: p.razeMade,
          plunderMade: p.pillageMade, lootMade: p.lootMade, failedMade: p.failedMade,
          marchAcresGained: p.marchAcresGained, ambushAcresGained: p.ambushAcresGained, razeAcresDealt: p.razeAcresDealt, booksLooted: p.booksLooted,
          hitsTaken: p.hitsTaken, marchTaken: p.marchTaken, ambushTaken: p.ambushTaken, razeTaken: p.razeTaken,
          plunderTaken: p.pillageTaken, lootTaken: p.lootTaken, failedTaken: p.failedTaken,
          marchAcresLost: p.marchAcresLost, ambushAcresLost: p.ambushAcresLost, razeAcresLost: p.razeAcresLost,
        });
        kdMap.set(p.kd, list);
      }

      const kdNames = new Map<string, string>();
      for (const loc of kdMap.keys()) {
        const row = db.prepare(`SELECT name FROM kingdom_intel WHERE key_hash = ? AND location = ? ORDER BY received_at DESC LIMIT 1`).get(keyHash, loc) as { name: string } | undefined;
        if (row) kdNames.set(loc, row.name);
      }

      const byKingdom: NewsKingdomSummary[] = [...kdMap.entries()].map(([kd, provs]) => {
        provs.sort((a, b) => {
          const netB = b.marchAcresGained - b.marchAcresLost - b.razeAcresLost;
          const netA = a.marchAcresGained - a.marchAcresLost - a.razeAcresLost;
          return netB - netA;
        });
        const sum = <K extends keyof NewsProvinceSummary>(f: K) => provs.reduce((s, p) => s + (p[f] as number), 0);
        return {
          kingdom: kd, kingdomName: kdNames.get(kd) ?? null, provinces: provs,
          totalHitsMade:          sum("hitsMade"),
          totalMarchMade:         sum("marchMade"),
          totalAmbushMade:        sum("ambushMade"),
          totalRazeMade:          sum("razeMade"),
          totalPlunderMade:       sum("plunderMade"),
          totalLootMade:          sum("lootMade"),
          totalFailedMade:        sum("failedMade"),
          totalMarchAcresGained:  sum("marchAcresGained"),
          totalAmbushAcresGained: sum("ambushAcresGained"),
          totalRazeAcresDealt:    sum("razeAcresDealt"),
          totalHitsTaken:         sum("hitsTaken"),
          totalMarchTaken:        sum("marchTaken"),
          totalAmbushTaken:       sum("ambushTaken"),
          totalRazeTaken:         sum("razeTaken"),
          totalPlunderTaken:      sum("plunderTaken"),
          totalLootTaken:         sum("lootTaken"),
          totalFailedTaken:       sum("failedTaken"),
          totalMarchAcresLost:    sum("marchAcresLost"),
          totalAmbushAcresLost:   sum("ambushAcresLost"),
          totalRazeAcresLost:     sum("razeAcresLost"),
        };
      });

      byKingdom.sort((a, b) => {
        if (a.kingdom === kingdom) return -1;
        if (b.kingdom === kingdom) return 1;
        return (b.totalHitsMade - a.totalHitsMade) || (a.totalMarchAcresGained - b.totalMarchAcresGained);
      });

      const ours = byKingdom.find(k => k.kingdom === kingdom);
      const enemies = byKingdom.filter(k => k.kingdom !== kingdom);
      const totalMarchAcresIn  = enemies.reduce((s, k) => s + k.totalMarchAcresGained, 0);
      const totalRazeAcresIn   = enemies.reduce((s, k) => s + k.totalRazeAcresDealt, 0);
      const totalMarchAcresOut = ours?.totalMarchAcresGained ?? 0;
      const totalRazeAcresOut  = ours?.totalRazeAcresDealt ?? 0;
      const uniqueAttackers = asAttacker.filter(r => r.attacker_kingdom !== kingdom).length;

      return { ourKingdom: kingdom, totalMarchAcresIn, totalRazeAcresIn, totalMarchAcresOut, totalRazeAcresOut, uniqueAttackers, byKingdom };
    },

    getProvinceHistory(name, kingdom, keyHash) {
      const prov = db.prepare(
        "SELECT id FROM provinces WHERE name = ? AND kingdom = ?"
      ).get(name, kingdom) as { id: number } | undefined;
      if (!prov) return [];

      const allowed = db.prepare(
        "SELECT 1 FROM intel_partitions WHERE key_hash = ? AND province_id = ?"
      ).get(keyHash, prov.id);
      if (!allowed) return [];

      const id = prov.id;

      type OverviewRaw = { received_at: string; land: number | null; networth: number | null; source: string | null; saved_by: string | null };
      type TroopsRaw = { received_at: string; soldiers: number | null; off_specs: number | null; def_specs: number | null; elites: number | null; war_horses: number | null; peasants: number | null; source: string | null; saved_by: string | null };
      type ResourcesRaw = { received_at: string; money: number | null; food: number | null; runes: number | null; thieves: number | null; wizards: number | null; source: string | null; saved_by: string | null };
      type MilPointsRaw = { received_at: string; off_points: number | null; def_points: number | null; source: string | null; saved_by: string | null };
      type AttackRaw = { received_at: string; attack_type: string; attacker_name: string; attacker_kingdom: string; acres_taken: number | null; enemy_killed: number | null; enemy_imprisoned: number | null; massacred: number | null };
      type RobRaw = { received_at: string; op: string; outcome: string; amount_stolen: number | null; thieves_lost: number; attacker_name: string; attacker_kingdom: string; troops_assassinated: number | null; kidnapped: number | null; acres_burned: number | null; effect_duration: number | null };
      type SorceryRaw = { received_at: string; spell: string; outcome: string; duration_days: number | null; wizards_lost: number; caster_name: string; caster_kingdom: string };

      const overviews = db.prepare(
        "SELECT received_at, land, networth, source, saved_by FROM province_overview WHERE province_id = ? AND key_hash = ? ORDER BY received_at ASC"
      ).all(id, keyHash) as OverviewRaw[];
      const troops = db.prepare(
        "SELECT received_at, soldiers, off_specs, def_specs, elites, war_horses, peasants, source, saved_by FROM province_troops WHERE province_id = ? AND key_hash = ? ORDER BY received_at ASC"
      ).all(id, keyHash) as TroopsRaw[];
      const resources = db.prepare(
        "SELECT received_at, money, food, runes, thieves, wizards, source, saved_by FROM province_resources WHERE province_id = ? AND key_hash = ? ORDER BY received_at ASC"
      ).all(id, keyHash) as ResourcesRaw[];
      const milPoints = db.prepare(
        "SELECT received_at, off_points, def_points, source, saved_by FROM total_military_points WHERE province_id = ? AND key_hash = ? ORDER BY received_at ASC"
      ).all(id, keyHash) as MilPointsRaw[];
      const attacksTaken = db.prepare(`
        SELECT ao.received_at, ao.attack_type, p.name AS attacker_name, p.kingdom AS attacker_kingdom,
               ao.acres_taken, ao.enemy_killed, ao.enemy_imprisoned, ao.massacred
        FROM attack_ops ao
        JOIN provinces p ON p.id = ao.province_id
        WHERE ao.key_hash = ?
          AND ao.target_name = ?
          AND ao.target_kingdom = ?
          AND ao.outcome = 'success'
        ORDER BY ao.received_at ASC
      `).all(keyHash, name, kingdom) as AttackRaw[];
      const thieveryOpsTaken = db.prepare(`
        SELECT ro.received_at, ro.op, ro.outcome, ro.amount_stolen, ro.thieves_lost,
               p.name AS attacker_name, p.kingdom AS attacker_kingdom,
               ro.troops_assassinated, ro.kidnapped, ro.acres_burned, ro.effect_duration
        FROM rob_ops ro
        JOIN provinces p ON p.id = ro.province_id
        WHERE ro.key_hash = ?
          AND ro.target_name = ?
          AND ro.target_kingdom = ?
        ORDER BY ro.received_at ASC
      `).all(keyHash, name, kingdom) as RobRaw[];
      const sorceryOpsTaken = db.prepare(`
        SELECT so.received_at, so.spell, so.outcome, so.duration_days, so.wizards_lost,
               p.name AS caster_name, p.kingdom AS caster_kingdom
        FROM sorcery_ops so
        JOIN provinces p ON p.id = so.province_id
        WHERE so.key_hash = ?
          AND so.target_name = ?
          AND so.target_kingdom = ?
        ORDER BY so.received_at ASC
      `).all(keyHash, name, kingdom) as SorceryRaw[];

      // Bucket all rows into 5-minute windows
      const BUCKET_MS = 5 * 60 * 1000;
      function bucketKey(isoStr: string): string {
        const ms = new Date(isoStr.replace(" ", "T") + "Z").getTime();
        const bucketMs = Math.floor(ms / BUCKET_MS) * BUCKET_MS;
        return new Date(bucketMs).toISOString().replace("T", " ").replace(".000Z", "");
      }

      const buckets = new Map<string, ProvinceHistoryPoint>();
      function ensureBucket(key: string): ProvinceHistoryPoint {
        if (!buckets.has(key)) {
          buckets.set(key, {
            receivedAt: key,
            networth: null, land: null, peasants: null,
            soldiers: null, offSpecs: null, defSpecs: null, elites: null, warHorses: null,
            offPoints: null, defPoints: null,
            money: null, food: null, runes: null, thieves: null, wizards: null,
            attacksTaken: [],
            thieveryOpsTaken: [],
            sorceryOpsTaken: [],
            meta: {},
          });
        }
        return buckets.get(key)!;
      }
      function mergeMetric(b: ProvinceHistoryPoint, metricKey: string, source: string | null, savedBy: string | null) {
        const m = b.meta[metricKey] ?? (b.meta[metricKey] = { sources: [], savedBy: [] });
        if (source && !m.sources.includes(source)) m.sources.push(source);
        if (savedBy && !m.savedBy.includes(savedBy)) m.savedBy.push(savedBy);
      }

      for (const row of overviews) {
        const b = ensureBucket(bucketKey(row.received_at));
        if (row.land != null) { b.land = row.land; mergeMetric(b, "land", row.source, row.saved_by); }
        if (row.networth != null) { b.networth = row.networth; mergeMetric(b, "networth", row.source, row.saved_by); }
      }
      for (const row of troops) {
        const b = ensureBucket(bucketKey(row.received_at));
        if (row.soldiers != null) { b.soldiers = row.soldiers; mergeMetric(b, "soldiers", row.source, row.saved_by); }
        if (row.off_specs != null) { b.offSpecs = row.off_specs; mergeMetric(b, "offSpecs", row.source, row.saved_by); }
        if (row.def_specs != null) { b.defSpecs = row.def_specs; mergeMetric(b, "defSpecs", row.source, row.saved_by); }
        if (row.elites != null) { b.elites = row.elites; mergeMetric(b, "elites", row.source, row.saved_by); }
        if (row.war_horses != null) { b.warHorses = row.war_horses; mergeMetric(b, "warHorses", row.source, row.saved_by); }
        if (row.peasants != null) { b.peasants = row.peasants; mergeMetric(b, "peasants", row.source, row.saved_by); }
      }
      for (const row of resources) {
        const b = ensureBucket(bucketKey(row.received_at));
        if (row.money != null) { b.money = row.money; mergeMetric(b, "money", row.source, row.saved_by); }
        if (row.food != null) { b.food = row.food; mergeMetric(b, "food", row.source, row.saved_by); }
        if (row.runes != null) { b.runes = row.runes; mergeMetric(b, "runes", row.source, row.saved_by); }
        if (row.thieves != null) { b.thieves = row.thieves; mergeMetric(b, "thieves", row.source, row.saved_by); }
        if (row.wizards != null) { b.wizards = row.wizards; mergeMetric(b, "wizards", row.source, row.saved_by); }
      }
      for (const row of milPoints) {
        const b = ensureBucket(bucketKey(row.received_at));
        if (row.off_points != null) { b.offPoints = row.off_points; mergeMetric(b, "offPoints", row.source, row.saved_by); }
        if (row.def_points != null) { b.defPoints = row.def_points; mergeMetric(b, "defPoints", row.source, row.saved_by); }
      }
      for (const row of attacksTaken) {
        const b = ensureBucket(bucketKey(row.received_at));
        b.attacksTaken.push({
          receivedAt: row.received_at,
          attackType: row.attack_type,
          attackerName: row.attacker_name,
          attackerKingdom: row.attacker_kingdom,
          acresTaken: row.acres_taken,
          killed: row.enemy_killed,
          imprisoned: row.enemy_imprisoned,
          massacred: row.massacred,
        });
      }
      for (const row of thieveryOpsTaken) {
        const b = ensureBucket(bucketKey(row.received_at));
        b.thieveryOpsTaken.push({
          receivedAt: row.received_at,
          op: row.op,
          outcome: row.outcome as "success" | "failure",
          amountStolen: row.amount_stolen,
          thievesLost: row.thieves_lost,
          attackerName: row.attacker_name,
          attackerKingdom: row.attacker_kingdom,
          troopsAssassinated: row.troops_assassinated,
          kidnapped: row.kidnapped,
          acresBurned: row.acres_burned,
          effectDuration: row.effect_duration,
        });
      }
      for (const row of sorceryOpsTaken) {
        const b = ensureBucket(bucketKey(row.received_at));
        b.sorceryOpsTaken.push({
          receivedAt: row.received_at,
          spell: row.spell,
          outcome: row.outcome as "success" | "failure",
          durationDays: row.duration_days,
          wizardsLost: row.wizards_lost,
          casterName: row.caster_name,
          casterKingdom: row.caster_kingdom,
        });
      }

      return [...buckets.values()].sort((a, b) => a.receivedAt.localeCompare(b.receivedAt));
    },

    cleanupExpired() {
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
        DELETE FROM kingdom_news WHERE received_at < ${cutoff};
        DELETE FROM kingdom_news_sharded WHERE received_at < ${cutoff};
        DELETE FROM rob_ops WHERE received_at < ${cutoff};
        DELETE FROM intel_ops WHERE received_at < ${cutoff};
        DELETE FROM sorcery_ops WHERE received_at < ${cutoff};
        DELETE FROM attack_ops WHERE received_at < ${cutoff};
      `);
    },
  };
}
