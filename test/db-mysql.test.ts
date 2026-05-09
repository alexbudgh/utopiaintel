import { test, after } from "node:test";
import assert from "node:assert/strict";
import type { RowDataPacket } from "mysql2/promise";
import { pool, initDb, ensureProvince, recordSubmission, bindKeyToKingdom, withTransaction, storeTrainArmy, storeBuild, storeInfiltrate, storeSoD } from "../lib/db-mysql";

after(async () => {
  await pool.end();
});

test("initDb: creates all expected tables", async () => {
  await initDb();

  interface TableRow extends RowDataPacket { TABLE_NAME: string }
  const [rows] = await pool.query<TableRow[]>(
    `SELECT TABLE_NAME FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = DATABASE()
     ORDER BY TABLE_NAME`
  );

  const names = rows.map((r) => r.TABLE_NAME).sort();
  const expected = [
    "attack_ops",
    "home_military_points",
    "intel_partitions",
    "key_kingdom_bindings",
    "kingdom_intel",
    "kingdom_news",
    "kingdom_news_sharded",
    "kingdom_provinces",
    "military_intel",
    "province_effects",
    "province_overview",
    "province_resources",
    "province_status",
    "province_troops",
    "provinces",
    "rob_ops",
    "som_armies",
    "sos_intel",
    "sos_sciences",
    "sorcery_ops",
    "survey_buildings",
    "survey_intel",
    "total_military_points",
  ].sort();

  for (const t of expected) {
    assert.ok(names.includes(t), `missing table: ${t}`);
  }
});

test("initDb: idempotent — running twice does not throw", async () => {
  await initDb();
  await initDb();
});

// ── helpers ──────────────────────────────────────────────────────────────────

// Truncate all tables between tests so each test starts clean.
async function truncateAll(): Promise<void> {
  const conn = await pool.getConnection();
  try {
    await conn.query("SET FOREIGN_KEY_CHECKS = 0");
    for (const t of [
      "attack_ops", "sorcery_ops", "rob_ops",
      "kingdom_news_sharded", "kingdom_news",
      "kingdom_provinces", "kingdom_intel",
      "intel_partitions", "key_kingdom_bindings",
      "sos_sciences", "sos_intel",
      "survey_buildings", "survey_intel",
      "som_armies", "military_intel",
      "province_effects", "province_status",
      "province_resources", "province_troops",
      "home_military_points", "total_military_points",
      "province_overview", "provinces",
    ]) {
      await conn.query(`TRUNCATE TABLE \`${t}\``);
    }
    await conn.query("SET FOREIGN_KEY_CHECKS = 1");
  } finally {
    conn.release();
  }
}

// ── ensureProvince ────────────────────────────────────────────────────────────

test("ensureProvince: creates a new province and returns its id", async () => {
  await truncateAll();
  const id = await withTransaction((conn) => ensureProvince(conn, "TestProv", "7:5"));
  assert.ok(typeof id === "number" && id > 0);
});

test("ensureProvince: returns the same id on repeated calls", async () => {
  await truncateAll();
  const id1 = await withTransaction((conn) => ensureProvince(conn, "TestProv", "7:5"));
  const id2 = await withTransaction((conn) => ensureProvince(conn, "TestProv", "7:5"));
  assert.equal(id1, id2);
});

test("ensureProvince: empty kingdom falls back to existing real-kingdom row", async () => {
  await truncateAll();
  const realId = await withTransaction((conn) => ensureProvince(conn, "TestProv", "7:5"));
  const selfId = await withTransaction((conn) => ensureProvince(conn, "TestProv", ""));
  assert.equal(selfId, realId);
});

test("ensureProvince: empty kingdom with no existing row creates ghost row", async () => {
  await truncateAll();
  const id = await withTransaction((conn) => ensureProvince(conn, "UnknownProv", ""));
  assert.ok(typeof id === "number" && id > 0);
});

// ── recordSubmission ──────────────────────────────────────────────────────────

test("recordSubmission: creates an intel_partition row", async () => {
  await truncateAll();
  interface CountRow extends RowDataPacket { n: number }
  const provId = await withTransaction((conn) => ensureProvince(conn, "TestProv", "7:5"));
  await withTransaction((conn) => recordSubmission(conn, "abc123", provId));
  const [[{ n }]] = await pool.query<CountRow[]>(
    "SELECT COUNT(*) AS n FROM intel_partitions WHERE key_hash = ? AND province_id = ?",
    ["abc123", provId],
  );
  assert.equal(n, 1);
});

test("recordSubmission: idempotent — inserting twice leaves one row", async () => {
  await truncateAll();
  interface CountRow extends RowDataPacket { n: number }
  const provId = await withTransaction((conn) => ensureProvince(conn, "TestProv", "7:5"));
  await withTransaction((conn) => recordSubmission(conn, "abc123", provId));
  await withTransaction((conn) => recordSubmission(conn, "abc123", provId));
  const [[{ n }]] = await pool.query<CountRow[]>(
    "SELECT COUNT(*) AS n FROM intel_partitions WHERE key_hash = ? AND province_id = ?",
    ["abc123", provId],
  );
  assert.equal(n, 1);
});

// ── bindKeyToKingdom ──────────────────────────────────────────────────────────

test("bindKeyToKingdom: creates a new binding", async () => {
  await truncateAll();
  interface KdRow extends RowDataPacket { kingdom: string }
  await withTransaction((conn) => bindKeyToKingdom(conn, "hash1", "7:5", "throne"));
  const [[row]] = await pool.query<KdRow[]>(
    "SELECT kingdom FROM key_kingdom_bindings WHERE key_hash = ?",
    ["hash1"],
  );
  assert.equal(row.kingdom, "7:5");
});

test("bindKeyToKingdom: idempotent — same kingdom twice leaves one row", async () => {
  await truncateAll();
  interface CountRow extends RowDataPacket { n: number }
  await withTransaction((conn) => bindKeyToKingdom(conn, "hash1", "7:5", "throne"));
  await withTransaction((conn) => bindKeyToKingdom(conn, "hash1", "7:5", "throne"));
  const [[{ n }]] = await pool.query<CountRow[]>(
    "SELECT COUNT(*) AS n FROM key_kingdom_bindings WHERE key_hash = ?",
    ["hash1"],
  );
  assert.equal(n, 1);
});

test("bindKeyToKingdom: mismatch — does not overwrite existing binding", async () => {
  await truncateAll();
  interface KdRow extends RowDataPacket { kingdom: string }
  await withTransaction((conn) => bindKeyToKingdom(conn, "hash1", "7:5", "throne"));
  // Different kingdom — should warn and leave original intact
  await withTransaction((conn) => bindKeyToKingdom(conn, "hash1", "8:6", "throne"));
  const [[row]] = await pool.query<KdRow[]>(
    "SELECT kingdom FROM key_kingdom_bindings WHERE key_hash = ?",
    ["hash1"],
  );
  assert.equal(row.kingdom, "7:5");
});

// ── storeSoD ──────────────────────────────────────────────────────────────────

test("storeSoD: inserts a home_military_points row with correct def value", async () => {
  await truncateAll();
  interface HmpRow extends RowDataPacket {
    mod_off_at_home: number | null;
    mod_def_at_home: number;
    source: string;
    accuracy: number;
  }

  await storeSoD({ name: "TestProv", kingdom: "7:5", defPoints: 12345, accuracy: 95 }, "scout1", "keyhash1");

  const [[row]] = await pool.query<HmpRow[]>(
    `SELECT mod_off_at_home, mod_def_at_home, source, accuracy
     FROM home_military_points WHERE key_hash = ?`,
    ["keyhash1"],
  );
  assert.equal(row.mod_off_at_home, null);
  assert.equal(row.mod_def_at_home, 12345);
  assert.equal(row.source, "sod");
  assert.equal(row.accuracy, 95);
});

test("storeSoD: idempotent — same-second duplicate is silently dropped", async () => {
  await truncateAll();
  interface CountRow extends RowDataPacket { n: number }

  await storeSoD({ name: "TestProv", kingdom: "7:5", defPoints: 100, accuracy: 100 }, "scout1", "keyhash1");
  await storeSoD({ name: "TestProv", kingdom: "7:5", defPoints: 100, accuracy: 100 }, "scout1", "keyhash1");

  const [[{ n }]] = await pool.query<CountRow[]>(
    "SELECT COUNT(*) AS n FROM home_military_points WHERE key_hash = ?",
    ["keyhash1"],
  );
  assert.ok(n >= 1);
});

// ── storeInfiltrate ───────────────────────────────────────────────────────────

test("storeInfiltrate: inserts a province_resources row with correct thieves value", async () => {
  await truncateAll();
  interface ResRow extends RowDataPacket { thieves: number; source: string; accuracy: number }

  await storeInfiltrate({ name: "TestProv", kingdom: "7:5", thieves: 4038, accuracy: 100 }, "spy1", "keyhash1");

  const [[row]] = await pool.query<ResRow[]>(
    "SELECT thieves, source, accuracy FROM province_resources WHERE key_hash = ?",
    ["keyhash1"],
  );
  assert.equal(row.thieves, 4038);
  assert.equal(row.source, "infiltrate");
  assert.equal(row.accuracy, 100);
});

// ── storeTrainArmy ────────────────────────────────────────────────────────────

test("storeTrainArmy: stores free_specialist_credits", async () => {
  await truncateAll();
  interface ResRow extends RowDataPacket { free_specialist_credits: number; source: string }

  await storeTrainArmy({ name: "TestProv", kingdom: "7:5", freeSpecialistCredits: 42 }, "player1", "keyhash1");

  const [[row]] = await pool.query<ResRow[]>(
    "SELECT free_specialist_credits, source FROM province_resources WHERE key_hash = ?",
    ["keyhash1"],
  );
  assert.equal(row.free_specialist_credits, 42);
  assert.equal(row.source, "train_army");
});

test("storeTrainArmy: respects explicit receivedAt", async () => {
  await truncateAll();
  interface ResRow extends RowDataPacket { received_at: string }

  await storeTrainArmy({ name: "TestProv", kingdom: "7:5", freeSpecialistCredits: 1 }, "p", "kh", "2025-01-15 10:00:00");

  const [[row]] = await pool.query<ResRow[]>(
    "SELECT received_at FROM province_resources WHERE key_hash = ?",
    ["kh"],
  );
  assert.equal(row.received_at, "2025-01-15 10:00:00");
});

// ── storeBuild ────────────────────────────────────────────────────────────────

test("storeBuild: stores free_building_credits", async () => {
  await truncateAll();
  interface ResRow extends RowDataPacket { free_building_credits: number; source: string }

  await storeBuild({ name: "TestProv", kingdom: "7:5", freeBuildingCredits: 7 }, "player1", "keyhash1");

  const [[row]] = await pool.query<ResRow[]>(
    "SELECT free_building_credits, source FROM province_resources WHERE key_hash = ?",
    ["keyhash1"],
  );
  assert.equal(row.free_building_credits, 7);
  assert.equal(row.source, "build");
});
