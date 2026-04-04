import { test } from "node:test";
import assert from "node:assert/strict";
import Database from "better-sqlite3";
import { sameTick } from "../lib/ui.ts";

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
