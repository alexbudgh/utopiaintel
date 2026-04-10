import { test } from "node:test";
import assert from "node:assert/strict";
import Database from "better-sqlite3";
import { sameTick } from "../lib/ui";

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
      SELECT id FROM province_resources WHERE province_id = p.id AND source != 'infiltrate' ORDER BY received_at DESC LIMIT 1
    )
    WHERE p.id = ?
  `).get(provId, provId) as { money: number | null; thieves: number | null };

  assert.equal(row.money, 1500000, "money should come from SoT, not be shadowed by infiltrate null");
  assert.equal(row.thieves, 4038, "thieves should come from infiltrate op");
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
      name, location, their_attitude_to_us, their_attitude_points,
      our_attitude_to_them, our_attitude_points,
      hostility_meter_visible_until, open_relations_json, received_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    `KD ${location}`,
    location,
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
  theirAttitudeToUs: string | null;
  theirAttitudePoints: number | null;
  ourAttitudeToThem: string | null;
  ourAttitudePoints: number | null;
  hostilityMeterVisibleUntil: string | null;
  openRelationsJson: string | null;
} | null {
  const snapshot = db.prepare(`
    SELECT ki.id,
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
    ORDER BY ki.received_at DESC
    LIMIT 1
  `).get(location, keyHash) as {
    id: number;
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
