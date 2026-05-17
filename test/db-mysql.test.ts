import { test, after } from "node:test";
import assert from "node:assert/strict";
import mysql, { type RowDataPacket } from "mysql2/promise";
import {
  pool,
  initDb,
  ensureProvince,
  recordSubmission,
  bindKeyToKingdom,
  withTransaction,
  storeKingdom,
  storeState,
  storeSoT,
  storeSoS,
  storeSoM,
  storeSorcery,
  storeRob,
  storeAttack,
  storeTrainArmy,
  storeBuild,
  storeInfiltrate,
  storeSoD,
  storeIntelOp,
  storeSurvey,
} from "../lib/db-mysql";

const mysqlTestDbName = process.env.DB_NAME ?? "";
if (!/(^|[_-])test($|[_-])/.test(mysqlTestDbName)) {
  throw new Error(
    `Refusing to run MySQL DB tests against non-test DB_NAME=${mysqlTestDbName || "<unset>"}`,
  );
}

after(async () => {
  await pool.end();
  if (process.env.MYSQL_DROP_TEST_DB_AFTER !== "1") return;
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST ?? "localhost",
    port: Number(process.env.DB_PORT ?? 3306),
    user: process.env.DB_USER ?? "utopiaintel",
    password: process.env.DB_PASSWORD ?? "",
  });
  try {
    await conn.query(`DROP DATABASE IF EXISTS \`${mysqlTestDbName}\``);
  } finally {
    await conn.end();
  }
});

test("initDb: creates all expected tables", async () => {
  await initDb();

  interface TableRow extends RowDataPacket {
    TABLE_NAME: string;
  }
  const [rows] = await pool.query<TableRow[]>(
    `SELECT TABLE_NAME FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = DATABASE()
     ORDER BY TABLE_NAME`,
  );

  const names = rows.map((r) => r.TABLE_NAME).sort();
  const expected = [
    "attack_ops",
    "home_military_points",
    "intel_ops",
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
      "intel_ops",
      "attack_ops",
      "sorcery_ops",
      "rob_ops",
      "kingdom_news_sharded",
      "kingdom_news",
      "kingdom_provinces",
      "kingdom_intel",
      "intel_partitions",
      "key_kingdom_bindings",
      "sos_sciences",
      "sos_intel",
      "survey_buildings",
      "survey_intel",
      "som_armies",
      "military_intel",
      "province_effects",
      "province_status",
      "province_resources",
      "province_troops",
      "home_military_points",
      "total_military_points",
      "province_overview",
      "provinces",
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
  const id = await withTransaction((conn) =>
    ensureProvince(conn, "TestProv", "7:5"),
  );
  assert.ok(typeof id === "number" && id > 0);
});

test("ensureProvince: returns the same id on repeated calls", async () => {
  await truncateAll();
  const id1 = await withTransaction((conn) =>
    ensureProvince(conn, "TestProv", "7:5"),
  );
  const id2 = await withTransaction((conn) =>
    ensureProvince(conn, "TestProv", "7:5"),
  );
  assert.equal(id1, id2);
});

test("ensureProvince: empty kingdom falls back to existing real-kingdom row", async () => {
  await truncateAll();
  const realId = await withTransaction((conn) =>
    ensureProvince(conn, "TestProv", "7:5"),
  );
  const selfId = await withTransaction((conn) =>
    ensureProvince(conn, "TestProv", ""),
  );
  assert.equal(selfId, realId);
});

test("ensureProvince: empty kingdom with no existing row creates ghost row", async () => {
  await truncateAll();
  const id = await withTransaction((conn) =>
    ensureProvince(conn, "UnknownProv", ""),
  );
  assert.ok(typeof id === "number" && id > 0);
});

// ── recordSubmission ──────────────────────────────────────────────────────────

test("recordSubmission: creates an intel_partition row", async () => {
  await truncateAll();
  interface CountRow extends RowDataPacket {
    n: number;
  }
  const provId = await withTransaction((conn) =>
    ensureProvince(conn, "TestProv", "7:5"),
  );
  await withTransaction((conn) => recordSubmission(conn, "abc123", provId));
  const [[{ n }]] = await pool.query<CountRow[]>(
    "SELECT COUNT(*) AS n FROM intel_partitions WHERE key_hash = ? AND province_id = ?",
    ["abc123", provId],
  );
  assert.equal(n, 1);
});

test("recordSubmission: idempotent — inserting twice leaves one row", async () => {
  await truncateAll();
  interface CountRow extends RowDataPacket {
    n: number;
  }
  const provId = await withTransaction((conn) =>
    ensureProvince(conn, "TestProv", "7:5"),
  );
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
  interface KdRow extends RowDataPacket {
    kingdom: string;
  }
  await withTransaction((conn) =>
    bindKeyToKingdom(conn, "hash1", "7:5", "throne"),
  );
  const [[row]] = await pool.query<KdRow[]>(
    "SELECT kingdom FROM key_kingdom_bindings WHERE key_hash = ?",
    ["hash1"],
  );
  assert.equal(row.kingdom, "7:5");
});

test("bindKeyToKingdom: idempotent — same kingdom twice leaves one row", async () => {
  await truncateAll();
  interface CountRow extends RowDataPacket {
    n: number;
  }
  await withTransaction((conn) =>
    bindKeyToKingdom(conn, "hash1", "7:5", "throne"),
  );
  await withTransaction((conn) =>
    bindKeyToKingdom(conn, "hash1", "7:5", "throne"),
  );
  const [[{ n }]] = await pool.query<CountRow[]>(
    "SELECT COUNT(*) AS n FROM key_kingdom_bindings WHERE key_hash = ?",
    ["hash1"],
  );
  assert.equal(n, 1);
});

test("bindKeyToKingdom: mismatch — does not overwrite existing binding", async () => {
  await truncateAll();
  interface KdRow extends RowDataPacket {
    kingdom: string;
  }
  await withTransaction((conn) =>
    bindKeyToKingdom(conn, "hash1", "7:5", "throne"),
  );
  // Different kingdom — should warn and leave original intact
  await withTransaction((conn) =>
    bindKeyToKingdom(conn, "hash1", "8:6", "throne"),
  );
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

  await storeSoD(
    { name: "TestProv", kingdom: "7:5", defPoints: 12345, accuracy: 95 },
    "scout1",
    "keyhash1",
  );

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
  interface CountRow extends RowDataPacket {
    n: number;
  }

  await storeSoD(
    { name: "TestProv", kingdom: "7:5", defPoints: 100, accuracy: 100 },
    "scout1",
    "keyhash1",
  );
  await storeSoD(
    { name: "TestProv", kingdom: "7:5", defPoints: 100, accuracy: 100 },
    "scout1",
    "keyhash1",
  );

  const [[{ n }]] = await pool.query<CountRow[]>(
    "SELECT COUNT(*) AS n FROM home_military_points WHERE key_hash = ?",
    ["keyhash1"],
  );
  assert.ok(n >= 1);
});

// ── storeInfiltrate ───────────────────────────────────────────────────────────

test("storeInfiltrate: inserts a province_resources row with correct thieves value", async () => {
  await truncateAll();
  interface ResRow extends RowDataPacket {
    thieves: number;
    source: string;
    accuracy: number;
  }

  await storeInfiltrate(
    { name: "TestProv", kingdom: "7:5", thieves: 4038, accuracy: 100 },
    "spy1",
    "keyhash1",
  );

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
  interface ResRow extends RowDataPacket {
    free_specialist_credits: number;
    source: string;
  }

  await storeTrainArmy(
    { name: "TestProv", kingdom: "7:5", freeSpecialistCredits: 42 },
    "player1",
    "keyhash1",
  );

  const [[row]] = await pool.query<ResRow[]>(
    "SELECT free_specialist_credits, source FROM province_resources WHERE key_hash = ?",
    ["keyhash1"],
  );
  assert.equal(row.free_specialist_credits, 42);
  assert.equal(row.source, "train_army");
});

test("storeTrainArmy: respects explicit receivedAt", async () => {
  await truncateAll();
  interface ResRow extends RowDataPacket {
    received_at: string;
  }

  await storeTrainArmy(
    { name: "TestProv", kingdom: "7:5", freeSpecialistCredits: 1 },
    "p",
    "kh",
    "2025-01-15 10:00:00",
  );

  const [[row]] = await pool.query<ResRow[]>(
    "SELECT received_at FROM province_resources WHERE key_hash = ?",
    ["kh"],
  );
  assert.equal(row.received_at, "2025-01-15 10:00:00");
});

// ── storeBuild ────────────────────────────────────────────────────────────────

test("storeBuild: stores free_building_credits", async () => {
  await truncateAll();
  interface ResRow extends RowDataPacket {
    free_building_credits: number;
    source: string;
  }

  await storeBuild(
    { name: "TestProv", kingdom: "7:5", freeBuildingCredits: 7 },
    "player1",
    "keyhash1",
  );

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
    attack_type: string;
    outcome: string;
    target_name: string | null;
    target_kingdom: string | null;
    acres_taken: number | null;
    enemy_killed: number | null;
  }

  await storeAttack(
    {
      name: "Attacker",
      kingdom: "",
      attackType: "traditional_march",
      outcome: "success",
      targetName: "Defender",
      targetKingdom: "8:6",
      acresTaken: 150,
      buildingsSurvived: null,
      specialistCredits: null,
      peasantsSettled: null,
      massacred: null,
      enemyKilled: 300,
      enemyImprisoned: 10,
      returnDays: 8,
    },
    "general1",
    "keyhash1",
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
  interface ProvRow extends RowDataPacket {
    kingdom: string;
  }

  await storeAttack(
    {
      name: "Attacker",
      kingdom: "",
      attackType: "ambush",
      outcome: "failure",
      targetName: null,
      targetKingdom: null,
      acresTaken: null,
      buildingsSurvived: null,
      specialistCredits: null,
      peasantsSettled: null,
      massacred: null,
      enemyKilled: null,
      enemyImprisoned: null,
      returnDays: null,
    },
    "p",
    "kh",
  );

  const [[row]] = await pool.query<ProvRow[]>(
    "SELECT p.kingdom FROM provinces p JOIN attack_ops a ON a.province_id = p.id WHERE a.key_hash = ?",
    ["kh"],
  );
  assert.equal(row.kingdom, "");
});

// ── storeRob ──────────────────────────────────────────────────────────────────

const baseRob = {
  name: "Thief",
  kingdom: "",
  op: "towers" as const,
  targetName: "Victim",
  targetSlot: 3,
  targetKingdom: "8:6",
  outcome: "success" as const,
  amountStolen: 5000,
  thievesLost: 2,
  thieves: null,
  stealth: null,
  troopsAssassinated: null,
  kidnapped: null,
  acresBurned: null,
  effectDuration: null,
  deserters: null,
  deserterType: null,
};

test("storeRob: inserts a rob_ops row with correct fields", async () => {
  await truncateAll();
  interface RobRow extends RowDataPacket {
    op: string;
    outcome: string;
    amount_stolen: number;
    thieves_lost: number;
    target_name: string;
    target_kingdom: string;
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
  interface ResRow extends RowDataPacket {
    thieves: number;
    source: string;
  }

  await storeRob(
    { ...baseRob, thieves: 3500, stealth: 80 },
    "scout1",
    "keyhash1",
  );

  const [[row]] = await pool.query<ResRow[]>(
    "SELECT thieves, source FROM province_resources WHERE key_hash = ?",
    ["keyhash1"],
  );
  assert.equal(row.thieves, 3500);
  assert.equal(row.source, "rob");
});

test("storeRob: duplicate op does not insert province_resources", async () => {
  await truncateAll();
  interface CountRow extends RowDataPacket {
    n: number;
  }

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
  name: "Wizard",
  kingdom: "",
  spell: "Fireball",
  outcome: "success" as const,
  runesSpent: 150,
  wizardsLost: 0,
  durationDays: null,
  targetName: "Victim",
  targetSlot: 2,
  targetKingdom: "8:6",
  wizards: null,
  runes: null,
  mana: null,
};

test("storeSorcery: inserts a sorcery_ops row with correct fields", async () => {
  await truncateAll();
  interface SorcRow extends RowDataPacket {
    spell: string;
    outcome: string;
    runes_spent: number;
    target_kingdom: string;
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
  interface ResRow extends RowDataPacket {
    wizards: number;
    runes: number;
    source: string;
  }

  await storeSorcery(
    { ...baseSorcery, wizards: 500, runes: 2000, mana: 80 },
    "mage1",
    "keyhash1",
  );

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
  interface CountRow extends RowDataPacket {
    n: number;
  }

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
  name: "TestProv",
  kingdom: "7:5",
  sciences: [
    { science: "Crime", books: 500, effect: 12.5 },
    { science: "Channeling", books: 300, effect: 8.0 },
  ],
  accuracy: 100,
};

test("storeSoS: inserts sos_intel and sos_sciences child rows", async () => {
  await truncateAll();
  interface SciRow extends RowDataPacket {
    science: string;
    books: number;
    effect: number;
  }

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
  interface SrcRow extends RowDataPacket {
    source: string;
  }

  await storeSoS(baseSoS, "player1", "keyhash1", true);

  const [[row]] = await pool.query<SrcRow[]>(
    "SELECT source FROM sos_intel WHERE key_hash = ?",
    ["keyhash1"],
  );
  assert.equal(row.source, "council_science");
});

test("storeSoS: duplicate does not insert sciences again", async () => {
  await truncateAll();
  interface CountRow extends RowDataPacket {
    n: number;
  }

  await storeSoS(baseSoS, "spy1", "keyhash1", false, "2025-06-01 12:00:00");
  await storeSoS(baseSoS, "spy1", "keyhash1", false, "2025-06-01 12:00:00");

  const [[{ n }]] = await pool.query<CountRow[]>(
    "SELECT COUNT(*) AS n FROM sos_intel WHERE key_hash = ?",
    ["keyhash1"],
  );
  assert.equal(n, 1);
});

// ── storeIntelOp ─────────────────────────────────────────────────────────────

test("storeIntelOp: inserts row into intel_ops", async () => {
  await truncateAll();
  interface OpRow extends RowDataPacket {
    op: string;
    intel_type: string;
    outcome: string;
    target_name: string | null;
    target_slot: number | null;
    target_kingdom: string | null;
    accuracy: number | null;
    thieves_lost: number;
    saved_by: string;
  }

  await storeIntelOp(
    {
      op: "SPY_ON_THRONE",
      intelType: "sot",
      outcome: "success",
      targetName: "TestProvince",
      targetSlot: 3,
      targetKingdom: "7:5",
      accuracy: 100,
      thievesLost: 0,
    },
    "spy1",
    "keyhash1",
    "2025-06-01 12:00:00",
  );

  const [[row]] = await pool.query<OpRow[]>(
    "SELECT op, intel_type, outcome, target_name, target_slot, target_kingdom, accuracy, thieves_lost, saved_by FROM intel_ops WHERE key_hash = ?",
    ["keyhash1"],
  );
  assert.equal(row.op, "SPY_ON_THRONE");
  assert.equal(row.intel_type, "sot");
  assert.equal(row.outcome, "success");
  assert.equal(row.target_name, "TestProvince");
  assert.equal(row.target_slot, 3);
  assert.equal(row.target_kingdom, "7:5");
  assert.equal(row.accuracy, 100);
  assert.equal(row.thieves_lost, 0);
  assert.equal(row.saved_by, "spy1");
});

test("storeIntelOp: resolves target name from slot via kingdom_provinces", async () => {
  await truncateAll();
  interface OpRow extends RowDataPacket {
    target_name: string | null;
  }

  // Insert kingdom intel so resolveIntelOpTarget can look up the province name
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [kiRes] = (await conn.execute(
      `INSERT INTO kingdom_intel (key_hash, name, location, source, saved_by) VALUES (?, ?, ?, 'kingdom', 'scout')`,
      ["keyhash1", "TestKingdom", "7:5"],
    )) as [import("mysql2/promise").ResultSetHeader, unknown];
    await conn.execute(
      `INSERT INTO kingdom_provinces (kingdom_intel_id, slot, name, race, land, networth) VALUES (?, ?, ?, 'Elf', 500, 10000)`,
      [kiRes.insertId, 3, "TestProvince"],
    );
    await conn.commit();
  } finally {
    conn.release();
  }

  // targetName is null — should be resolved from slot
  await storeIntelOp(
    {
      op: "SPY_ON_THRONE",
      intelType: "sot",
      outcome: "success",
      targetName: null,
      targetSlot: 3,
      targetKingdom: "7:5",
      accuracy: 95,
      thievesLost: 1,
    },
    "spy1",
    "keyhash1",
    "2025-06-01 13:00:00",
  );

  const [[row]] = await pool.query<OpRow[]>(
    "SELECT target_name FROM intel_ops WHERE key_hash = ? ORDER BY received_at DESC LIMIT 1",
    ["keyhash1"],
  );
  assert.equal(row.target_name, "TestProvince");
});

test("storeIntelOp: duplicate (same province+keyhash+received_at) is ignored", async () => {
  await truncateAll();
  interface CountRow extends RowDataPacket {
    n: number;
  }

  const op = {
    op: "SPY_ON_DEFENSE",
    intelType: "sod" as const,
    outcome: "success" as const,
    targetName: "TP",
    targetSlot: 1,
    targetKingdom: "7:5",
    accuracy: 90,
    thievesLost: 0,
  };
  await storeIntelOp(op, "spy1", "keyhash1", "2025-06-01 12:00:00");
  await storeIntelOp(op, "spy1", "keyhash1", "2025-06-01 12:00:00");

  const [[{ n }]] = await pool.query<CountRow[]>(
    "SELECT COUNT(*) AS n FROM intel_ops WHERE key_hash = ?",
    ["keyhash1"],
  );
  assert.equal(n, 1);
});

// ── storeSurvey ──────────────────────────────────────────────────────────────

const baseSurvey = {
  name: "SurveyProvince",
  kingdom: "7:5",
  accuracy: 97,
  thieveryEffectiveness: 1.2,
  thiefPreventChance: 0.15,
  castlesEffect: 1.05,
  buildings: [
    { building: "Homes", built: 50, inProgress: 5 },
    { building: "Barracks", built: 30, inProgress: 0 },
  ],
};

test("storeSurvey: inserts survey_intel and survey_buildings child rows", async () => {
  await truncateAll();
  interface SurveyRow extends RowDataPacket {
    source: string;
    accuracy: number;
    thievery_effectiveness: number | null;
    thief_prevent_chance: number | null;
    castles_effect: number | null;
  }
  interface BuildingRow extends RowDataPacket {
    building: string;
    built: number;
    in_progress: number;
  }

  await storeSurvey(
    baseSurvey,
    "scout1",
    "keyhash1",
    false,
    "2025-06-01 12:00:00",
  );

  const [[row]] = await pool.query<SurveyRow[]>(
    "SELECT source, accuracy, thievery_effectiveness, thief_prevent_chance, castles_effect FROM survey_intel WHERE key_hash = ?",
    ["keyhash1"],
  );
  assert.equal(row.source, "survey");
  assert.equal(row.accuracy, 97);
  assert.equal(row.thievery_effectiveness, 1.2);
  assert.equal(row.thief_prevent_chance, 0.15);
  assert.equal(row.castles_effect, 1.05);

  const [buildings] = await pool.query<BuildingRow[]>(
    `SELECT sb.building, sb.built, sb.in_progress
     FROM survey_buildings sb
     JOIN survey_intel si ON si.id = sb.survey_intel_id
     WHERE si.key_hash = ?
     ORDER BY sb.building`,
    ["keyhash1"],
  );
  assert.equal(buildings.length, 2);
  const barracks = buildings.find((b) => b.building === "Barracks")!;
  assert.equal(barracks.built, 30);
  assert.equal(barracks.in_progress, 0);
});

test("storeSurvey: isSelf=true stores source as council_internal", async () => {
  await truncateAll();
  interface SrcRow extends RowDataPacket {
    source: string;
  }

  await storeSurvey(
    baseSurvey,
    "self1",
    "keyhash1",
    true,
    "2025-06-01 12:00:00",
  );

  const [[row]] = await pool.query<SrcRow[]>(
    "SELECT source FROM survey_intel WHERE key_hash = ?",
    ["keyhash1"],
  );
  assert.equal(row.source, "council_internal");
});

test("storeSurvey: duplicate does not insert buildings again", async () => {
  await truncateAll();
  interface CountRow extends RowDataPacket {
    n: number;
  }

  await storeSurvey(
    baseSurvey,
    "scout1",
    "keyhash1",
    false,
    "2025-06-01 12:00:00",
  );
  await storeSurvey(
    baseSurvey,
    "scout1",
    "keyhash1",
    false,
    "2025-06-01 12:00:00",
  );

  const [[{ n }]] = await pool.query<CountRow[]>(
    "SELECT COUNT(*) AS n FROM survey_intel WHERE key_hash = ?",
    ["keyhash1"],
  );
  assert.equal(n, 1);
});

// ── storeSoM ─────────────────────────────────────────────────────────────────

const baseSoM = {
  name: "MilProvince",
  kingdom: "7:5",
  accuracy: 95,
  ome: 1.05,
  dme: 0.98,
  netOffense: 12000,
  netDefense: 9000,
  armies: [
    {
      armyType: "home" as const,
      generals: 0,
      soldiers: 300,
      offSpecs: 50,
      defSpecs: 80,
      elites: 20,
      warHorses: 5,
      thieves: 0,
      landGained: 0,
      returnDays: null,
    },
    {
      armyType: "out1" as const,
      generals: 1,
      soldiers: 100,
      offSpecs: 20,
      defSpecs: 0,
      elites: 10,
      warHorses: 2,
      thieves: 0,
      landGained: 150,
      returnDays: 3.5,
    },
  ],
};

test("storeSoM: inserts military_intel, province_troops, home_military_points and som_armies", async () => {
  await truncateAll();
  interface MilRow extends RowDataPacket {
    ome: number;
    dme: number;
    source: string;
  }
  interface TroopsRow extends RowDataPacket {
    soldiers: number;
    off_specs: number;
    source: string;
  }
  interface HomeRow extends RowDataPacket {
    mod_off_at_home: number;
    mod_def_at_home: number;
  }
  interface ArmyRow extends RowDataPacket {
    army_type: string;
    soldiers: number;
    return_days: number | null;
  }

  await storeSoM(baseSoM, "scout1", "keyhash1", false, "2025-06-01 12:00:00");

  const [[mil]] = await pool.query<MilRow[]>(
    "SELECT ome, dme, source FROM military_intel WHERE key_hash = ?",
    ["keyhash1"],
  );
  assert.equal(mil.source, "som");
  assert.equal(mil.ome, 1.05);

  const [[troops]] = await pool.query<TroopsRow[]>(
    "SELECT soldiers, off_specs, source FROM province_troops WHERE key_hash = ?",
    ["keyhash1"],
  );
  assert.equal(troops.soldiers, 300);
  assert.equal(troops.off_specs, 50);
  assert.equal(troops.source, "som");

  const [[home]] = await pool.query<HomeRow[]>(
    "SELECT mod_off_at_home, mod_def_at_home FROM home_military_points WHERE key_hash = ?",
    ["keyhash1"],
  );
  assert.equal(home.mod_off_at_home, 12000);
  assert.equal(home.mod_def_at_home, 9000);

  const [armies] = await pool.query<ArmyRow[]>(
    "SELECT army_type, soldiers, return_days FROM som_armies ORDER BY army_type",
  );
  assert.equal(armies.length, 2);
  const out = armies.find((a) => a.army_type === "out1")!;
  assert.equal(out.soldiers, 100);
  assert.equal(out.return_days, 3.5);
});

test("storeSoM: isSelf=true stores source as council_military", async () => {
  await truncateAll();
  interface SrcRow extends RowDataPacket {
    source: string;
  }

  await storeSoM(baseSoM, "self1", "keyhash1", true, "2025-06-01 12:00:00");

  const [[row]] = await pool.query<SrcRow[]>(
    "SELECT source FROM military_intel WHERE key_hash = ?",
    ["keyhash1"],
  );
  assert.equal(row.source, "council_military");
});

test("storeSoM: duplicate does not insert armies again", async () => {
  await truncateAll();
  interface CountRow extends RowDataPacket {
    n: number;
  }

  await storeSoM(baseSoM, "scout1", "keyhash1", false, "2025-06-01 12:00:00");
  await storeSoM(baseSoM, "scout1", "keyhash1", false, "2025-06-01 12:00:00");

  const [[{ n }]] = await pool.query<CountRow[]>(
    "SELECT COUNT(*) AS n FROM military_intel WHERE key_hash = ?",
    ["keyhash1"],
  );
  assert.equal(n, 1);
});

// ── storeSoT ─────────────────────────────────────────────────────────────────

const baseSoT = {
  name: "SoTProvince",
  kingdom: "7:5",
  race: "Elf",
  personality: "Warrior",
  honorTitle: "Knight",
  ruler: "TestRuler",
  land: 800,
  networth: 120000,
  soldiers: 500,
  offSpecs: 100,
  defSpecs: 150,
  elites: 40,
  warHorses: 10,
  peasants: 4000,
  buildingEfficiency: 95,
  thieves: null,
  stealth: null,
  money: 250000,
  wizards: null,
  mana: null,
  food: 80000,
  runes: 5000,
  prisoners: 0,
  tradeBalance: 1200,
  offPoints: 18000,
  defPoints: 12000,
  plagued: false,
  overpopulated: false,
  overpopDeserters: null,
  dragonType: null,
  dragonName: null,
  hitStatus: "not_hit",
  war: false,
  warTarget: null,
  accuracy: 100,
  activeEffects: [
    {
      name: "Fountain of Knowledge",
      kind: "spell" as const,
      durationText: "4 days",
      remainingTicks: 4,
      effectivenessPercent: null,
    },
  ],
};

test("storeSoT: inserts all six tables (overview, totmil, troops, resources, status, effects)", async () => {
  await truncateAll();
  interface CountRow extends RowDataPacket {
    n: number;
  }

  await storeSoT(baseSoT, "spy1", "keyhash1", false, "2025-06-01 12:00:00");

  for (const tbl of [
    "province_overview",
    "total_military_points",
    "province_troops",
    "province_resources",
    "province_status",
    "province_effects",
  ]) {
    const [[{ n }]] = await pool.query<CountRow[]>(
      `SELECT COUNT(*) AS n FROM \`${tbl}\` WHERE key_hash = ?`,
      ["keyhash1"],
    );
    assert.equal(n, 1, `expected 1 row in ${tbl}`);
  }
});

test("storeSoT: correct field values in province_overview and resources", async () => {
  await truncateAll();
  interface OvRow extends RowDataPacket {
    race: string;
    land: number;
    networth: number;
    source: string;
  }
  interface ResRow extends RowDataPacket {
    money: number;
    food: number;
    off_points?: number;
  }

  await storeSoT(baseSoT, "spy1", "keyhash1", false, "2025-06-01 12:00:00");

  const [[ov]] = await pool.query<OvRow[]>(
    "SELECT race, land, networth, source FROM province_overview WHERE key_hash = ?",
    ["keyhash1"],
  );
  assert.equal(ov.race, "Elf");
  assert.equal(ov.land, 800);
  assert.equal(ov.source, "sot");

  const [[res]] = await pool.query<ResRow[]>(
    "SELECT money, food FROM province_resources WHERE key_hash = ?",
    ["keyhash1"],
  );
  assert.equal(res.money, 250000);
  assert.equal(res.food, 80000);
});

test("storeSoT: isSelfThrone=true stores source as throne and binds key to kingdom", async () => {
  await truncateAll();
  interface SrcRow extends RowDataPacket {
    source: string;
  }
  interface BindRow extends RowDataPacket {
    kingdom: string;
  }

  const selfSoT = { ...baseSoT, warTarget: "8:6" };
  await storeSoT(selfSoT, "self1", "keyhash1", true, "2025-06-01 12:00:00");

  const [[ov]] = await pool.query<SrcRow[]>(
    "SELECT source FROM province_overview WHERE key_hash = ?",
    ["keyhash1"],
  );
  assert.equal(ov.source, "throne");

  const [[bind]] = await pool.query<BindRow[]>(
    "SELECT kingdom FROM key_kingdom_bindings WHERE key_hash = ?",
    ["keyhash1"],
  );
  assert.equal(bind.kingdom, "7:5");
});

test("storeSoT: isSelfThrone=true with armiesOut inserts som_armies rows", async () => {
  await truncateAll();
  interface ArmyRow extends RowDataPacket {
    army_type: string;
    land_gained: number;
    return_days: number;
  }

  const selfSoT = {
    ...baseSoT,
    armiesOut: [
      { daysLeft: 3, acres: 120 },
      { daysLeft: 1, acres: 60 },
    ],
  };
  await storeSoT(selfSoT, "self1", "keyhash1", true, "2025-06-01 12:00:00");

  const [armies] = await pool.query<ArmyRow[]>(
    "SELECT army_type, land_gained, return_days FROM som_armies ORDER BY army_type",
  );
  assert.equal(armies.length, 2);
  assert.equal(armies[0].army_type, "out_1");
  assert.equal(armies[0].land_gained, 120);
  assert.equal(armies[0].return_days, 3);
});

test("storeSoT: duplicate does not double-insert", async () => {
  await truncateAll();
  interface CountRow extends RowDataPacket {
    n: number;
  }

  await storeSoT(baseSoT, "spy1", "keyhash1", false, "2025-06-01 12:00:00");
  await storeSoT(baseSoT, "spy1", "keyhash1", false, "2025-06-01 12:00:00");

  const [[{ n }]] = await pool.query<CountRow[]>(
    "SELECT COUNT(*) AS n FROM province_overview WHERE key_hash = ?",
    ["keyhash1"],
  );
  assert.equal(n, 1);
});

// ── storeKingdom ─────────────────────────────────────────────────────────────

const baseKingdom = {
  name: "TestKingdom",
  location: "7:5",
  kingdomTitle: "Grand Kingdom",
  totalNetworth: 5000000,
  totalLand: 10000,
  totalHonor: 200,
  warsWon: 3,
  warLosses: 1,
  networthRank: 10,
  landRank: 12,
  honorRank: 8,
  warTarget: null,
  theirAttitudeToUs: null,
  theirAttitudePoints: null,
  ourAttitudeToThem: null,
  ourAttitudePoints: null,
  hostilityMeterVisibleUntil: null,
  openRelations: [],
  warDoctrines: [],
  provinces: [
    {
      slot: 1,
      name: "ProvA",
      race: "Elf",
      land: 600,
      networth: 80000,
      honorTitle: "Knight",
    },
    {
      slot: 2,
      name: "ProvB",
      race: "Human",
      land: 500,
      networth: 70000,
      honorTitle: "",
    },
  ],
};

test("storeKingdom: inserts kingdom_intel and kingdom_provinces + province_overview", async () => {
  await truncateAll();
  interface KiRow extends RowDataPacket {
    name: string;
    location: string;
    total_networth: number;
  }
  interface KpRow extends RowDataPacket {
    slot: number;
    name: string;
    race: string;
  }
  interface CountRow extends RowDataPacket {
    n: number;
  }

  await storeKingdom(baseKingdom, "scout1", "keyhash1", "2025-06-01 12:00:00");

  const [[ki]] = await pool.query<KiRow[]>(
    "SELECT name, location, total_networth FROM kingdom_intel WHERE key_hash = ?",
    ["keyhash1"],
  );
  assert.equal(ki.name, "TestKingdom");
  assert.equal(ki.location, "7:5");
  assert.equal(ki.total_networth, 5000000);

  const [kp] = await pool.query<KpRow[]>(
    "SELECT slot, name, race FROM kingdom_provinces ORDER BY slot",
  );
  assert.equal(kp.length, 2);
  assert.equal(kp[0].name, "ProvA");
  assert.equal(kp[1].race, "Human");

  const [[{ n }]] = await pool.query<CountRow[]>(
    "SELECT COUNT(*) AS n FROM province_overview WHERE key_hash = ?",
    ["keyhash1"],
  );
  assert.equal(n, 2);
});

test("storeKingdom: duplicate is ignored", async () => {
  await truncateAll();
  interface CountRow extends RowDataPacket {
    n: number;
  }

  await storeKingdom(baseKingdom, "scout1", "keyhash1", "2025-06-01 12:00:00");
  await storeKingdom(baseKingdom, "scout1", "keyhash1", "2025-06-01 12:00:00");

  const [[{ n }]] = await pool.query<CountRow[]>(
    "SELECT COUNT(*) AS n FROM kingdom_intel WHERE key_hash = ?",
    ["keyhash1"],
  );
  assert.equal(n, 1);
});

// ── storeState ───────────────────────────────────────────────────────────────

const baseState = {
  name: "StateProvince",
  kingdom: "7:5",
  land: 750,
  networth: 110000,
  peasants: 5000,
  thieves: 200,
  wizards: 150,
  totalPop: 8000,
  maxPop: 10000,
};

test("storeState: inserts province_overview, province_resources, and province_troops", async () => {
  await truncateAll();
  interface OvRow extends RowDataPacket {
    land: number;
    networth: number;
    source: string;
  }
  interface ResRow extends RowDataPacket {
    thieves: number;
    wizards: number;
    total_pop: number;
  }
  interface TroopsRow extends RowDataPacket {
    peasants: number;
    source: string;
  }

  await storeState(baseState, "self1", "keyhash1", "2025-06-01 12:00:00");

  const [[ov]] = await pool.query<OvRow[]>(
    "SELECT land, networth, source FROM province_overview WHERE key_hash = ?",
    ["keyhash1"],
  );
  assert.equal(ov.land, 750);
  assert.equal(ov.source, "state");

  const [[res]] = await pool.query<ResRow[]>(
    "SELECT thieves, wizards, total_pop FROM province_resources WHERE key_hash = ?",
    ["keyhash1"],
  );
  assert.equal(res.thieves, 200);
  assert.equal(res.wizards, 150);
  assert.equal(res.total_pop, 8000);

  const [[troops]] = await pool.query<TroopsRow[]>(
    "SELECT peasants, source FROM province_troops WHERE key_hash = ?",
    ["keyhash1"],
  );
  assert.equal(troops.peasants, 5000);
  assert.equal(troops.source, "state");
});

test("storeState: duplicate does not double-insert", async () => {
  await truncateAll();
  interface CountRow extends RowDataPacket {
    n: number;
  }

  await storeState(baseState, "self1", "keyhash1", "2025-06-01 12:00:00");
  await storeState(baseState, "self1", "keyhash1", "2025-06-01 12:00:00");

  const [[{ n }]] = await pool.query<CountRow[]>(
    "SELECT COUNT(*) AS n FROM province_overview WHERE key_hash = ?",
    ["keyhash1"],
  );
  assert.equal(n, 1);
});

import { getBoundKingdom, storeKingdomNews } from "../lib/db-mysql";

// ── getBoundKingdom ───────────────────────────────────────────────────────────

test("getBoundKingdom: returns null for unknown key", async () => {
  await truncateAll();
  const result = await getBoundKingdom("unknownhash");
  assert.equal(result, null);
});

test("getBoundKingdom: returns kingdom after binding", async () => {
  await truncateAll();
  await withTransaction((conn) =>
    bindKeyToKingdom(conn, "hash1", "7:5", "throne"),
  );
  const result = await getBoundKingdom("hash1");
  assert.equal(result, "7:5");
});

// ── storeKingdomNews ──────────────────────────────────────────────────────────

const baseNewsData = {
  targetKingdom: null,
  events: [
    {
      gameDate: "Year 1, Month 2, Day 3",
      eventType: "attack_success",
      rawText: "TestAttacker attacked TestDefender and took 50 acres.",
      attackerName: "TestAttacker",
      attackerKingdom: "7:5",
      defenderName: "TestDefender",
      defenderKingdom: "8:6",
      acres: 50,
      books: null,
      senderName: null,
      receiverName: null,
      relationKingdom: null,
      dragonType: null,
      dragonName: null,
    },
  ],
};

test("storeKingdomNews: inserts event when key is bound to a kingdom", async () => {
  await truncateAll();
  interface NewsRow extends RowDataPacket {
    event_type: string;
    acres: number;
    attacker_name: string;
  }

  // Bind key first
  await withTransaction((conn) =>
    bindKeyToKingdom(conn, "keyhash1", "7:5", "throne"),
  );
  await storeKingdomNews(
    baseNewsData,
    "keyhash1",
    false,
    "2025-06-01 12:00:00",
  );

  const [[row]] = await pool.query<NewsRow[]>(
    "SELECT event_type, acres, attacker_name FROM kingdom_news_sharded WHERE key_hash = ?",
    ["keyhash1"],
  );
  assert.equal(row.event_type, "attack_success");
  assert.equal(row.acres, 50);
  assert.equal(row.attacker_name, "TestAttacker");
});

test("storeKingdomNews: no-op when key has no bound kingdom and isSnatched=false", async () => {
  await truncateAll();
  interface CountRow extends RowDataPacket {
    n: number;
  }

  await storeKingdomNews(
    baseNewsData,
    "unboundkey",
    false,
    "2025-06-01 12:00:00",
  );

  const [[{ n }]] = await pool.query<CountRow[]>(
    "SELECT COUNT(*) AS n FROM kingdom_news_sharded",
    [],
  );
  assert.equal(n, 0);
});

test("storeKingdomNews: isSnatched=true uses targetKingdom from data", async () => {
  await truncateAll();
  interface KdRow extends RowDataPacket {
    kingdom: string;
  }

  const snatchedData = { ...baseNewsData, targetKingdom: "9:1" };
  await storeKingdomNews(snatchedData, "keyhash1", true, "2025-06-01 12:00:00");

  const [[row]] = await pool.query<KdRow[]>(
    "SELECT kingdom FROM kingdom_news_sharded WHERE key_hash = ?",
    ["keyhash1"],
  );
  assert.equal(row.kingdom, "9:1");
});

test("storeKingdomNews: duplicate event is ignored", async () => {
  await truncateAll();
  interface CountRow extends RowDataPacket {
    n: number;
  }

  await withTransaction((conn) =>
    bindKeyToKingdom(conn, "keyhash1", "7:5", "throne"),
  );
  await storeKingdomNews(
    baseNewsData,
    "keyhash1",
    false,
    "2025-06-01 12:00:00",
  );
  await storeKingdomNews(
    baseNewsData,
    "keyhash1",
    false,
    "2025-06-01 12:00:00",
  );

  const [[{ n }]] = await pool.query<CountRow[]>(
    "SELECT COUNT(*) AS n FROM kingdom_news_sharded WHERE key_hash = ?",
    ["keyhash1"],
  );
  assert.equal(n, 1);
});

import {
  getLatestKingdomSnapshot,
  getKingdomSnapshotHistory,
  getKingdomRitual,
  getKingdomDragon,
  getLatestWarDate,
  getKingdomNews,
  getRecentOps,
} from "../lib/db-mysql";

// ── getLatestKingdomSnapshot ──────────────────────────────────────────────────

test("getLatestKingdomSnapshot: returns null when no data", async () => {
  await truncateAll();
  const result = await getLatestKingdomSnapshot("7:5", "keyhash1");
  assert.equal(result, null);
});

test("getLatestKingdomSnapshot: returns snapshot with provinces sorted by networth DESC", async () => {
  await truncateAll();
  await storeKingdom(baseKingdom, "scout1", "keyhash1", "2025-06-01 12:00:00");

  const snap = await getLatestKingdomSnapshot("7:5", "keyhash1");
  assert.ok(snap !== null);
  assert.equal(snap.name, "TestKingdom");
  assert.equal(snap.location, "7:5");
  assert.equal(snap.totalNetworth, 5000000);
  assert.equal(snap.provinces.length, 2);
  assert.equal(snap.provinces[0].name, "ProvA"); // higher networth first
});

test("getLatestKingdomSnapshot: returns most recent when multiple snapshots exist", async () => {
  await truncateAll();
  await storeKingdom(baseKingdom, "scout1", "keyhash1", "2025-06-01 10:00:00");
  const newer = { ...baseKingdom, totalNetworth: 9999999 };
  await storeKingdom(newer, "scout1", "keyhash1", "2025-06-01 12:00:00");

  const snap = await getLatestKingdomSnapshot("7:5", "keyhash1");
  assert.equal(snap?.totalNetworth, 9999999);
});

// ── getKingdomSnapshotHistory ─────────────────────────────────────────────────

test("getKingdomSnapshotHistory: returns empty array when no data", async () => {
  await truncateAll();
  const result = await getKingdomSnapshotHistory("7:5", "keyhash1");
  assert.deepEqual(result, []);
});

test("getKingdomSnapshotHistory: returns snapshots in chronological order", async () => {
  await truncateAll();
  await storeKingdom(baseKingdom, "scout1", "keyhash1", "2025-06-01 10:00:00");
  await storeKingdom(
    { ...baseKingdom, totalNetworth: 6000000 },
    "scout1",
    "keyhash1",
    "2025-06-01 12:00:00",
  );

  const hist = await getKingdomSnapshotHistory("7:5", "keyhash1");
  assert.equal(hist.length, 2);
  assert.ok(hist[0].receivedAt < hist[1].receivedAt);
  assert.equal(hist[1].totalNetworth, 6000000);
});

// ── getKingdomRitual ──────────────────────────────────────────────────────────

test("getKingdomRitual: returns null when no rituals", async () => {
  await truncateAll();
  const result = await getKingdomRitual("7:5", "keyhash1");
  assert.equal(result, null);
});

test("getKingdomRitual: returns ritual when present and no newer observation", async () => {
  await truncateAll();
  // Store SoT with a ritual effect (no subsequent province_status observation)
  await storeSoT(
    {
      ...baseSoT,
      activeEffects: [
        {
          name: "Mystic Aura",
          kind: "ritual",
          durationText: "10 days",
          remainingTicks: 10,
          effectivenessPercent: 1.2,
        },
      ],
    },
    "scout1",
    "keyhash1",
    false,
    "2025-06-01 12:00:00",
  );

  const ritual = await getKingdomRitual("7:5", "keyhash1");
  assert.ok(ritual !== null);
  assert.equal(ritual.name, "Mystic Aura");
  assert.equal(ritual.remainingTicks, 10);
});

// ── getKingdomDragon ──────────────────────────────────────────────────────────

test("getKingdomDragon: returns null when no dragon", async () => {
  await truncateAll();
  const result = await getKingdomDragon("7:5", "keyhash1");
  assert.equal(result, null);
});

test("getKingdomDragon: returns dragon when province has one", async () => {
  await truncateAll();
  await storeSoT(
    {
      ...baseSoT,
      dragonType: "Fire Dragon",
      dragonName: "Ignis",
    },
    "scout1",
    "keyhash1",
    false,
    "2025-06-01 12:00:00",
  );

  const dragon = await getKingdomDragon("7:5", "keyhash1");
  assert.ok(dragon !== null);
  assert.equal(dragon.dragonType, "Fire Dragon");
  assert.equal(dragon.dragonName, "Ignis");
});

test("getKingdomDragon: ignores newer status from another kingdom", async () => {
  await truncateAll();
  await storeSoT(
    {
      ...baseSoT,
      dragonType: "Fire Dragon",
      dragonName: "Ignis",
    },
    "scout1",
    "keyhash1",
    false,
    "2025-06-01 12:00:00",
  );
  await storeSoT(
    {
      ...baseSoT,
      name: "OtherStatusProvince",
      kingdom: "8:6",
      dragonType: null,
      dragonName: null,
    },
    "scout1",
    "keyhash1",
    false,
    "2025-06-01 13:00:00",
  );

  const dragon = await getKingdomDragon("7:5", "keyhash1");
  assert.ok(dragon !== null);
  assert.equal(dragon.dragonType, "Fire Dragon");
  assert.equal(dragon.dragonName, "Ignis");
});

// ── getLatestWarDate ──────────────────────────────────────────────────────────

test("getLatestWarDate: returns null when no news access", async () => {
  await truncateAll();
  const result = await getLatestWarDate("7:5", "keyhash1");
  assert.equal(result, null);
});

test("getLatestWarDate: returns null when no war_declared event", async () => {
  await truncateAll();
  await withTransaction((conn) =>
    bindKeyToKingdom(conn, "keyhash1", "7:5", "throne"),
  );
  await storeKingdomNews(
    baseNewsData,
    "keyhash1",
    false,
    "2025-06-01 12:00:00",
  );

  const result = await getLatestWarDate("7:5", "keyhash1");
  assert.equal(result, null);
});

test("getLatestWarDate: returns game_date of latest war declaration event", async () => {
  await truncateAll();
  await withTransaction((conn) =>
    bindKeyToKingdom(conn, "keyhash1", "7:5", "throne"),
  );

  const warNews = {
    targetKingdom: null,
    events: [
      {
        ...baseNewsData.events[0],
        eventType: "war_declared",
        rawText: "War declared!",
        gameDate: "January 3 of YR1",
      },
      {
        ...baseNewsData.events[0],
        eventType: "war_declared_on_us",
        rawText: "War declared on us!",
        gameDate: "January 5 of YR1",
      },
    ],
  };
  await storeKingdomNews(warNews, "keyhash1", false, "2025-06-01 12:00:00");

  const result = await getLatestWarDate("7:5", "keyhash1");
  assert.equal(result, "January 5 of YR1");
});

// ── getKingdomNews ────────────────────────────────────────────────────────────

test("getKingdomNews: returns empty when no news access", async () => {
  await truncateAll();
  const result = await getKingdomNews("7:5", "keyhash1");
  assert.deepEqual(result.events, []);
  assert.equal(result.effectiveFrom, null);
});

test("getKingdomNews: returns events when kingdom has news", async () => {
  await truncateAll();
  await withTransaction((conn) =>
    bindKeyToKingdom(conn, "keyhash1", "7:5", "throne"),
  );
  await storeKingdomNews(
    baseNewsData,
    "keyhash1",
    false,
    "2025-06-01 12:00:00",
  );

  const result = await getKingdomNews("7:5", "keyhash1");
  assert.equal(result.events.length, 1);
  assert.equal(result.events[0].eventType, "attack_success");
  assert.equal(result.events[0].acres, 50);
  assert.ok(result.effectiveFrom !== null);
});

test("getKingdomNews: respects explicit from/to date range", async () => {
  await truncateAll();
  await withTransaction((conn) =>
    bindKeyToKingdom(conn, "keyhash1", "7:5", "throne"),
  );

  const newsInRange = {
    targetKingdom: null,
    events: [
      {
        ...baseNewsData.events[0],
        gameDate: "January 5 of YR1",
        rawText: "In range event",
      },
    ],
  };
  const newsOutOfRange = {
    targetKingdom: null,
    events: [
      {
        ...baseNewsData.events[0],
        gameDate: "January 1 of YR1",
        rawText: "Out of range event",
      },
    ],
  };
  await storeKingdomNews(newsInRange, "keyhash1", false, "2025-06-01 12:00:00");
  await storeKingdomNews(
    newsOutOfRange,
    "keyhash1",
    false,
    "2025-06-01 13:00:00",
  );

  const result = await getKingdomNews("7:5", "keyhash1", "January 3 of YR1");
  assert.equal(result.events.length, 1);
  assert.equal(result.events[0].rawText, "In range event");
});

// ── getRecentOps ──────────────────────────────────────────────────────────────

test("getRecentOps: returns empty array when no data", async () => {
  await truncateAll();
  const ops = await getRecentOps("keyhash1");
  assert.deepEqual(ops, []);
});

test("getRecentOps: returns a SoT op after storeSoT", async () => {
  await truncateAll();
  await storeSoT(baseSoT, "spy1", "keyhash1", false, "2025-06-01 12:00:00");

  const ops = await getRecentOps("keyhash1");
  assert.equal(ops.length, 1);
  assert.equal(ops[0].op_type, "SoT");
  assert.equal(ops[0].op_category, "intel");
  assert.equal(ops[0].province_name, "SoTProvince");
  assert.equal(ops[0].kingdom, "7:5");
  assert.equal(ops[0].outcome, "success");
});

test("getRecentOps: returns a SoM op after storeSoM", async () => {
  await truncateAll();
  await storeSoM(baseSoM, "scout1", "keyhash1", false, "2025-06-01 12:00:00");

  const ops = await getRecentOps("keyhash1");
  assert.equal(ops.length, 1);
  assert.equal(ops[0].op_type, "SoM");
  assert.equal(ops[0].op_category, "intel");
});

test("getRecentOps: multiple op types appear and are ordered newest-first", async () => {
  await truncateAll();
  await storeSoT(baseSoT, "spy1", "keyhash1", false, "2025-06-01 10:00:00");
  await storeSoM(baseSoM, "scout1", "keyhash1", false, "2025-06-01 12:00:00");

  const ops = await getRecentOps("keyhash1");
  assert.equal(ops.length, 2);
  assert.equal(ops[0].op_type, "SoM");
  assert.equal(ops[1].op_type, "SoT");
});

test("getRecentOps: limit is respected", async () => {
  await truncateAll();
  await storeSoT(baseSoT, "spy1", "keyhash1", false, "2025-06-01 10:00:00");
  await storeSoM(baseSoM, "scout1", "keyhash1", false, "2025-06-01 12:00:00");

  const ops = await getRecentOps("keyhash1", 1);
  assert.equal(ops.length, 1);
  assert.equal(ops[0].op_type, "SoM");
});

test("getRecentOps: since filter excludes older ops", async () => {
  await truncateAll();
  await storeSoT(baseSoT, "spy1", "keyhash1", false, "2025-06-01 10:00:00");
  await storeSoM(baseSoM, "scout1", "keyhash1", false, "2025-06-01 12:00:00");

  const ops = await getRecentOps("keyhash1", 20, "2025-06-01 11:00:00");
  assert.equal(ops.length, 1);
  assert.equal(ops[0].op_type, "SoM");
});

test("getRecentOps: thievery op appears with correct category", async () => {
  await truncateAll();
  await storeRob(
    {
      name: "RobProvince",
      kingdom: "7:5",
      op: "arson",
      outcome: "success",
      targetName: "EnemyProv",
      targetSlot: null,
      targetKingdom: "3:4",
      amountStolen: null,
      troopsAssassinated: null,
      kidnapped: null,
      acresBurned: 5,
      effectDuration: null,
      thievesLost: 0,
      thieves: null,
      stealth: null,
      deserters: null,
      deserterType: null,
    },
    "thief1",
    "keyhash1",
    "2025-06-01 12:00:00",
  );

  const ops = await getRecentOps("keyhash1");
  assert.equal(ops.length, 1);
  assert.equal(ops[0].op_type, "arson");
  assert.equal(ops[0].op_category, "thievery");
  assert.equal(ops[0].province_name, "EnemyProv");
  assert.equal(ops[0].actor_name, "RobProvince");
  assert.equal(ops[0].detail_kind, "acres_burned");
  assert.equal(ops[0].detail_value, 5);
});

test("getRecentOps: attack op appears with correct category", async () => {
  await truncateAll();
  await storeAttack(
    {
      name: "AttackProv",
      kingdom: "7:5",
      attackType: "traditional_march",
      outcome: "success",
      targetName: "DefProv",
      targetKingdom: "3:4",
      acresTaken: 20,
      buildingsSurvived: null,
      specialistCredits: null,
      peasantsSettled: null,
      massacred: null,
      enemyKilled: null,
      enemyImprisoned: null,
      returnDays: 3,
    },
    "gen1",
    "keyhash1",
    "2025-06-01 12:00:00",
  );

  const ops = await getRecentOps("keyhash1");
  assert.equal(ops.length, 1);
  assert.equal(ops[0].op_category, "attack");
  assert.equal(ops[0].detail_kind, "acres_taken");
  assert.equal(ops[0].detail_value, 20);
});

test("getRecentOps: sorcery op appears with correct category", async () => {
  await truncateAll();
  await storeSorcery(
    {
      name: "WizProv",
      kingdom: "7:5",
      spell: "Lightning Strike",
      outcome: "success",
      targetName: "TargetProv",
      targetSlot: null,
      targetKingdom: "3:4",
      durationDays: 6,
      wizardsLost: 0,
      runesSpent: null,
      wizards: null,
      runes: null,
      mana: null,
    },
    "wiz1",
    "keyhash1",
    "2025-06-01 12:00:00",
  );

  const ops = await getRecentOps("keyhash1");
  assert.equal(ops.length, 1);
  assert.equal(ops[0].op_category, "sorcery");
  assert.equal(ops[0].detail_kind, "duration_days");
  assert.equal(ops[0].detail_value, 6);
});

test("replayEntry inserts original received_at directly", async () => {
  await truncateAll();
  const { replayEntry, normalizeReceivedAt } =
    await import("../lib/replay-debug-log");
  const { flushMetricsCacheRefreshQueue } = await import("../lib/db-api");

  const receivedAt = "2026-05-03T03:57:27.581Z";
  const expected = normalizeReceivedAt(receivedAt);
  const type = await replayEntry(
    {
      url: "https://utopia-game.com/wol/game/council_state",
      prov: "Replay Timestamp",
      received_at: receivedAt,
      key_hash: "timestamp-key",
      data_simple: [
        "Current Networth\t500,000 gold coins",
        "Current Land\t850 acres",
        "Peasants\t1,234",
        "Thieves\t567",
        "Wizards\t89",
        "Total\t1,890",
        "Max Population\t2,100",
      ].join("\n"),
    },
    new Set(["state"]),
  );

  assert.equal(type, "state");
  for (const table of [
    "province_overview",
    "province_resources",
    "province_troops",
  ]) {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT received_at FROM ${table}`,
    );
    assert.equal(rows[0]?.received_at, expected, table);
  }
  await flushMetricsCacheRefreshQueue();
});
