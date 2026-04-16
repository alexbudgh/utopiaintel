import { test } from "node:test";
import assert from "node:assert/strict";
import Database from "better-sqlite3";
import { sameTick, parseUtopiaDate, formatUtopiaDate } from "../lib/ui";
import { createDbApi, initSchema } from "../lib/db";
import { getGainsPageData } from "../lib/gains-page";
import type { KingdomNewsData } from "../lib/parsers/kingdom_news";

async function withRealDb(
  run: (api: ReturnType<typeof createDbApi>, db: Database.Database) => Promise<void> | void,
) {
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  initSchema(db);

  try {
    await run(createDbApi(db), db);
  } finally {
    db.close();
  }
}

// ---------------------------------------------------------------------------
// sameTick
// ---------------------------------------------------------------------------

test("sameTick: same timestamps → true", () => {
  assert.equal(sameTick("2026-04-04 18:00:00", "2026-04-04 18:00:00"), true);
});

test("sameTick: start and end of same hour → true", () => {
  assert.equal(sameTick("2026-04-04 18:00:00", "2026-04-04 18:59:59"), true);
});

test("sameTick: cross-hour boundary (18:55 and 19:05, only 10m apart) → false", () => {
  assert.equal(sameTick("2026-04-04 18:55:00", "2026-04-04 19:05:00"), false);
});

test("sameTick: different hours → false", () => {
  assert.equal(sameTick("2026-04-04 18:00:00", "2026-04-04 19:00:00"), false);
});

test("sameTick: more than 1 hour apart → false", () => {
  assert.equal(sameTick("2026-04-04 18:00:00", "2026-04-04 20:00:00"), false);
});

test("sameTick: single value → false (can't compare)", () => {
  assert.equal(sameTick("2026-04-04 18:00:00"), false);
});

test("sameTick: one null + one value → false", () => {
  assert.equal(sameTick(null, "2026-04-04 18:00:00"), false);
});

test("sameTick: nulls filtered out, two real values within tick → true", () => {
  assert.equal(sameTick(null, "2026-04-04 18:00:00", null, "2026-04-04 18:30:00"), true);
});

test("sameTick: three values all within tick → true", () => {
  assert.equal(sameTick("2026-04-04 18:00:00", "2026-04-04 18:20:00", "2026-04-04 18:40:00"), true);
});

test("sameTick: three values, one far out → false", () => {
  assert.equal(sameTick("2026-04-04 18:00:00", "2026-04-04 18:20:00", "2026-04-04 20:00:00"), false);
});

// ---------------------------------------------------------------------------
// DB query: thieves non-null sourcing
//
// Scenario: infiltrate op stores thieves=4038, then SoT stores thieves=null.
// The most recent province_resources row has thieves=null, but the scalar
// subquery filtering for IS NOT NULL should still return 4038.
// ---------------------------------------------------------------------------

function makeDb() {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE provinces (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      kingdom TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(name, kingdom)
    );
    CREATE TABLE province_resources (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      province_id INTEGER NOT NULL REFERENCES provinces(id),
      money INTEGER,
      thieves INTEGER,
      source TEXT NOT NULL DEFAULT 'sot',
      received_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
  return db;
}

test("thieves: non-null sourcing survives subsequent SoT with null thieves", () => {
  const db = makeDb();
  db.prepare("INSERT INTO provinces (name, kingdom) VALUES ('Obsidian', '7:5')").run();
  const { id: provId } = db.prepare("SELECT id FROM provinces WHERE name='Obsidian'").get() as { id: number };

  // infiltrate op: knows exact count
  db.prepare("INSERT INTO province_resources (province_id, thieves, source, received_at) VALUES (?, 4038, 'infiltrate', '2026-04-04 17:00:00')").run(provId);
  // SoT: thieves unknown → null
  db.prepare("INSERT INTO province_resources (province_id, thieves, source, received_at) VALUES (?, NULL, 'sot', '2026-04-04 18:05:00')").run(provId);

  const row = db.prepare(`
    SELECT
      (SELECT p2.thieves FROM province_resources p2 WHERE p2.province_id = ? AND p2.thieves IS NOT NULL ORDER BY p2.received_at DESC LIMIT 1) AS thieves,
      (SELECT p2.received_at FROM province_resources p2 WHERE p2.province_id = ? AND p2.thieves IS NOT NULL ORDER BY p2.received_at DESC LIMIT 1) AS thieves_age
  `).get(provId, provId) as { thieves: number | null; thieves_age: string | null };

  assert.equal(row.thieves, 4038, "should return infiltrate thieves count, not null");
  assert.equal(row.thieves_age, "2026-04-04 17:00:00", "thieves_age should be infiltrate timestamp");
  db.close();
});

test("thieves: null when only SoT with null thieves exists", () => {
  const db = makeDb();
  db.prepare("INSERT INTO provinces (name, kingdom) VALUES ('Empty', '1:1')").run();
  const { id: provId } = db.prepare("SELECT id FROM provinces WHERE name='Empty'").get() as { id: number };

  db.prepare("INSERT INTO province_resources (province_id, thieves, source, received_at) VALUES (?, NULL, 'sot', '2026-04-04 18:00:00')").run(provId);

  const row = db.prepare(`
    SELECT
      (SELECT p2.thieves FROM province_resources p2 WHERE p2.province_id = ? AND p2.thieves IS NOT NULL ORDER BY p2.received_at DESC LIMIT 1) AS thieves
  `).get(provId) as { thieves: number | null };

  assert.equal(row.thieves, null, "no non-null thieves → null result");
  db.close();
});

test("thieves: uses most recent non-null when multiple infiltrate ops", () => {
  const db = makeDb();
  db.prepare("INSERT INTO provinces (name, kingdom) VALUES ('TestProv', '3:3')").run();
  const { id: provId } = db.prepare("SELECT id FROM provinces WHERE name='TestProv'").get() as { id: number };

  db.prepare("INSERT INTO province_resources (province_id, thieves, source, received_at) VALUES (?, 3000, 'infiltrate', '2026-04-04 16:00:00')").run(provId);
  db.prepare("INSERT INTO province_resources (province_id, thieves, source, received_at) VALUES (?, 3500, 'infiltrate', '2026-04-04 17:00:00')").run(provId);
  db.prepare("INSERT INTO province_resources (province_id, thieves, source, received_at) VALUES (?, NULL, 'sot', '2026-04-04 18:00:00')").run(provId);

  const row = db.prepare(`
    SELECT
      (SELECT p2.thieves FROM province_resources p2 WHERE p2.province_id = ? AND p2.thieves IS NOT NULL ORDER BY p2.received_at DESC LIMIT 1) AS thieves
  `).get(provId) as { thieves: number | null };

  assert.equal(row.thieves, 3500, "should use the most recent infiltrate count");
  db.close();
});

const RESOURCES_JOIN_FILTER = `source = 'sot'`;

test("resources: infiltrate after SoT does not shadow SoT money/food/runes", () => {
  const db = makeDb();
  db.prepare("INSERT INTO provinces (name, kingdom) VALUES ('Obsidian', '7:5')").run();
  const { id: provId } = db.prepare("SELECT id FROM provinces WHERE name='Obsidian'").get() as { id: number };

  // SoT: has full resource data
  db.prepare("INSERT INTO province_resources (province_id, money, thieves, source, received_at) VALUES (?, 1500000, NULL, 'sot', '2026-04-04 18:00:00')").run(provId);
  // infiltrate op after SoT: only has thieves, money=null
  db.prepare("INSERT INTO province_resources (province_id, money, thieves, source, received_at) VALUES (?, NULL, 4038, 'infiltrate', '2026-04-04 18:30:00')").run(provId);

  const row = db.prepare(`
    SELECT pr.money,
      (SELECT p2.thieves FROM province_resources p2 WHERE p2.province_id = ? AND p2.thieves IS NOT NULL ORDER BY p2.received_at DESC LIMIT 1) AS thieves
    FROM provinces p
    LEFT JOIN province_resources pr ON pr.id = (
      SELECT id FROM province_resources WHERE province_id = p.id AND ${RESOURCES_JOIN_FILTER} ORDER BY received_at DESC LIMIT 1
    )
    WHERE p.id = ?
  `).get(provId, provId) as { money: number | null; thieves: number | null };

  assert.equal(row.money, 1500000, "money should come from SoT, not be shadowed by infiltrate null");
  assert.equal(row.thieves, 4038, "thieves should come from infiltrate op");
  db.close();
});

test("resources: train_army after SoT does not shadow SoT money/food/runes", () => {
  const db = makeDb();
  db.prepare("INSERT INTO provinces (name, kingdom) VALUES ('TestProv', '7:5')").run();
  const { id: provId } = db.prepare("SELECT id FROM provinces WHERE name='TestProv'").get() as { id: number };

  // SoT: has full resource data
  db.prepare("INSERT INTO province_resources (province_id, money, source, received_at) VALUES (?, 2000000, 'sot', '2026-04-04 18:00:00')").run(provId);
  // train_army page visited later: sparse row, money=null
  db.prepare("INSERT INTO province_resources (province_id, money, source, received_at) VALUES (?, NULL, 'train_army', '2026-04-04 18:45:00')").run(provId);

  const row = db.prepare(`
    SELECT pr.money
    FROM provinces p
    LEFT JOIN province_resources pr ON pr.id = (
      SELECT id FROM province_resources WHERE province_id = p.id AND ${RESOURCES_JOIN_FILTER} ORDER BY received_at DESC LIMIT 1
    )
    WHERE p.id = ?
  `).get(provId) as { money: number | null };

  assert.equal(row.money, 2000000, "money should come from SoT, not be shadowed by train_army null");
  db.close();
});

test("resources: build page after SoT does not shadow SoT money/food/runes", () => {
  const db = makeDb();
  db.prepare("INSERT INTO provinces (name, kingdom) VALUES ('TestProv2', '7:5')").run();
  const { id: provId } = db.prepare("SELECT id FROM provinces WHERE name='TestProv2'").get() as { id: number };

  // SoT: has full resource data
  db.prepare("INSERT INTO province_resources (province_id, money, source, received_at) VALUES (?, 3000000, 'sot', '2026-04-04 18:00:00')").run(provId);
  // build page visited later: sparse row, money=null
  db.prepare("INSERT INTO province_resources (province_id, money, source, received_at) VALUES (?, NULL, 'build', '2026-04-04 19:10:00')").run(provId);

  const row = db.prepare(`
    SELECT pr.money
    FROM provinces p
    LEFT JOIN province_resources pr ON pr.id = (
      SELECT id FROM province_resources WHERE province_id = p.id AND ${RESOURCES_JOIN_FILTER} ORDER BY received_at DESC LIMIT 1
    )
    WHERE p.id = ?
  `).get(provId) as { money: number | null };

  assert.equal(row.money, 3000000, "money should come from SoT, not be shadowed by build null");
  db.close();
});

test("resources: state row after SoT does not shadow SoT money/food/runes", () => {
  // state writes thieves/wizards/totalPop/maxPop but not money — newer state row must not shadow SoT money
  const db = makeDb();
  db.prepare("INSERT INTO provinces (name, kingdom) VALUES ('SelfProv', '7:5')").run();
  const { id: provId } = db.prepare("SELECT id FROM provinces WHERE name='SelfProv'").get() as { id: number };

  db.prepare("INSERT INTO province_resources (province_id, money, source, received_at) VALUES (?, 5000000, 'sot', '2026-04-04 18:00:00')").run(provId);
  // state page visited later: stores thieves/wizards only, money=null
  db.prepare("INSERT INTO province_resources (province_id, money, source, received_at) VALUES (?, NULL, 'state', '2026-04-04 18:50:00')").run(provId);

  const row = db.prepare(`
    SELECT pr.money
    FROM provinces p
    LEFT JOIN province_resources pr ON pr.id = (
      SELECT id FROM province_resources WHERE province_id = p.id AND ${RESOURCES_JOIN_FILTER} ORDER BY received_at DESC LIMIT 1
    )
    WHERE p.id = ?
  `).get(provId) as { money: number | null };

  assert.equal(row.money, 5000000, "money should come from SoT, not be shadowed by state null");
  db.close();
});

test("resources: state total_pop/max_pop accessible via per-field subquery despite filtering main join to sot", () => {
  const db = makeDb();
  // extend schema to match real table
  db.exec("ALTER TABLE province_resources ADD COLUMN total_pop INTEGER");
  db.exec("ALTER TABLE province_resources ADD COLUMN max_pop INTEGER");
  db.prepare("INSERT INTO provinces (name, kingdom) VALUES ('SelfProv2', '7:5')").run();
  const { id: provId } = db.prepare("SELECT id FROM provinces WHERE name='SelfProv2'").get() as { id: number };

  db.prepare("INSERT INTO province_resources (province_id, money, source, received_at) VALUES (?, 4000000, 'sot', '2026-04-04 18:00:00')").run(provId);
  db.prepare("INSERT INTO province_resources (province_id, total_pop, max_pop, source, received_at) VALUES (?, 12450, 15200, 'state', '2026-04-04 18:50:00')").run(provId);

  const row = db.prepare(`
    SELECT pr.money,
      (SELECT p2.total_pop FROM province_resources p2 WHERE p2.province_id = ? AND p2.total_pop IS NOT NULL ORDER BY p2.received_at DESC LIMIT 1) AS total_pop,
      (SELECT p2.max_pop  FROM province_resources p2 WHERE p2.province_id = ? AND p2.max_pop  IS NOT NULL ORDER BY p2.received_at DESC LIMIT 1) AS max_pop
    FROM provinces p
    LEFT JOIN province_resources pr ON pr.id = (
      SELECT id FROM province_resources WHERE province_id = p.id AND ${RESOURCES_JOIN_FILTER} ORDER BY received_at DESC LIMIT 1
    )
    WHERE p.id = ?
  `).get(provId, provId, provId) as { money: number | null; total_pop: number | null; max_pop: number | null };

  assert.equal(row.money, 4000000, "money from SoT");
  assert.equal(row.total_pop, 12450, "total_pop accessible via per-field subquery from state row");
  assert.equal(row.max_pop, 15200, "max_pop accessible via per-field subquery from state row");
  db.close();
});

// ---------------------------------------------------------------------------
// DB query: province_troops state/som shadowing
//
// state writes peasants-only; som writes home troops without peasants.
// A more recent state or som row must not shadow a full SoT row.
// ---------------------------------------------------------------------------

function makeShadowTroopsDb() {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE provinces (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL, kingdom TEXT NOT NULL,
      UNIQUE(name, kingdom)
    );
    CREATE TABLE province_troops (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      province_id INTEGER NOT NULL REFERENCES provinces(id),
      soldiers INTEGER, off_specs INTEGER, def_specs INTEGER,
      elites INTEGER, war_horses INTEGER, peasants INTEGER,
      source TEXT NOT NULL,
      received_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
  return db;
}

const TROOPS_JOIN_FILTER = `source = 'sot'`;

test("troops: state row after SoT does not shadow SoT soldiers/specs/elites", () => {
  const db = makeShadowTroopsDb();
  db.prepare("INSERT INTO provinces (name, kingdom) VALUES ('SelfProv', '7:5')").run();
  const { id: provId } = db.prepare("SELECT id FROM provinces WHERE name='SelfProv'").get() as { id: number };

  // SoT (throne): full troop data
  db.prepare("INSERT INTO province_troops (province_id, soldiers, off_specs, def_specs, elites, war_horses, peasants, source, received_at) VALUES (?, 5000, 2000, 3000, 1500, 400, 12000, 'sot', '2026-04-04 18:00:00')").run(provId);
  // state page visited later: only peasants known
  db.prepare("INSERT INTO province_troops (province_id, soldiers, off_specs, def_specs, elites, war_horses, peasants, source, received_at) VALUES (?, NULL, NULL, NULL, NULL, NULL, 12500, 'state', '2026-04-04 18:50:00')").run(provId);

  const row = db.prepare(`
    SELECT pt.soldiers, pt.peasants
    FROM provinces p
    LEFT JOIN province_troops pt ON pt.id = (
      SELECT id FROM province_troops WHERE province_id = p.id AND ${TROOPS_JOIN_FILTER} ORDER BY received_at DESC LIMIT 1
    )
    WHERE p.id = ?
  `).get(provId) as { soldiers: number | null; peasants: number | null };

  assert.equal(row.soldiers, 5000, "soldiers should come from SoT, not be shadowed by state null");
  assert.equal(row.peasants, 12000, "peasants should come from SoT when SoT row is selected");
  db.close();
});

test("troops: som row after SoT does not shadow SoT when filtered to sot only", () => {
  const db = makeShadowTroopsDb();
  db.prepare("INSERT INTO provinces (name, kingdom) VALUES ('EnemyProv', '8:3')").run();
  const { id: provId } = db.prepare("SELECT id FROM provinces WHERE name='EnemyProv'").get() as { id: number };

  // SoT: full troop data
  db.prepare("INSERT INTO province_troops (province_id, soldiers, off_specs, def_specs, elites, war_horses, peasants, source, received_at) VALUES (?, 4000, 1500, 2500, 1200, 300, 10000, 'sot', '2026-04-04 17:00:00')").run(provId);
  // SoM home army: no peasants
  db.prepare("INSERT INTO province_troops (province_id, soldiers, off_specs, def_specs, elites, war_horses, peasants, source, received_at) VALUES (?, 3800, 1400, 2400, 1100, 280, NULL, 'som', '2026-04-04 18:00:00')").run(provId);

  const row = db.prepare(`
    SELECT pt.soldiers, pt.peasants
    FROM provinces p
    LEFT JOIN province_troops pt ON pt.id = (
      SELECT id FROM province_troops WHERE province_id = p.id AND ${TROOPS_JOIN_FILTER} ORDER BY received_at DESC LIMIT 1
    )
    WHERE p.id = ?
  `).get(provId) as { soldiers: number | null; peasants: number | null };

  assert.equal(row.soldiers, 4000, "soldiers should come from SoT, not be shadowed by som home troops");
  assert.equal(row.peasants, 10000, "peasants from SoT preserved");
  db.close();
});

// ---------------------------------------------------------------------------
// DB query: race/personality/honor non-null sourcing across province_overview
//
// Scenario: state row (land/NW only, null race/personality/honor) arrives
// after a sot row (has race/personality/honor).  Per-field IS NOT NULL
// subqueries should still surface the sot values.
// A kingdom row has race but not personality — personality subquery must
// not pick it up.
// ---------------------------------------------------------------------------

function makeOverviewDb() {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE provinces (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL, kingdom TEXT NOT NULL,
      UNIQUE(name, kingdom)
    );
    CREATE TABLE province_overview (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      province_id INTEGER NOT NULL REFERENCES provinces(id),
      race TEXT,
      personality TEXT,
      honor_title TEXT,
      land INTEGER,
      networth INTEGER,
      received_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
  return db;
}

test("overview: race/personality/honor survive later state row with nulls", () => {
  const db = makeOverviewDb();
  db.prepare("INSERT INTO provinces (name, kingdom) VALUES ('TestProv', '2:3')").run();
  const { id: provId } = db.prepare("SELECT id FROM provinces WHERE name='TestProv'").get() as { id: number };

  // SoT row: full data
  db.prepare("INSERT INTO province_overview (province_id, race, personality, honor_title, land, received_at) VALUES (?, 'Elf', 'Merchant', 'Chancellor', 500, '2026-04-04 10:00:00')").run(provId);
  // state row: land/NW only, no race/personality/honor
  db.prepare("INSERT INTO province_overview (province_id, race, personality, honor_title, land, received_at) VALUES (?, NULL, NULL, NULL, 510, '2026-04-04 11:00:00')").run(provId);

  const row = db.prepare(`
    SELECT
      (SELECT race        FROM province_overview WHERE province_id = ? AND race        IS NOT NULL ORDER BY received_at DESC LIMIT 1) AS race,
      (SELECT personality FROM province_overview WHERE province_id = ? AND personality IS NOT NULL ORDER BY received_at DESC LIMIT 1) AS personality,
      (SELECT honor_title FROM province_overview WHERE province_id = ? AND honor_title IS NOT NULL ORDER BY received_at DESC LIMIT 1) AS honor_title,
      (SELECT land        FROM province_overview WHERE province_id =                              ? ORDER BY received_at DESC LIMIT 1) AS land
  `).get(provId, provId, provId, provId) as { race: string | null; personality: string | null; honor_title: string | null; land: number | null };

  assert.equal(row.race, "Elf",        "race should survive state null-shadow");
  assert.equal(row.personality, "Merchant", "personality should survive state null-shadow");
  assert.equal(row.honor_title, "Chancellor", "honor_title should survive state null-shadow");
  assert.equal(row.land, 510, "land should come from most recent row");
  db.close();
});

test("overview: kingdom row has race but null personality — personality stays null", () => {
  const db = makeOverviewDb();
  db.prepare("INSERT INTO provinces (name, kingdom) VALUES ('TestProv', '2:3')").run();
  const { id: provId } = db.prepare("SELECT id FROM provinces WHERE name='TestProv'").get() as { id: number };

  // kingdom row: race known, personality null (kingdom page doesn't expose personality)
  db.prepare("INSERT INTO province_overview (province_id, race, personality, honor_title, received_at) VALUES (?, 'Human', NULL, NULL, '2026-04-04 10:00:00')").run(provId);

  const row = db.prepare(`
    SELECT
      (SELECT race        FROM province_overview WHERE province_id = ? AND race        IS NOT NULL ORDER BY received_at DESC LIMIT 1) AS race,
      (SELECT personality FROM province_overview WHERE province_id = ? AND personality IS NOT NULL ORDER BY received_at DESC LIMIT 1) AS personality
  `).get(provId, provId) as { race: string | null; personality: string | null };

  assert.equal(row.race, "Human", "race from kingdom row is returned");
  assert.equal(row.personality, null, "personality remains null when no sot row exists");
  db.close();
});

// ---------------------------------------------------------------------------
// Troop column split: SoT (total) vs SoM (at home) sourced independently
// ---------------------------------------------------------------------------

function makeTroopsDb() {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE provinces (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL, kingdom TEXT NOT NULL,
      UNIQUE(name, kingdom)
    );
    CREATE TABLE province_troops (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      province_id INTEGER NOT NULL REFERENCES provinces(id),
      soldiers INTEGER,
      off_specs INTEGER,
      def_specs INTEGER,
      elites INTEGER,
      peasants INTEGER,
      source TEXT NOT NULL DEFAULT 'sot',
      received_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
  return db;
}

// The two-join query mirroring getKingdomProvinces
function queryTroops(db: ReturnType<typeof makeTroopsDb>, provId: number) {
  return db.prepare(`
    SELECT pt.soldiers, pt.off_specs, pt.peasants, pt.source AS troops_source,
           pt_home.soldiers AS soldiers_home, pt_home.off_specs AS off_specs_home
    FROM provinces p
    LEFT JOIN province_troops pt ON pt.id = (
      SELECT id FROM province_troops WHERE province_id = p.id AND source IN ('sot','state') ORDER BY received_at DESC LIMIT 1
    )
    LEFT JOIN province_troops pt_home ON pt_home.id = (
      SELECT id FROM province_troops WHERE province_id = p.id AND source = 'som' ORDER BY received_at DESC LIMIT 1
    )
    WHERE p.id = ?
  `).get(provId) as { soldiers: number | null; off_specs: number | null; peasants: number | null; troops_source: string | null; soldiers_home: number | null; off_specs_home: number | null };
}

test("troops: SoT and SoM coexist — total and home populated independently", () => {
  const db = makeTroopsDb();
  db.prepare("INSERT INTO provinces (name, kingdom) VALUES ('Alpha', '7:5')").run();
  const { id } = db.prepare("SELECT id FROM provinces WHERE name='Alpha'").get() as { id: number };

  db.prepare("INSERT INTO province_troops (province_id, soldiers, off_specs, peasants, source) VALUES (?, 10000, 3000, 8000, 'sot')").run(id);
  db.prepare("INSERT INTO province_troops (province_id, soldiers, off_specs, source) VALUES (?, 7000, 2000, 'som')").run(id);

  const row = queryTroops(db, id);
  assert.equal(row.soldiers, 10000, "total soldiers from SoT");
  assert.equal(row.off_specs, 3000, "total off_specs from SoT");
  assert.equal(row.peasants, 8000, "peasants from SoT");
  assert.equal(row.soldiers_home, 7000, "at-home soldiers from SoM");
  assert.equal(row.off_specs_home, 2000, "at-home off_specs from SoM");
  db.close();
});

test("troops: SoM record does not populate total columns", () => {
  const db = makeTroopsDb();
  db.prepare("INSERT INTO provinces (name, kingdom) VALUES ('Alpha', '7:5')").run();
  const { id } = db.prepare("SELECT id FROM provinces WHERE name='Alpha'").get() as { id: number };

  db.prepare("INSERT INTO province_troops (province_id, soldiers, off_specs, source) VALUES (?, 7000, 2000, 'som')").run(id);

  const row = queryTroops(db, id);
  assert.equal(row.soldiers, null, "no SoT → total soldiers null");
  assert.equal(row.soldiers_home, 7000, "SoM soldiers present");
  db.close();
});

test("troops: SoT record does not populate home columns", () => {
  const db = makeTroopsDb();
  db.prepare("INSERT INTO provinces (name, kingdom) VALUES ('Alpha', '7:5')").run();
  const { id } = db.prepare("SELECT id FROM provinces WHERE name='Alpha'").get() as { id: number };

  db.prepare("INSERT INTO province_troops (province_id, soldiers, off_specs, peasants, source) VALUES (?, 10000, 3000, 8000, 'sot')").run(id);

  const row = queryTroops(db, id);
  assert.equal(row.soldiers, 10000, "SoT soldiers present");
  assert.equal(row.soldiers_home, null, "no SoM → home soldiers null");
  db.close();
});

test("troops: most recent SoT wins over older SoT", () => {
  const db = makeTroopsDb();
  db.prepare("INSERT INTO provinces (name, kingdom) VALUES ('Alpha', '7:5')").run();
  const { id } = db.prepare("SELECT id FROM provinces WHERE name='Alpha'").get() as { id: number };

  db.prepare("INSERT INTO province_troops (province_id, soldiers, source, received_at) VALUES (?, 8000, 'sot', '2026-04-04 17:00:00')").run(id);
  db.prepare("INSERT INTO province_troops (province_id, soldiers, source, received_at) VALUES (?, 9500, 'sot', '2026-04-04 18:00:00')").run(id);

  const row = queryTroops(db, id);
  assert.equal(row.soldiers, 9500, "most recent SoT used");
  db.close();
});

// ---------------------------------------------------------------------------
// Multi-tenancy: intel_partitions isolation
//
// KEY_A and KEY_B are stand-ins for two distinct sha256 key hashes.
// Each test verifies that data submitted under one key is not visible
// to queries made under the other key.
// ---------------------------------------------------------------------------

const KEY_A = "a".repeat(64);
const KEY_B = "b".repeat(64);

function makePartitionedDb() {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE provinces (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL, kingdom TEXT NOT NULL,
      UNIQUE(name, kingdom)
    );
    CREATE TABLE province_overview (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      province_id INTEGER NOT NULL REFERENCES provinces(id),
      networth INTEGER,
      source TEXT NOT NULL DEFAULT 'sot',
      received_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX idx_overview_prov_time ON province_overview(province_id, received_at DESC);
    CREATE TABLE intel_partitions (
      key_hash TEXT NOT NULL,
      province_id INTEGER NOT NULL REFERENCES provinces(id),
      PRIMARY KEY (key_hash, province_id)
    );
    CREATE TABLE key_kingdom_bindings (
      key_hash TEXT PRIMARY KEY,
      kingdom TEXT NOT NULL,
      source TEXT NOT NULL,
      bound_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE kingdom_intel (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      location TEXT NOT NULL,
      kingdom_title TEXT,
      total_networth INTEGER,
      total_land INTEGER,
      total_honor INTEGER,
      wars_won INTEGER,
      networth_rank INTEGER,
      land_rank INTEGER,
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
    CREATE TABLE kingdom_provinces (
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
  return db;
}

function addProvince(db: ReturnType<typeof makePartitionedDb>, name: string, kingdom: string, keyHash: string): number {
  db.prepare("INSERT OR IGNORE INTO provinces (name, kingdom) VALUES (?, ?)").run(name, kingdom);
  const { id } = db.prepare("SELECT id FROM provinces WHERE name = ? AND kingdom = ?").get(name, kingdom) as { id: number };
  db.prepare("INSERT OR IGNORE INTO intel_partitions (key_hash, province_id) VALUES (?, ?)").run(keyHash, id);
  return id;
}

// getKingdoms query (mirrors lib/db.ts:464-479)
function queryKingdoms(db: ReturnType<typeof makePartitionedDb>, keyHash: string): string[] {
  return (db.prepare(`
    SELECT p.kingdom AS location
    FROM provinces p
    LEFT JOIN province_overview po ON po.province_id = p.id
    WHERE p.kingdom != ''
      AND EXISTS (SELECT 1 FROM intel_partitions WHERE key_hash = ? AND province_id = p.id)
    GROUP BY p.kingdom
  `).all(keyHash) as { location: string }[]).map((r) => r.location);
}

// getKingdomProvinces query (mirrors lib/db.ts:523-564, simplified to name + id)
function queryKingdomProvinces(db: ReturnType<typeof makePartitionedDb>, kingdom: string, keyHash: string): string[] {
  return (db.prepare(`
    SELECT p.name
    FROM provinces p
    WHERE p.kingdom = ?
      AND EXISTS (SELECT 1 FROM intel_partitions WHERE key_hash = ? AND province_id = p.id)
  `).all(kingdom, keyHash) as { name: string }[]).map((r) => r.name);
}

// getProvinceDetail auth check (mirrors lib/db.ts:615-619)
function checkProvinceAuth(db: ReturnType<typeof makePartitionedDb>, provinceId: number, keyHash: string): boolean {
  return !!db.prepare("SELECT 1 FROM intel_partitions WHERE key_hash = ? AND province_id = ?").get(keyHash, provinceId);
}

function bindKeyToKingdom(db: ReturnType<typeof makePartitionedDb>, keyHash: string, kingdom: string, source: string) {
  const existing = db.prepare(
    "SELECT kingdom FROM key_kingdom_bindings WHERE key_hash = ?"
  ).get(keyHash) as { kingdom: string } | undefined;

  if (existing && existing.kingdom !== kingdom) return;

  db.prepare(`
    INSERT INTO key_kingdom_bindings (key_hash, kingdom, source)
    VALUES (?, ?, ?)
    ON CONFLICT(key_hash) DO NOTHING
  `).run(keyHash, kingdom, source);
}

function queryBoundKingdom(db: ReturnType<typeof makePartitionedDb>, keyHash: string): string | null {
  const row = db.prepare(
    "SELECT kingdom FROM key_kingdom_bindings WHERE key_hash = ?"
  ).get(keyHash) as { kingdom: string } | undefined;
  return row?.kingdom ?? null;
}

function addKingdomSnapshot(
  db: ReturnType<typeof makePartitionedDb>,
  location: string,
  receivedAt: string,
  provinces: { slot?: number; name: string; race: string; land: number; networth: number }[],
  relation: {
    kingdomTitle?: string | null;
    totalNetworth?: number | null;
    totalLand?: number | null;
    totalHonor?: number | null;
    warsWon?: number | null;
    networthRank?: number | null;
    landRank?: number | null;
    theirAttitudeToUs?: string | null;
    theirAttitudePoints?: number | null;
    ourAttitudeToThem?: string | null;
    ourAttitudePoints?: number | null;
    hostilityMeterVisibleUntil?: string | null;
    openRelationsJson?: string | null;
  } = {},
) {
  const result = db.prepare(
    `INSERT INTO kingdom_intel (
      name, location, kingdom_title, total_networth, total_land, total_honor, wars_won, networth_rank, land_rank, their_attitude_to_us, their_attitude_points,
      our_attitude_to_them, our_attitude_points,
      hostility_meter_visible_until, open_relations_json, received_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    `KD ${location}`,
    location,
    relation.kingdomTitle ?? null,
    relation.totalNetworth ?? null,
    relation.totalLand ?? null,
    relation.totalHonor ?? null,
    relation.warsWon ?? null,
    relation.networthRank ?? null,
    relation.landRank ?? null,
    relation.theirAttitudeToUs ?? null,
    relation.theirAttitudePoints ?? null,
    relation.ourAttitudeToThem ?? null,
    relation.ourAttitudePoints ?? null,
    relation.hostilityMeterVisibleUntil ?? null,
    relation.openRelationsJson ?? null,
    receivedAt,
  );
  const snapshotId = Number(result.lastInsertRowid);
  const insertProvince = db.prepare(
    "INSERT INTO kingdom_provinces (kingdom_intel_id, slot, name, race, land, networth) VALUES (?, ?, ?, ?, ?, ?)"
  );

  for (const province of provinces) {
    insertProvince.run(snapshotId, province.slot ?? null, province.name, province.race, province.land, province.networth);
  }
}

function queryLatestKingdomSnapshot(
  db: ReturnType<typeof makePartitionedDb>,
  location: string,
  keyHash: string,
): {
  provinces: { slot: number | null; name: string }[];
  kingdomTitle: string | null;
  totalNetworth: number | null;
  totalLand: number | null;
  totalHonor: number | null;
  warsWon: number | null;
  networthRank: number | null;
  landRank: number | null;
  theirAttitudeToUs: string | null;
  theirAttitudePoints: number | null;
  ourAttitudeToThem: string | null;
  ourAttitudePoints: number | null;
  hostilityMeterVisibleUntil: string | null;
  openRelationsJson: string | null;
} | null {
  const snapshot = db.prepare(`
    SELECT ki.id,
           ki.kingdom_title,
           ki.total_networth,
           ki.total_land,
           ki.total_honor,
           ki.wars_won,
           ki.networth_rank,
           ki.land_rank,
           ki.their_attitude_to_us,
           ki.their_attitude_points,
           ki.our_attitude_to_them,
           ki.our_attitude_points,
           ki.hostility_meter_visible_until,
           ki.open_relations_json
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
    ORDER BY ki.received_at DESC, ki.id DESC
    LIMIT 1
  `).get(location, keyHash) as {
    id: number;
    kingdom_title: string | null;
    total_networth: number | null;
    total_land: number | null;
    total_honor: number | null;
    wars_won: number | null;
    networth_rank: number | null;
    land_rank: number | null;
    their_attitude_to_us: string | null;
    their_attitude_points: number | null;
    our_attitude_to_them: string | null;
    our_attitude_points: number | null;
    hostility_meter_visible_until: string | null;
    open_relations_json: string | null;
  } | undefined;

  if (!snapshot) return null;

  const provinces = (db.prepare(`
    SELECT slot, name
    FROM kingdom_provinces
    WHERE kingdom_intel_id = ?
    ORDER BY networth DESC, name ASC
  `).all(snapshot.id) as { slot: number | null; name: string }[]);

  return {
    provinces,
    kingdomTitle: snapshot.kingdom_title,
    totalNetworth: snapshot.total_networth,
    totalLand: snapshot.total_land,
    totalHonor: snapshot.total_honor,
    warsWon: snapshot.wars_won,
    networthRank: snapshot.networth_rank,
    landRank: snapshot.land_rank,
    theirAttitudeToUs: snapshot.their_attitude_to_us,
    theirAttitudePoints: snapshot.their_attitude_points,
    ourAttitudeToThem: snapshot.our_attitude_to_them,
    ourAttitudePoints: snapshot.our_attitude_points,
    hostilityMeterVisibleUntil: snapshot.hostility_meter_visible_until,
    openRelationsJson: snapshot.open_relations_json,
  };
}

// --- getKingdoms ---

test("multi-tenancy: getKingdoms returns only key's own kingdoms", () => {
  const db = makePartitionedDb();
  addProvince(db, "Alpha", "7:5", KEY_A);
  addProvince(db, "Beta",  "8:3", KEY_B);

  assert.deepEqual(queryKingdoms(db, KEY_A), ["7:5"]);
  assert.deepEqual(queryKingdoms(db, KEY_B), ["8:3"]);
  db.close();
});

test("multi-tenancy: shared kingdom visible to both keys", () => {
  const db = makePartitionedDb();
  addProvince(db, "Alpha", "7:5", KEY_A);
  addProvince(db, "Beta",  "7:5", KEY_B);

  assert.deepEqual(queryKingdoms(db, KEY_A), ["7:5"]);
  assert.deepEqual(queryKingdoms(db, KEY_B), ["7:5"]);
  db.close();
});

// --- getKingdomProvinces ---

test("multi-tenancy: getKingdomProvinces excludes other key's provinces", () => {
  const db = makePartitionedDb();
  addProvince(db, "Alpha", "7:5", KEY_A);
  addProvince(db, "Beta",  "7:5", KEY_B);

  assert.deepEqual(queryKingdomProvinces(db, "7:5", KEY_A), ["Alpha"]);
  assert.deepEqual(queryKingdomProvinces(db, "7:5", KEY_B), ["Beta"]);
  db.close();
});

test("multi-tenancy: key with no provinces in kingdom returns empty", () => {
  const db = makePartitionedDb();
  addProvince(db, "Alpha", "7:5", KEY_A);

  assert.deepEqual(queryKingdomProvinces(db, "7:5", KEY_B), []);
  db.close();
});

test("multi-tenancy: province linked to both keys is visible to both", () => {
  const db = makePartitionedDb();
  const id = addProvince(db, "Alpha", "7:5", KEY_A);
  // KEY_B also submits intel for the same province (kingdom-mates)
  db.prepare("INSERT OR IGNORE INTO intel_partitions (key_hash, province_id) VALUES (?, ?)").run(KEY_B, id);

  assert.deepEqual(queryKingdomProvinces(db, "7:5", KEY_A), ["Alpha"]);
  assert.deepEqual(queryKingdomProvinces(db, "7:5", KEY_B), ["Alpha"]);
  db.close();
});

// --- getProvinceDetail auth check ---

test("multi-tenancy: auth check denies access to another key's province", () => {
  const db = makePartitionedDb();
  const id = addProvince(db, "Alpha", "7:5", KEY_A);

  assert.equal(checkProvinceAuth(db, id, KEY_B), false);
  db.close();
});

test("multi-tenancy: auth check grants access to owning key", () => {
  const db = makePartitionedDb();
  const id = addProvince(db, "Alpha", "7:5", KEY_A);

  assert.equal(checkProvinceAuth(db, id, KEY_A), true);
  db.close();
});

// --- intel_partitions deduplication ---

test("multi-tenancy: duplicate partition inserts are ignored (INSERT OR IGNORE)", () => {
  const db = makePartitionedDb();
  const id = addProvince(db, "Alpha", "7:5", KEY_A);
  // Insert the same (KEY_A, id) a second time — should be silently ignored
  db.prepare("INSERT OR IGNORE INTO intel_partitions (key_hash, province_id) VALUES (?, ?)").run(KEY_A, id);

  const { count } = db.prepare("SELECT COUNT(*) AS count FROM intel_partitions WHERE key_hash = ? AND province_id = ?").get(KEY_A, id) as { count: number };
  assert.equal(count, 1);
  db.close();
});

test("kingdom binding: first throne binding is stored for the key", () => {
  const db = makePartitionedDb();

  bindKeyToKingdom(db, KEY_A, "7:5", "throne");

  assert.equal(queryBoundKingdom(db, KEY_A), "7:5");
  db.close();
});

test("kingdom binding: mismatched later kingdom is ignored", () => {
  const db = makePartitionedDb();

  bindKeyToKingdom(db, KEY_A, "7:5", "throne");
  bindKeyToKingdom(db, KEY_A, "8:3", "throne");

  assert.equal(queryBoundKingdom(db, KEY_A), "7:5");
  db.close();
});

test("kingdom snapshot: latest accessible snapshot is returned", () => {
  const db = makePartitionedDb();
  addProvince(db, "Alpha", "7:5", KEY_A);
  addProvince(db, "Beta", "7:5", KEY_A);

  addKingdomSnapshot(db, "7:5", "2026-04-05 17:00:00", [
    { slot: 3, name: "Alpha", race: "Orc", land: 1200, networth: 300000 },
    { slot: 9, name: "Beta", race: "Elf", land: 1100, networth: 280000 },
  ]);
  addKingdomSnapshot(db, "7:5", "2026-04-05 18:00:00", [
    { slot: 4, name: "Alpha", race: "Orc", land: 1250, networth: 320000 },
    { slot: 11, name: "Beta", race: "Elf", land: 1150, networth: 290000 },
  ]);

  assert.deepEqual(queryLatestKingdomSnapshot(db, "7:5", KEY_A)?.provinces, [
    { slot: 4, name: "Alpha" },
    { slot: 11, name: "Beta" },
  ]);
  db.close();
});

test("kingdom snapshot: inaccessible snapshot is filtered out", () => {
  const db = makePartitionedDb();
  addProvince(db, "Alpha", "7:5", KEY_A);
  addProvince(db, "Beta", "7:5", KEY_A);

  addKingdomSnapshot(db, "7:5", "2026-04-05 18:00:00", [
    { name: "Alpha", race: "Orc", land: 1250, networth: 320000 },
    { name: "Beta", race: "Elf", land: 1150, networth: 290000 },
    { name: "Gamma", race: "Human", land: 900, networth: 210000 },
  ]);

  assert.equal(queryLatestKingdomSnapshot(db, "7:5", KEY_A), null);
  db.close();
});

test("kingdom snapshot: relation fields are returned with the snapshot", () => {
  const db = makePartitionedDb();
  addProvince(db, "Alpha", "7:5", KEY_A);

  addKingdomSnapshot(
    db,
    "7:5",
    "2026-04-05 18:00:00",
    [{ name: "Alpha", race: "Orc", land: 1250, networth: 320000 }],
    {
      theirAttitudeToUs: "Normal",
      theirAttitudePoints: 0,
      ourAttitudeToThem: "Hostile",
      ourAttitudePoints: 3,
      hostilityMeterVisibleUntil: "Mon, 20 Apr",
    },
  );

  const snapshot = queryLatestKingdomSnapshot(db, "7:5", KEY_A);
  assert.ok(snapshot);
  assert.equal(snapshot.theirAttitudeToUs, "Normal");
  assert.equal(snapshot.theirAttitudePoints, 0);
  assert.equal(snapshot.ourAttitudeToThem, "Hostile");
  assert.equal(snapshot.ourAttitudePoints, 3);
  assert.equal(snapshot.hostilityMeterVisibleUntil, "Mon, 20 Apr");
  assert.equal(snapshot.openRelationsJson, null);
  db.close();
});

test("kingdom snapshot: open relations json is returned with the snapshot", () => {
  const db = makePartitionedDb();
  addProvince(db, "Alpha", "7:5", KEY_A);

  addKingdomSnapshot(
    db,
    "7:5",
    "2026-04-05 18:00:00",
    [{ name: "Alpha", race: "Orc", land: 1250, networth: 320000 }],
    {
      openRelationsJson: JSON.stringify([{ name: "Absolute Cinema", location: "5:7", status: "Hostile" }]),
    },
  );

  const snapshot = queryLatestKingdomSnapshot(db, "7:5", KEY_A);
  assert.ok(snapshot);
  assert.equal(snapshot.openRelationsJson, JSON.stringify([{ name: "Absolute Cinema", location: "5:7", status: "Hostile" }]));
  db.close();
});

test("kingdom snapshot: kingdom title is returned with the snapshot", () => {
  const db = makePartitionedDb();
  addProvince(db, "Alpha", "7:5", KEY_A);

  addKingdomSnapshot(
    db,
    "7:5",
    "2026-04-05 18:00:00",
    [{ name: "Alpha", race: "Orc", land: 1250, networth: 320000 }],
    {
      kingdomTitle: "Glorious",
    },
  );

  const snapshot = queryLatestKingdomSnapshot(db, "7:5", KEY_A);
  assert.ok(snapshot);
  assert.equal(snapshot.kingdomTitle, "Glorious");
  db.close();
});

test("kingdom snapshot: top-level kingdom stats are returned with the snapshot", () => {
  const db = makePartitionedDb();
  addProvince(db, "Alpha", "7:5", KEY_A);

  addKingdomSnapshot(
    db,
    "7:5",
    "2026-04-05 18:00:00",
    [{ name: "Alpha", race: "Orc", land: 1250, networth: 320000 }],
    {
      totalNetworth: 25600865,
      totalLand: 95368,
      totalHonor: 24810,
      warsWon: 2,
      networthRank: 3,
      landRank: 5,
    },
  );

  const snapshot = queryLatestKingdomSnapshot(db, "7:5", KEY_A);
  assert.ok(snapshot);
  assert.equal(snapshot.totalNetworth, 25600865);
  assert.equal(snapshot.totalLand, 95368);
  assert.equal(snapshot.totalHonor, 24810);
  assert.equal(snapshot.warsWon, 2);
  assert.equal(snapshot.networthRank, 3);
  assert.equal(snapshot.landRank, 5);
  db.close();
});

test("kingdom snapshot: ties on received_at prefer the newer row by id", () => {
  const db = makePartitionedDb();
  addProvince(db, "Alpha", "7:5", KEY_A);

  addKingdomSnapshot(
    db,
    "7:5",
    "2026-04-05 18:00:00",
    [{ name: "Alpha", race: "Orc", land: 1250, networth: 320000 }],
    {
      kingdomTitle: "Glorious",
    },
  );

  addKingdomSnapshot(
    db,
    "7:5",
    "2026-04-05 18:00:00",
    [{ name: "Alpha", race: "Orc", land: 1250, networth: 320000 }],
    {
      kingdomTitle: "Glorious",
      totalNetworth: 25600865,
      totalLand: 95368,
    },
  );

  const snapshot = queryLatestKingdomSnapshot(db, "7:5", KEY_A);
  assert.ok(snapshot);
  assert.equal(snapshot.totalNetworth, 25600865);
  assert.equal(snapshot.totalLand, 95368);
  db.close();
});

test("getKingdomSnapshotHistory: returns accessible stat snapshots in ascending time order", async () => {
  await withRealDb(({ getKingdomSnapshotHistory }, db) => {
    for (const name of ["Alpha", "Beta"] as const) {
      db.prepare("INSERT INTO provinces (name, kingdom) VALUES (?, '7:5')").run(name);
      const { id: provId } = db.prepare("SELECT id FROM provinces WHERE name = ? AND kingdom = '7:5'").get(name) as { id: number };
      db.prepare("INSERT INTO intel_partitions (key_hash, province_id) VALUES (?, ?)").run(KEY_A, provId);
    }

    const accessible1 = Number(db.prepare(`
      INSERT INTO kingdom_intel (
        name, location, total_networth, total_land, total_honor, wars_won, networth_rank, land_rank, received_at
      ) VALUES ('KD 7:5', '7:5', 12000000, 45000, 15000, 2, 40, 30, '2026-04-04 16:00:00')
    `).run().lastInsertRowid);
    const accessible2 = Number(db.prepare(`
      INSERT INTO kingdom_intel (
        name, location, total_networth, total_land, total_honor, wars_won, networth_rank, land_rank, received_at
      ) VALUES ('KD 7:5', '7:5', 12500000, 45250, 15500, 2, 38, 29, '2026-04-04 18:00:00')
    `).run().lastInsertRowid);
    const inaccessible = Number(db.prepare(`
      INSERT INTO kingdom_intel (
        name, location, total_networth, total_land, total_honor, wars_won, networth_rank, land_rank, received_at
      ) VALUES ('KD 7:5', '7:5', 13000000, 46000, 16000, 3, 35, 28, '2026-04-04 19:00:00')
    `).run().lastInsertRowid);
    const noStats = Number(db.prepare(`
      INSERT INTO kingdom_intel (name, location, received_at)
      VALUES ('KD 7:5', '7:5', '2026-04-04 20:00:00')
    `).run().lastInsertRowid);

    for (const snapshotId of [accessible1, accessible2, noStats]) {
      db.prepare(`
        INSERT INTO kingdom_provinces (kingdom_intel_id, slot, name, race, land, networth)
        VALUES (?, 3, 'Alpha', 'Orc', 1200, 300000),
               (?, 9, 'Beta', 'Elf', 1100, 280000)
      `).run(snapshotId, snapshotId);
    }

    db.prepare(`
      INSERT INTO kingdom_provinces (kingdom_intel_id, slot, name, race, land, networth)
      VALUES (?, 3, 'Alpha', 'Orc', 1200, 300000),
             (?, 9, 'Gamma', 'Human', 900, 210000)
    `).run(inaccessible, inaccessible);

    const history = getKingdomSnapshotHistory("7:5", KEY_A);

    assert.deepEqual(
      history.map((point) => ({
        receivedAt: point.receivedAt,
        totalNetworth: point.totalNetworth,
        totalLand: point.totalLand,
        totalHonor: point.totalHonor,
      })),
      [
        {
          receivedAt: "2026-04-04 16:00:00",
          totalNetworth: 12000000,
          totalLand: 45000,
          totalHonor: 15000,
        },
        {
          receivedAt: "2026-04-04 18:00:00",
          totalNetworth: 12500000,
          totalLand: 45250,
          totalHonor: 15500,
        },
      ],
    );
  });
});

// ---------------------------------------------------------------------------
// kingdom_news: storeKingdomNews SNATCH_NEWS kingdom inference
// ---------------------------------------------------------------------------

function makeNewsDb() {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE kingdom_news (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      kingdom TEXT NOT NULL,
      game_date TEXT NOT NULL,
      game_date_ord INTEGER,
      event_type TEXT NOT NULL,
      raw_text TEXT NOT NULL,
      attacker_name TEXT, attacker_kingdom TEXT,
      defender_name TEXT, defender_kingdom TEXT,
      acres INTEGER, books INTEGER,
      sender_name TEXT, receiver_name TEXT,
      relation_kingdom TEXT,
      dragon_type TEXT, dragon_name TEXT,
      received_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(kingdom, game_date, raw_text)
    );
    CREATE TABLE key_kingdom_bindings (
      key_hash TEXT PRIMARY KEY,
      kingdom TEXT NOT NULL,
      source TEXT NOT NULL,
      bound_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE provinces (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL, kingdom TEXT NOT NULL,
      UNIQUE(name, kingdom)
    );
    CREATE TABLE intel_partitions (
      key_hash TEXT NOT NULL,
      province_id INTEGER NOT NULL REFERENCES provinces(id),
      PRIMARY KEY (key_hash, province_id)
    );
  `);
  return db;
}

function insertNews(
  db: ReturnType<typeof makeNewsDb>,
  kingdom: string,
  events: Array<{ gameDate: string; rawText: string; eventType?: string; attackerKingdom?: string | null; defenderKingdom?: string | null; acres?: number | null }>,
) {
  const ins = db.prepare(`
    INSERT OR IGNORE INTO kingdom_news
      (kingdom, game_date, game_date_ord, event_type, raw_text, attacker_kingdom, defender_kingdom, acres)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const e of events) {
    ins.run(kingdom, e.gameDate, parseUtopiaDate(e.gameDate), e.eventType ?? "march", e.rawText, e.attackerKingdom ?? null, e.defenderKingdom ?? null, e.acres ?? null);
  }
}

function queryNewsKingdoms(db: ReturnType<typeof makeNewsDb>): string[] {
  return (db.prepare("SELECT DISTINCT kingdom FROM kingdom_news ORDER BY kingdom").all() as { kingdom: string }[]).map(r => r.kingdom);
}

// Mirror of storeKingdomNews SNATCH_NEWS inference logic using the in-memory DB
function snatchStore(db: ReturnType<typeof makeNewsDb>, data: KingdomNewsData, keyHash: string) {
  const ownRow = db.prepare("SELECT kingdom FROM key_kingdom_bindings WHERE key_hash = ?").get(keyHash) as { kingdom: string } | undefined;
  const ownKingdom = ownRow?.kingdom ?? null;

  const outgoing = data.events.find(e => e.attackerKingdom && e.attackerKingdom !== ownKingdom);
  const kingdom = outgoing?.attackerKingdom ?? null;
  if (!kingdom) return;

  const ins = db.prepare(`
    INSERT OR IGNORE INTO kingdom_news
      (kingdom, game_date, game_date_ord, event_type, raw_text, attacker_name, attacker_kingdom, defender_name, defender_kingdom, acres)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const e of data.events) {
    ins.run(kingdom, e.gameDate, parseUtopiaDate(e.gameDate), e.eventType, e.rawText, e.attackerName, e.attackerKingdom, e.defenderName, e.defenderKingdom, e.acres);
  }
}

test("storeKingdomNews SNATCH_NEWS: infers target kingdom from outgoing attack", () => {
  const db = makeNewsDb();
  // Our bound kingdom is 2:6; we snatched news from 4:9
  db.prepare("INSERT INTO key_kingdom_bindings (key_hash, kingdom, source) VALUES (?, '2:6', 'throne')").run(KEY_A);

  const data: KingdomNewsData = {
    events: [
      // Outgoing attack from 4:9 → identifies 4:9 as target kingdom
      { gameDate: "May 1 of YR9", eventType: "march", rawText: "Napoleon Dynamite (4:9) captured 501 acres of land from Who Knows (2:6)", attackerName: "Napoleon Dynamite", attackerKingdom: "4:9", defenderName: "Who Knows", defenderKingdom: "2:6", acres: 501, books: null, senderName: null, receiverName: null, relationKingdom: null, dragonType: null, dragonName: null },
      // Incoming attack on 4:9 — attacker is from another kingdom, not 4:9
      { gameDate: "May 1 of YR9", eventType: "march", rawText: "Attacker (2:6) captured 200 acres of land from Defender (4:9)", attackerName: "Attacker", attackerKingdom: "2:6", defenderName: "Defender", defenderKingdom: "4:9", acres: 200, books: null, senderName: null, receiverName: null, relationKingdom: null, dragonType: null, dragonName: null },
    ],
  };

  snatchStore(db, data, KEY_A);

  const stored = queryNewsKingdoms(db);
  assert.deepEqual(stored, ["4:9"], "news should be stored under the target kingdom, not our own or both");
});

test("storeKingdomNews SNATCH_NEWS: falls back gracefully when no outgoing attack found", () => {
  const db = makeNewsDb();
  db.prepare("INSERT INTO key_kingdom_bindings (key_hash, kingdom, source) VALUES (?, '2:6', 'throne')").run(KEY_A);

  // News contains only incoming attacks against the target kingdom from a third party
  const data: KingdomNewsData = {
    events: [
      { gameDate: "May 3 of YR9", eventType: "march", rawText: "Raider (9:9) captured 100 acres of land from Victim (4:9)", attackerName: "Raider", attackerKingdom: "9:9", defenderName: "Victim", defenderKingdom: "4:9", acres: 100, books: null, senderName: null, receiverName: null, relationKingdom: null, dragonType: null, dragonName: null },
    ],
  };

  snatchStore(db, data, KEY_A);

  // The news has an attacker from 9:9 (not our kingdom 2:6), so it picks 9:9 as target.
  // While not ideal, this is the defined behavior: first non-self attacker kingdom wins.
  const stored = queryNewsKingdoms(db);
  assert.equal(stored.length, 1);
  assert.notEqual(stored[0], "2:6", "should not store under our own kingdom");
});

// ---------------------------------------------------------------------------
// kingdom_news: getKingdomNews effectiveFrom (3-month default window)
// ---------------------------------------------------------------------------

function makeNewsReadDb() {
  const db = makeNewsDb();
  // Add access: province in kingdom 4:9 linked to KEY_A
  db.prepare("INSERT INTO provinces (name, kingdom) VALUES ('TestProv', '4:9')").run();
  const { id } = db.prepare("SELECT id FROM provinces WHERE name = 'TestProv'").get() as { id: number };
  db.prepare("INSERT INTO intel_partitions (key_hash, province_id) VALUES (?, ?)").run(KEY_A, id);
  return db;
}

function queryEffectiveFrom(db: ReturnType<typeof makeNewsReadDb>, kingdom: string, keyHash: string): string | null {
  // Mirror of getKingdomNews effectiveFrom logic
  const hasAccess = db.prepare(`
    SELECT 1 FROM intel_partitions ip
    JOIN provinces p ON p.id = ip.province_id
    WHERE ip.key_hash = ? AND p.kingdom = ?
    LIMIT 1
  `).get(keyHash, kingdom);
  if (!hasAccess) return null;

  const maxRow = db.prepare("SELECT MAX(game_date_ord) as m FROM kingdom_news WHERE kingdom = ?").get(kingdom) as { m: number | null };
  const maxOrd = maxRow?.m ?? 0;
  if (maxOrd === 0) return formatUtopiaDate(1); // no news: fromOrd = 1
  const fromOrd = maxOrd - 3 * 24 + 1;
  return formatUtopiaDate(fromOrd);
}

test("getKingdomNews effectiveFrom: 3-month lookback from latest news date", () => {
  const db = makeNewsReadDb();
  // Latest news is May 24 of YR9; 3 months back = February 25 of YR9
  const maxDate = "May 24 of YR9";
  const maxOrd = parseUtopiaDate(maxDate);
  insertNews(db, "4:9", [
    { gameDate: maxDate, rawText: "Some event (4:9) captured 100 acres of land from Other (1:1)", eventType: "march", attackerKingdom: "4:9" },
    { gameDate: "January 1 of YR9", rawText: "Old event (4:9) captured 50 acres of land from Older (2:2)", eventType: "march", attackerKingdom: "4:9" },
  ]);

  const effectiveFrom = queryEffectiveFrom(db, "4:9", KEY_A);
  const expectedFromOrd = maxOrd - 3 * 24 + 1;
  assert.equal(effectiveFrom, formatUtopiaDate(expectedFromOrd));
  db.close();
});

test("getKingdomNews effectiveFrom: no news → does not crash", () => {
  const db = makeNewsReadDb();
  // No news rows for kingdom — should return a valid date string
  const effectiveFrom = queryEffectiveFrom(db, "4:9", KEY_A);
  assert.ok(effectiveFrom, "should return a string even with no news");
  db.close();
});

// ---------------------------------------------------------------------------
// storeTrainArmy: free_specialist_credits stored in province_resources
// ---------------------------------------------------------------------------

function makeTrainArmyDb() {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE provinces (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL, kingdom TEXT NOT NULL,
      UNIQUE(name, kingdom)
    );
    CREATE TABLE province_resources (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      province_id INTEGER NOT NULL REFERENCES provinces(id),
      free_specialist_credits INTEGER,
      source TEXT NOT NULL DEFAULT 'sot',
      saved_by TEXT,
      accuracy INTEGER DEFAULT 100,
      received_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE intel_partitions (
      key_hash TEXT NOT NULL,
      province_id INTEGER NOT NULL REFERENCES provinces(id),
      PRIMARY KEY (key_hash, province_id)
    );
  `);
  return db;
}

test("storeTrainArmy: free_specialist_credits stored with source=train_army", () => {
  const db = makeTrainArmyDb();
  db.prepare("INSERT INTO provinces (name, kingdom) VALUES ('SelfProv', '3:3')").run();
  const { id: provId } = db.prepare("SELECT id FROM provinces WHERE name = 'SelfProv'").get() as { id: number };

  // Simulate storeTrainArmy logic
  db.prepare(`
    INSERT INTO province_resources (province_id, free_specialist_credits, source, saved_by, accuracy)
    VALUES (?, ?, 'train_army', ?, 100)
  `).run(provId, 42, "SelfProv");

  const row = db.prepare(`
    SELECT
      (SELECT free_specialist_credits FROM province_resources
       WHERE province_id = ? AND free_specialist_credits IS NOT NULL
       ORDER BY received_at DESC LIMIT 1) AS free_specialist_credits,
      (SELECT source FROM province_resources
       WHERE province_id = ? AND free_specialist_credits IS NOT NULL
       ORDER BY received_at DESC LIMIT 1) AS source
  `).get(provId, provId) as { free_specialist_credits: number | null; source: string | null };

  assert.equal(row.free_specialist_credits, 42);
  assert.equal(row.source, "train_army");
  db.close();
});

test("storeTrainArmy: subsequent SoT with null credits does not shadow train_army value", () => {
  const db = makeTrainArmyDb();
  db.prepare("INSERT INTO provinces (name, kingdom) VALUES ('SelfProv', '3:3')").run();
  const { id: provId } = db.prepare("SELECT id FROM provinces WHERE name = 'SelfProv'").get() as { id: number };

  db.prepare("INSERT INTO province_resources (province_id, free_specialist_credits, source, received_at) VALUES (?, 30, 'train_army', '2026-04-10 10:00:00')").run(provId);
  db.prepare("INSERT INTO province_resources (province_id, free_specialist_credits, source, received_at) VALUES (?, NULL, 'sot', '2026-04-10 11:00:00')").run(provId);

  const row = db.prepare(`
    SELECT free_specialist_credits FROM province_resources
    WHERE province_id = ? AND free_specialist_credits IS NOT NULL
    ORDER BY received_at DESC LIMIT 1
  `).get(provId) as { free_specialist_credits: number | null };

  assert.equal(row.free_specialist_credits, 30, "train_army value should survive later SoT null");
  db.close();
});

// ---------------------------------------------------------------------------
// Real DB module regressions: kingdom ritual/dragon/news aggregation
// ---------------------------------------------------------------------------

test("getKingdomRitual: older ritual is cleared by a newer non-ritual effect snapshot", async () => {
  await withRealDb(({ getKingdomRitual }, db) => {
    db.prepare("INSERT INTO provinces (name, kingdom) VALUES ('Alpha', '7:5')").run();
    const { id: provId } = db.prepare("SELECT id FROM provinces WHERE name = 'Alpha' AND kingdom = '7:5'").get() as { id: number };
    db.prepare("INSERT INTO intel_partitions (key_hash, province_id) VALUES (?, ?)").run(KEY_A, provId);

    db.prepare(`
      INSERT INTO province_effects (
        province_id, effect_name, effect_kind, remaining_ticks, effectiveness_percent, source, saved_by, received_at
      ) VALUES (?, 'Onslaught', 'ritual', 56, 91.7, 'throne', 'Alpha', '2026-04-04 18:00:00')
    `).run(provId);

    assert.deepEqual(getKingdomRitual("7:5", KEY_A), {
      name: "Onslaught",
      remainingTicks: 56,
      effectivenessPercent: 91.7,
      receivedAt: "2026-04-04 18:00:00",
    });

    db.prepare(`
      INSERT INTO province_effects (
        province_id, effect_name, effect_kind, remaining_ticks, effectiveness_percent, source, saved_by, received_at
      ) VALUES (?, 'Builders Boon', 'spell', 1, NULL, 'throne', 'Alpha', '2026-04-04 19:00:00')
    `).run(provId);

    assert.equal(getKingdomRitual("7:5", KEY_A), null);
  });
});

test("getKingdomDragon: later cleared status hides an older dragon", async () => {
  await withRealDb(({ getKingdomDragon }, db) => {
    db.prepare("INSERT INTO provinces (name, kingdom) VALUES ('Alpha', '7:5')").run();
    const { id: provId } = db.prepare("SELECT id FROM provinces WHERE name = 'Alpha' AND kingdom = '7:5'").get() as { id: number };
    db.prepare("INSERT INTO intel_partitions (key_hash, province_id) VALUES (?, ?)").run(KEY_A, provId);

    db.prepare(`
      INSERT INTO province_status (
        province_id, dragon_type, dragon_name, source, saved_by, received_at
      ) VALUES (?, 'Ruby', 'Firedrake', 'state', 'Alpha', '2026-04-04 18:00:00')
    `).run(provId);

    assert.deepEqual(getKingdomDragon("7:5", KEY_A), {
      dragonType: "Ruby",
      dragonName: "Firedrake",
      receivedAt: "2026-04-04 18:00:00",
    });

    db.prepare(`
      INSERT INTO province_status (
        province_id, dragon_type, dragon_name, source, saved_by, received_at
      ) VALUES (?, NULL, NULL, 'state', 'Alpha', '2026-04-04 19:00:00')
    `).run(provId);

    assert.equal(getKingdomDragon("7:5", KEY_A), null);
  });
});

test("getLatestWarDate: returns the most recent war_declared event", async () => {
  await withRealDb(({ getLatestWarDate }, db) => {
    db.prepare("INSERT INTO provinces (name, kingdom) VALUES ('Alpha', '7:5')").run();
    const { id: provId } = db.prepare("SELECT id FROM provinces WHERE name = 'Alpha' AND kingdom = '7:5'").get() as { id: number };
    db.prepare("INSERT INTO intel_partitions (key_hash, province_id) VALUES (?, ?)").run(KEY_A, provId);

    const insertNews = db.prepare(`
      INSERT INTO kingdom_news (
        kingdom, game_date, game_date_ord, event_type, raw_text, received_at
      ) VALUES (?, ?, ?, ?, ?, ?)
    `);

    insertNews.run("7:5", "March 3 of YR9", parseUtopiaDate("March 3 of YR9"), "war_declared", "older war", "2026-04-04 18:00:00");
    insertNews.run("7:5", "March 5 of YR9", parseUtopiaDate("March 5 of YR9"), "ceasefire_proposed", "not a war", "2026-04-04 18:05:00");
    insertNews.run("7:5", "March 7 of YR9", parseUtopiaDate("March 7 of YR9"), "war_declared", "newer war", "2026-04-04 18:10:00");

    assert.equal(getLatestWarDate("7:5", KEY_A), "March 7 of YR9");
  });
});

test("getKingdomNewsSummary: aggregates combat totals, slots, and unique attackers", async () => {
  await withRealDb(({ getKingdomNewsSummary }, db) => {
    for (const name of ["Alpha", "Beta"]) {
      db.prepare("INSERT INTO provinces (name, kingdom) VALUES (?, '7:5')").run(name);
      const { id: provId } = db.prepare("SELECT id FROM provinces WHERE name = ? AND kingdom = '7:5'").get(name) as { id: number };
      db.prepare("INSERT INTO intel_partitions (key_hash, province_id) VALUES (?, ?)").run(KEY_A, provId);
    }

    const insertSnapshot = db.prepare(`
      INSERT INTO kingdom_intel (name, location, received_at)
      VALUES (?, ?, ?)
    `);
    const ourSnapshot = Number(insertSnapshot.run("Our KD", "7:5", "2026-04-04 18:00:00").lastInsertRowid);
    const enemySnapshot = Number(insertSnapshot.run("Enemy KD", "8:3", "2026-04-04 18:00:00").lastInsertRowid);

    const insertProvince = db.prepare(`
      INSERT INTO kingdom_provinces (kingdom_intel_id, slot, name, race, land, networth)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    insertProvince.run(ourSnapshot, 3, "Alpha", "Orc", 1200, 300000);
    insertProvince.run(ourSnapshot, 9, "Beta", "Elf", 1100, 280000);
    insertProvince.run(enemySnapshot, 4, "EnemyOne", "Undead", 1300, 310000);
    insertProvince.run(enemySnapshot, 7, "EnemyTwo", "Human", 1250, 305000);

    const insertNews = db.prepare(`
      INSERT INTO kingdom_news (
        kingdom, game_date, game_date_ord, event_type, raw_text,
        attacker_name, attacker_kingdom, defender_name, defender_kingdom,
        acres, books, received_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const gameDate = "March 10 of YR9";
    const gameDateOrd = parseUtopiaDate(gameDate);
    insertNews.run("7:5", gameDate, gameDateOrd, "march", "Alpha marched EnemyOne", "Alpha", "7:5", "EnemyOne", "8:3", 120, null, "2026-04-04 18:00:00");
    insertNews.run("7:5", gameDate, gameDateOrd, "loot", "Alpha looted EnemyOne", "Alpha", "7:5", "EnemyOne", "8:3", null, 300, "2026-04-04 18:01:00");
    insertNews.run("7:5", gameDate, gameDateOrd, "raze", "EnemyOne razed Alpha", "EnemyOne", "8:3", "Alpha", "7:5", 25, null, "2026-04-04 18:02:00");
    insertNews.run("7:5", gameDate, gameDateOrd, "ambush", "EnemyTwo ambushed Beta", "EnemyTwo", "8:3", "Beta", "7:5", 40, null, "2026-04-04 18:03:00");
    insertNews.run("7:5", gameDate, gameDateOrd, "failed_attack", "EnemyTwo failed on Beta", "EnemyTwo", "8:3", "Beta", "7:5", null, null, "2026-04-04 18:04:00");
    insertNews.run("7:5", gameDate, gameDateOrd, "march", "EnemyOne marched Alpha", "EnemyOne", "8:3", "Alpha", "7:5", 70, null, "2026-04-04 18:05:00");

    const summary = getKingdomNewsSummary("7:5", KEY_A);

    assert.equal(summary.ourKingdom, "7:5");
    assert.equal(summary.totalMarchAcresOut, 120);
    assert.equal(summary.totalRazeAcresOut, 0);
    assert.equal(summary.totalMarchAcresIn, 70);
    assert.equal(summary.totalRazeAcresIn, 25);
    assert.equal(summary.uniqueAttackers, 2);
    assert.equal(summary.byKingdom.length, 2);

    const ours = summary.byKingdom[0];
    assert.equal(ours.kingdom, "7:5");
    assert.equal(ours.kingdomName, "Our KD");
    assert.equal(ours.totalHitsMade, 2);
    assert.equal(ours.totalMarchAcresGained, 120);
    assert.equal(ours.totalLootMade, 1);
    assert.equal(ours.provinces[0].provinceName, "Alpha");
    assert.equal(ours.provinces[0].slot, 3);
    assert.equal(ours.provinces[0].marchAcresGained, 120);
    assert.equal(ours.provinces[0].marchAcresLost, 70);
    assert.equal(ours.provinces[0].razeAcresLost, 25);

    const enemy = summary.byKingdom[1];
    assert.equal(enemy.kingdom, "8:3");
    assert.equal(enemy.kingdomName, "Enemy KD");
    assert.equal(enemy.totalHitsMade, 4);
    assert.equal(enemy.totalMarchAcresGained, 70);
    assert.equal(enemy.totalAmbushAcresGained, 40);
    assert.equal(enemy.totalRazeAcresDealt, 25);
    assert.equal(enemy.provinces[0].provinceName, "EnemyTwo");
    assert.equal(enemy.provinces[0].slot, 7);
    assert.equal(enemy.provinces[1].provinceName, "EnemyOne");
    assert.equal(enemy.provinces[1].slot, 4);
  });
});

test("getKingdomProvinces: armies_out_json keeps SoM counts when SoM is newer", async () => {
  await withRealDb(({ getKingdomProvinces }, db) => {
    db.prepare("INSERT INTO provinces (name, kingdom) VALUES ('Alpha', '7:5')").run();
    const { id: provId } = db.prepare("SELECT id FROM provinces WHERE name = 'Alpha' AND kingdom = '7:5'").get() as { id: number };
    db.prepare("INSERT INTO intel_partitions (key_hash, province_id) VALUES (?, ?)").run(KEY_A, provId);
    db.prepare(`
      INSERT INTO province_overview (province_id, race, land, networth, source, saved_by, received_at)
      VALUES (?, 'Orc', 1200, 300000, 'sot', 'Alpha', '2026-04-04 18:00:00')
    `).run(provId);

    const somId = Number(db.prepare(`
      INSERT INTO military_intel (province_id, ome, dme, source, saved_by, received_at)
      VALUES (?, 110.5, 103.2, 'som', 'Alpha', '2026-04-04 19:00:00')
    `).run(provId).lastInsertRowid);
    const throneId = Number(db.prepare(`
      INSERT INTO military_intel (province_id, ome, dme, source, saved_by, received_at)
      VALUES (?, 110.5, 103.2, 'throne', 'Alpha', '2026-04-04 18:00:00')
    `).run(provId).lastInsertRowid);

    db.prepare(`
      INSERT INTO som_armies (military_intel_id, army_type, generals, soldiers, off_specs, def_specs, elites, war_horses, thieves, land_gained, return_days)
      VALUES (?, 'out_1', 1, 100, 200, 300, 400, 0, 50, 12, 5.5)
    `).run(somId);
    db.prepare(`
      INSERT INTO som_armies (military_intel_id, army_type, land_gained, return_days)
      VALUES (?, 'out_1', 30, 4.5)
    `).run(throneId);

    const provinces = getKingdomProvinces("7:5", KEY_A);
    assert.equal(provinces.length, 1);
    const armies = JSON.parse(provinces[0].armies_out_json ?? "[]");
    assert.deepEqual(armies, [
      { type: "out_1", soldiers: 100, offSpecs: 200, defSpecs: 300, elites: 400, land: 12, eta: 5.5 },
    ]);
  });
});

test("getKingdomProvinces: armies_out_json uses throne ETA/land with SoM troop counts when throne is newer", async () => {
  await withRealDb(({ getKingdomProvinces }, db) => {
    db.prepare("INSERT INTO provinces (name, kingdom) VALUES ('Alpha', '7:5')").run();
    const { id: provId } = db.prepare("SELECT id FROM provinces WHERE name = 'Alpha' AND kingdom = '7:5'").get() as { id: number };
    db.prepare("INSERT INTO intel_partitions (key_hash, province_id) VALUES (?, ?)").run(KEY_A, provId);
    db.prepare(`
      INSERT INTO province_overview (province_id, race, land, networth, source, saved_by, received_at)
      VALUES (?, 'Orc', 1200, 300000, 'sot', 'Alpha', '2026-04-04 18:00:00')
    `).run(provId);

    const somId = Number(db.prepare(`
      INSERT INTO military_intel (province_id, ome, dme, source, saved_by, received_at)
      VALUES (?, 110.5, 103.2, 'som', 'Alpha', '2026-04-04 18:00:00')
    `).run(provId).lastInsertRowid);
    const throneId = Number(db.prepare(`
      INSERT INTO military_intel (province_id, ome, dme, source, saved_by, received_at)
      VALUES (?, 110.5, 103.2, 'throne', 'Alpha', '2026-04-04 19:00:00')
    `).run(provId).lastInsertRowid);

    db.prepare(`
      INSERT INTO som_armies (military_intel_id, army_type, generals, soldiers, off_specs, def_specs, elites, war_horses, thieves, land_gained, return_days)
      VALUES (?, 'out_1', 1, 100, 200, 300, 400, 0, 50, 12, 5.5)
    `).run(somId);
    db.prepare(`
      INSERT INTO som_armies (military_intel_id, army_type, land_gained, return_days)
      VALUES (?, 'out_1', 30, 4.5)
    `).run(throneId);

    const provinces = getKingdomProvinces("7:5", KEY_A);
    assert.equal(provinces.length, 1);
    const armies = JSON.parse(provinces[0].armies_out_json ?? "[]");
    assert.deepEqual(armies, [
      { type: "out_1", soldiers: 100, offSpecs: 200, defSpecs: 300, elites: 400, land: 30, eta: 4.5 },
    ]);
  });
});

test("cleanupExpired: removes old intel rows but keeps recent ones", async () => {
  await withRealDb(({ cleanupExpired }, db) => {
    db.prepare("INSERT INTO provinces (name, kingdom) VALUES ('Alpha', '7:5')").run();
    const { id: provId } = db.prepare("SELECT id FROM provinces WHERE name = 'Alpha' AND kingdom = '7:5'").get() as { id: number };

    db.prepare(`
      INSERT INTO province_overview (province_id, race, land, networth, source, saved_by, received_at)
      VALUES (?, 'Orc', 1000, 200000, 'sot', 'Alpha', '2000-01-01 00:00:00')
    `).run(provId);
    db.prepare(`
      INSERT INTO province_overview (province_id, race, land, networth, source, saved_by, received_at)
      VALUES (?, 'Orc', 1100, 210000, 'sot', 'Alpha', '2999-01-01 00:00:00')
    `).run(provId);

    db.prepare(`
      INSERT INTO province_resources (province_id, money, source, saved_by, received_at)
      VALUES (?, 1000, 'sot', 'Alpha', '2000-01-01 00:00:00')
    `).run(provId);
    db.prepare(`
      INSERT INTO province_resources (province_id, money, source, saved_by, received_at)
      VALUES (?, 2000, 'sot', 'Alpha', '2999-01-01 00:00:00')
    `).run(provId);

    db.prepare(`
      INSERT INTO kingdom_intel (name, location, received_at)
      VALUES ('KD 7:5', '7:5', '2000-01-01 00:00:00')
    `).run();
    db.prepare(`
      INSERT INTO kingdom_intel (name, location, received_at)
      VALUES ('KD 7:5', '7:5', '2999-01-01 00:00:00')
    `).run();

    db.prepare(`
      INSERT INTO kingdom_news (kingdom, game_date, game_date_ord, event_type, raw_text, received_at)
      VALUES ('7:5', 'March 1 of YR9', ?, 'war_declared', 'old war', '2000-01-01 00:00:00')
    `).run(parseUtopiaDate("March 1 of YR9"));
    db.prepare(`
      INSERT INTO kingdom_news (kingdom, game_date, game_date_ord, event_type, raw_text, received_at)
      VALUES ('7:5', 'March 2 of YR9', ?, 'war_declared', 'new war', '2999-01-01 00:00:00')
    `).run(parseUtopiaDate("March 2 of YR9"));

    cleanupExpired();

    const { overviewCount } = db.prepare("SELECT COUNT(*) AS overviewCount FROM province_overview").get() as { overviewCount: number };
    const { resourcesCount } = db.prepare("SELECT COUNT(*) AS resourcesCount FROM province_resources").get() as { resourcesCount: number };
    const { kingdomIntelCount } = db.prepare("SELECT COUNT(*) AS kingdomIntelCount FROM kingdom_intel").get() as { kingdomIntelCount: number };
    const { newsCount } = db.prepare("SELECT COUNT(*) AS newsCount FROM kingdom_news").get() as { newsCount: number };

    assert.equal(overviewCount, 1);
    assert.equal(resourcesCount, 1);
    assert.equal(kingdomIntelCount, 1);
    assert.equal(newsCount, 1);
  });
});

test("getGainsPageData: returns empty shape when the key is not bound to a kingdom", async () => {
  await withRealDb(async (api, db) => {
    db.prepare("INSERT INTO provinces (name, kingdom) VALUES ('Alpha', '7:5')").run();
    const { id: provId } = db.prepare("SELECT id FROM provinces WHERE name = 'Alpha' AND kingdom = '7:5'").get() as { id: number };
    db.prepare("INSERT INTO intel_partitions (key_hash, province_id) VALUES (?, ?)").run(KEY_A, provId);

    const result = getGainsPageData("8:3", KEY_A, api);

    assert.deepEqual(result, {
      targetKingdom: "8:3",
      selfKingdom: null,
      selfProvinces: [],
      targetLatest: [],
      selfSnapshot: null,
      targetSnapshot: null,
      targetRitual: null,
    });
  });
});

test("getGainsPageData: returns bound kingdom context, target intel, and target ritual", async () => {
  await withRealDb(async (api, db) => {
    db.prepare("INSERT INTO key_kingdom_bindings (key_hash, kingdom, source) VALUES (?, '7:5', 'throne')").run(KEY_A);

    for (const [name, kingdom] of [["Alpha", "7:5"], ["EnemyOne", "8:3"]] as const) {
      db.prepare("INSERT INTO provinces (name, kingdom) VALUES (?, ?)").run(name, kingdom);
      const { id: provId } = db.prepare("SELECT id FROM provinces WHERE name = ? AND kingdom = ?").get(name, kingdom) as { id: number };
      db.prepare("INSERT INTO intel_partitions (key_hash, province_id) VALUES (?, ?)").run(KEY_A, provId);
      db.prepare(`
        INSERT INTO province_overview (province_id, race, land, networth, source, saved_by, received_at)
        VALUES (?, 'Orc', 1200, 300000, 'sot', ?, '2026-04-04 18:00:00')
      `).run(provId, name);
    }

    const selfSnapshotId = Number(db.prepare(`
      INSERT INTO kingdom_intel (name, location, received_at)
      VALUES ('Our KD', '7:5', '2026-04-04 18:00:00')
    `).run().lastInsertRowid);
    const targetSnapshotId = Number(db.prepare(`
      INSERT INTO kingdom_intel (name, location, received_at)
      VALUES ('Enemy KD', '8:3', '2026-04-04 18:00:00')
    `).run().lastInsertRowid);

    db.prepare(`
      INSERT INTO kingdom_provinces (kingdom_intel_id, slot, name, race, land, networth)
      VALUES (?, 3, 'Alpha', 'Orc', 1200, 300000)
    `).run(selfSnapshotId);
    db.prepare(`
      INSERT INTO kingdom_provinces (kingdom_intel_id, slot, name, race, land, networth)
      VALUES (?, 4, 'EnemyOne', 'Undead', 1300, 310000)
    `).run(targetSnapshotId);

    const { id: enemyProvId } = db.prepare("SELECT id FROM provinces WHERE name = 'EnemyOne' AND kingdom = '8:3'").get() as { id: number };
    db.prepare(`
      INSERT INTO province_effects (
        province_id, effect_name, effect_kind, remaining_ticks, effectiveness_percent, source, saved_by, received_at
      ) VALUES (?, 'Onslaught', 'ritual', 42, 88.5, 'throne', 'EnemyOne', '2026-04-04 18:00:00')
    `).run(enemyProvId);

    const result = getGainsPageData("8:3", KEY_A, api);

    assert.equal(result.selfKingdom, "7:5");
    assert.equal(result.selfProvinces.length, 1);
    assert.equal(result.selfProvinces[0].name, "Alpha");
    assert.equal(result.targetLatest.length, 1);
    assert.equal(result.targetLatest[0].name, "EnemyOne");
    assert.equal(result.selfSnapshot?.location, "7:5");
    assert.equal(result.targetSnapshot?.location, "8:3");
    assert.deepEqual(result.targetRitual, {
      name: "Onslaught",
      remainingTicks: 42,
      effectivenessPercent: 88.5,
      receivedAt: "2026-04-04 18:00:00",
    });
  });
});

test("getProvinceDetail: returns SoT/resources/status detail and enforces key access", async () => {
  await withRealDb((api, db) => {
    db.prepare("INSERT INTO provinces (name, kingdom) VALUES ('Alpha', '7:5')").run();
    const { id: provId } = db.prepare("SELECT id FROM provinces WHERE name = 'Alpha' AND kingdom = '7:5'").get() as { id: number };
    db.prepare("INSERT INTO intel_partitions (key_hash, province_id) VALUES (?, ?)").run(KEY_A, provId);

    db.prepare(`
      INSERT INTO province_overview (province_id, race, personality, honor_title, land, networth, source, saved_by, received_at)
      VALUES (?, 'Elf', 'Merchant', 'Baron', 1234, 456789, 'sot', 'Alpha', '2026-04-04 18:00:00')
    `).run(provId);
    db.prepare(`
      INSERT INTO total_military_points (province_id, off_points, def_points, source, saved_by, received_at)
      VALUES (?, 111111, 99999, 'sot', 'Alpha', '2026-04-04 18:00:00')
    `).run(provId);
    db.prepare(`
      INSERT INTO home_military_points (province_id, mod_off_at_home, mod_def_at_home, source, saved_by, received_at)
      VALUES (?, 101000, 88000, 'som', 'Alpha', '2026-04-04 18:15:00')
    `).run(provId);
    db.prepare(`
      INSERT INTO province_troops (province_id, soldiers, off_specs, def_specs, elites, war_horses, peasants, source, saved_by, received_at)
      VALUES (?, 500, 600, 700, 800, 50, 9000, 'sot', 'Alpha', '2026-04-04 18:00:00')
    `).run(provId);
    db.prepare(`
      INSERT INTO province_resources (province_id, money, food, runes, prisoners, trade_balance, building_efficiency, thieves, stealth, wizards, mana, total_pop, max_pop, source, saved_by, received_at)
      VALUES (?, 100000, 20000, 3000, 40, -500, 92, 1234, 77, 456, 88, 11000, 14000, 'sot', 'Alpha', '2026-04-04 18:00:00')
    `).run(provId);
    db.prepare(`
      INSERT INTO province_status (province_id, plagued, overpopulated, overpop_deserters, dragon_type, dragon_name, hit_status, war, source, saved_by, received_at)
      VALUES (?, 1, 0, NULL, 'Ruby', 'Inferno', 'moderately', 1, 'sot', 'Alpha', '2026-04-04 18:00:00')
    `).run(provId);
    db.prepare(`
      INSERT INTO province_effects (province_id, effect_name, effect_kind, duration_text, remaining_ticks, effectiveness_percent, source, saved_by, received_at)
      VALUES (?, 'Builders Boon', 'spell', '1 day', 1, NULL, 'sot', 'Alpha', '2026-04-04 18:00:00')
    `).run(provId);

    const detail = api.getProvinceDetail("Alpha", "7:5", KEY_A);
    assert.equal(detail.province?.name, "Alpha");
    assert.equal(detail.overview?.race, "Elf");
    assert.equal(detail.sot?.peasants, 9000);
    assert.equal(detail.resources?.money, 100000);
    assert.equal(detail.resources?.thieves, 1234);
    assert.equal(detail.status?.dragonType, "Ruby");
    assert.equal(detail.status?.war, true);
    assert.equal(detail.effects.length, 1);

    const denied = api.getProvinceDetail("Alpha", "7:5", KEY_B);
    assert.equal(denied.province, null);
    assert.equal(denied.sot, null);
    assert.deepEqual(denied.effects, []);
  });
});

test("getKingdomProvinces: summarizes good and bad spells from the latest effect snapshot only", async () => {
  await withRealDb(({ getKingdomProvinces }, db) => {
    db.prepare("INSERT INTO provinces (name, kingdom) VALUES ('Alpha', '7:5')").run();
    const { id: provId } = db.prepare("SELECT id FROM provinces WHERE name = 'Alpha' AND kingdom = '7:5'").get() as { id: number };
    db.prepare("INSERT INTO intel_partitions (key_hash, province_id) VALUES (?, ?)").run(KEY_A, provId);
    db.prepare(`
      INSERT INTO province_overview (province_id, race, land, networth, source, saved_by, received_at)
      VALUES (?, 'Elf', 1234, 456789, 'sot', 'Alpha', '2026-04-04 18:00:00')
    `).run(provId);

    db.prepare(`
      INSERT INTO province_effects (province_id, effect_name, effect_kind, remaining_ticks, source, saved_by, received_at)
      VALUES (?, 'Inspire Army', 'spell', NULL, 'sot', 'Alpha', '2026-04-04 17:00:00')
    `).run(provId);
    db.prepare(`
      INSERT INTO province_effects (province_id, effect_name, effect_kind, remaining_ticks, source, saved_by, received_at)
      VALUES (?, 'Builders Boon', 'spell', 1, 'sot', 'Alpha', '2026-04-04 18:00:00')
    `).run(provId);
    db.prepare(`
      INSERT INTO province_effects (province_id, effect_name, effect_kind, remaining_ticks, source, saved_by, received_at)
      VALUES (?, 'Greed', 'spell', 4, 'sot', 'Alpha', '2026-04-04 18:00:00')
    `).run(provId);

    const rows = getKingdomProvinces("7:5", KEY_A);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].good_spell_count, 1);
    assert.equal(rows[0].bad_spell_count, 1);
    assert.equal(rows[0].good_spell_details, "Builders Boon (1)");
    assert.equal(rows[0].bad_spell_details, "Greed (4)");
  });
});

test("getKingdomNews: applies from/to filters and returns newest-first rows", async () => {
  await withRealDb(({ getKingdomNews }, db) => {
    db.prepare("INSERT INTO provinces (name, kingdom) VALUES ('Alpha', '7:5')").run();
    const { id: provId } = db.prepare("SELECT id FROM provinces WHERE name = 'Alpha' AND kingdom = '7:5'").get() as { id: number };
    db.prepare("INSERT INTO intel_partitions (key_hash, province_id) VALUES (?, ?)").run(KEY_A, provId);

    const insertNews = db.prepare(`
      INSERT INTO kingdom_news (kingdom, game_date, game_date_ord, event_type, raw_text, received_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    insertNews.run("7:5", "March 1 of YR9", parseUtopiaDate("March 1 of YR9"), "war_declared", "oldest", "2026-04-04 18:00:00");
    insertNews.run("7:5", "March 5 of YR9", parseUtopiaDate("March 5 of YR9"), "war_declared", "middle", "2026-04-04 18:01:00");
    insertNews.run("7:5", "March 9 of YR9", parseUtopiaDate("March 9 of YR9"), "war_declared", "newest", "2026-04-04 18:02:00");

    const result = getKingdomNews("7:5", KEY_A, "March 2 of YR9", "March 8 of YR9");
    assert.equal(result.effectiveFrom, "March 2 of YR9");
    assert.deepEqual(result.events.map((e) => e.rawText), ["middle"]);
  });
});
