import { test, after } from "node:test";
import assert from "node:assert/strict";
import { pool, initDb } from "../lib/db-mysql";

after(async () => {
  await pool.end();
});

test("initDb: creates all expected tables", async () => {
  await initDb();

  const [rows] = await pool.query<{ TABLE_NAME: string }[]>(
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
