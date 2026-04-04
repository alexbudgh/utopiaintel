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
