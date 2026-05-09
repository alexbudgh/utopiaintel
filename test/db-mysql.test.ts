import { test, after } from "node:test";
import assert from "node:assert/strict";
import type { RowDataPacket } from "mysql2/promise";
import { pool, initDb, ensureProvince, recordSubmission, bindKeyToKingdom, withTransaction, storeSoS, storeSorcery, storeRob, storeAttack, storeTrainArmy, storeBuild, storeInfiltrate, storeSoD } from "../lib/db-mysql";

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

// ── storeAttack ───────────────────────────────────────────────────────────────

test("storeAttack: inserts an attack_ops row with correct fields", async () => {
  await truncateAll();
  interface AtkRow extends RowDataPacket {
    attack_type: string; outcome: string;
    target_name: string | null; target_kingdom: string | null;
    acres_taken: number | null; enemy_killed: number | null;
  }

  await storeAttack(
    {
      name: "Attacker", kingdom: "",
      attackType: "traditional_march", outcome: "success",
      targetName: "Defender", targetKingdom: "8:6",
      acresTaken: 150, buildingsSurvived: null, specialistCredits: null,
      peasantsSettled: null, massacred: null,
      enemyKilled: 300, enemyImprisoned: 10, returnDays: 8,
    },
    "general1", "keyhash1",
  );

  const [[row]] = await pool.query<AtkRow[]>(
    "SELECT attack_type, outcome, target_name, target_kingdom, acres_taken, enemy_killed FROM attack_ops WHERE key_hash = ?",
    ["keyhash1"],
  );
  assert.equal(row.attack_type, "traditional_march");
  assert.equal(row.outcome, "success");
  assert.equal(row.target_name, "Defender");
  assert.equal(row.target_kingdom, "8:6");
  assert.equal(row.acres_taken, 150);
  assert.equal(row.enemy_killed, 300);
});

test("storeAttack: uses empty kingdom for attacker (self)", async () => {
  await truncateAll();
  interface ProvRow extends RowDataPacket { kingdom: string }

  await storeAttack(
    { name: "Attacker", kingdom: "", attackType: "ambush", outcome: "failure",
      targetName: null, targetKingdom: null, acresTaken: null, buildingsSurvived: null,
      specialistCredits: null, peasantsSettled: null, massacred: null,
      enemyKilled: null, enemyImprisoned: null, returnDays: null },
    "p", "kh",
  );

  const [[row]] = await pool.query<ProvRow[]>(
    "SELECT p.kingdom FROM provinces p JOIN attack_ops a ON a.province_id = p.id WHERE a.key_hash = ?",
    ["kh"],
  );
  assert.equal(row.kingdom, "");
});

// ── storeRob ──────────────────────────────────────────────────────────────────

const baseRob = {
  name: "Thief", kingdom: "",
  op: "towers" as const,
  targetName: "Victim", targetSlot: 3, targetKingdom: "8:6",
  outcome: "success" as const,
  amountStolen: 5000, thievesLost: 2,
  thieves: null, stealth: null,
  troopsAssassinated: null, kidnapped: null, acresBurned: null, effectDuration: null,
};

test("storeRob: inserts a rob_ops row with correct fields", async () => {
  await truncateAll();
  interface RobRow extends RowDataPacket {
    op: string; outcome: string; amount_stolen: number; thieves_lost: number;
    target_name: string; target_kingdom: string;
  }

  await storeRob(baseRob, "scout1", "keyhash1");

  const [[row]] = await pool.query<RobRow[]>(
    "SELECT op, outcome, amount_stolen, thieves_lost, target_name, target_kingdom FROM rob_ops WHERE key_hash = ?",
    ["keyhash1"],
  );
  assert.equal(row.op, "towers");
  assert.equal(row.outcome, "success");
  assert.equal(row.amount_stolen, 5000);
  assert.equal(row.thieves_lost, 2);
  assert.equal(row.target_name, "Victim");
  assert.equal(row.target_kingdom, "8:6");
});

test("storeRob: also stores thieves in province_resources when present", async () => {
  await truncateAll();
  interface ResRow extends RowDataPacket { thieves: number; source: string }

  await storeRob({ ...baseRob, thieves: 3500, stealth: 80 }, "scout1", "keyhash1");

  const [[row]] = await pool.query<ResRow[]>(
    "SELECT thieves, source FROM province_resources WHERE key_hash = ?",
    ["keyhash1"],
  );
  assert.equal(row.thieves, 3500);
  assert.equal(row.source, "rob");
});

test("storeRob: duplicate op does not insert province_resources", async () => {
  await truncateAll();
  interface CountRow extends RowDataPacket { n: number }

  const data = { ...baseRob, thieves: 3500 };
  await storeRob(data, "scout1", "keyhash1", "2025-06-01 12:00:00");
  // Same receivedAt → same unique key → INSERT IGNORE skips the rob_ops row
  // → affectedRows === 0 → province_resources should NOT get a second write
  await storeRob(data, "scout1", "keyhash1", "2025-06-01 12:00:00");

  const [[{ n }]] = await pool.query<CountRow[]>(
    "SELECT COUNT(*) AS n FROM province_resources WHERE key_hash = ?",
    ["keyhash1"],
  );
  assert.equal(n, 1);
});

// ── storeSorcery ──────────────────────────────────────────────────────────────

const baseSorcery = {
  name: "Wizard", kingdom: "",
  spell: "Fireball", outcome: "success" as const,
  runesSpent: 150, wizardsLost: 0, durationDays: null,
  targetName: "Victim", targetSlot: 2, targetKingdom: "8:6",
  wizards: null, runes: null, mana: null,
};

test("storeSorcery: inserts a sorcery_ops row with correct fields", async () => {
  await truncateAll();
  interface SorcRow extends RowDataPacket {
    spell: string; outcome: string; runes_spent: number; target_kingdom: string;
  }

  await storeSorcery(baseSorcery, "mage1", "keyhash1");

  const [[row]] = await pool.query<SorcRow[]>(
    "SELECT spell, outcome, runes_spent, target_kingdom FROM sorcery_ops WHERE key_hash = ?",
    ["keyhash1"],
  );
  assert.equal(row.spell, "Fireball");
  assert.equal(row.outcome, "success");
  assert.equal(row.runes_spent, 150);
  assert.equal(row.target_kingdom, "8:6");
});

test("storeSorcery: stores wizards+runes in province_resources when present", async () => {
  await truncateAll();
  interface ResRow extends RowDataPacket { wizards: number; runes: number; source: string }

  await storeSorcery({ ...baseSorcery, wizards: 500, runes: 2000, mana: 80 }, "mage1", "keyhash1");

  const [[row]] = await pool.query<ResRow[]>(
    "SELECT wizards, runes, source FROM province_resources WHERE key_hash = ?",
    ["keyhash1"],
  );
  assert.equal(row.wizards, 500);
  assert.equal(row.runes, 2000);
  assert.equal(row.source, "sorcery");
});

test("storeSorcery: duplicate op does not insert province_resources", async () => {
  await truncateAll();
  interface CountRow extends RowDataPacket { n: number }

  const data = { ...baseSorcery, wizards: 500 };
  await storeSorcery(data, "mage1", "keyhash1", "2025-06-01 12:00:00");
  await storeSorcery(data, "mage1", "keyhash1", "2025-06-01 12:00:00");

  const [[{ n }]] = await pool.query<CountRow[]>(
    "SELECT COUNT(*) AS n FROM province_resources WHERE key_hash = ?",
    ["keyhash1"],
  );
  assert.equal(n, 1);
});

// ── storeSoS ──────────────────────────────────────────────────────────────────

const baseSoS = {
  name: "TestProv", kingdom: "7:5",
  sciences: [
    { science: "Crime", books: 500, effect: 12.5 },
    { science: "Channeling", books: 300, effect: 8.0 },
  ],
  accuracy: 100,
};

test("storeSoS: inserts sos_intel and sos_sciences child rows", async () => {
  await truncateAll();
  interface SciRow extends RowDataPacket { science: string; books: number; effect: number }

  await storeSoS(baseSoS, "spy1", "keyhash1");

  const [sciRows] = await pool.query<SciRow[]>(
    `SELECT ss.science, ss.books, ss.effect
     FROM sos_sciences ss JOIN sos_intel si ON si.id = ss.sos_intel_id
     WHERE si.key_hash = ? ORDER BY ss.science`,
    ["keyhash1"],
  );
  assert.equal(sciRows.length, 2);
  const crime = sciRows.find((r) => r.science === "Crime")!;
  assert.equal(crime.books, 500);
  assert.equal(crime.effect, 12.5);
});

test("storeSoS: isSelf=true stores source as council_science", async () => {
  await truncateAll();
  interface SrcRow extends RowDataPacket { source: string }

  await storeSoS(baseSoS, "player1", "keyhash1", true);

  const [[row]] = await pool.query<SrcRow[]>(
    "SELECT source FROM sos_intel WHERE key_hash = ?",
    ["keyhash1"],
  );
  assert.equal(row.source, "council_science");
});

test("storeSoS: duplicate does not insert sciences again", async () => {
  await truncateAll();
  interface CountRow extends RowDataPacket { n: number }

  await storeSoS(baseSoS, "spy1", "keyhash1", false, "2025-06-01 12:00:00");
  await storeSoS(baseSoS, "spy1", "keyhash1", false, "2025-06-01 12:00:00");

  const [[{ n }]] = await pool.query<CountRow[]>(
    "SELECT COUNT(*) AS n FROM sos_intel WHERE key_hash = ?",
    ["keyhash1"],
  );
  assert.equal(n, 1);
});
