#!/usr/bin/env tsx
/**
 * One-time migration: copy all data from SQLite intel.db into MySQL.
 *
 * Usage:
 *   INTEL_DB_PATH=/path/to/intel.db \
 *   DB_HOST=localhost DB_USER=utopiaintel DB_PASSWORD=... DB_NAME=utopiaintel \
 *   tsx scripts/migrate-sqlite-to-mysql.ts
 *
 * The target MySQL database must already be schema-initialised (ensureReady()).
 * The script is idempotent: INSERT IGNORE / duplicate handling means re-running
 * won't duplicate rows, though ID remapping will re-query on conflicts.
 */

import Database from "better-sqlite3";
import path from "path";
import { pool, ensureReady } from "../lib/db-mysql";
import type { PoolConnection, ResultSetHeader } from "mysql2/promise";

const SQLITE_PATH = process.env.INTEL_DB_PATH ?? path.join(process.cwd(), "intel.db");
const BATCH = 200;

// ── helpers ──────────────────────────────────────────────────────────────────

function chunks<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function batchInsert(
  conn: PoolConnection,
  table: string,
  cols: string[],
  rows: unknown[][],
): Promise<void> {
  if (!rows.length) return;
  const placeholders = `(${cols.map(() => "?").join(", ")})`;
  for (const chunk of chunks(rows, BATCH)) {
    const values = chunk.flat();
    const ph = chunk.map(() => placeholders).join(", ");
    await conn.query(`INSERT IGNORE INTO ${table} (${cols.join(", ")}) VALUES ${ph}`, values);
  }
}

// Insert a single row and return the MySQL insertId (or resolve via SELECT on conflict).
async function insertOne(
  conn: PoolConnection,
  sql: string,
  params: unknown[],
  conflictSql: string,
  conflictParams: unknown[],
): Promise<number> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [res] = await conn.execute(sql, params as any) as [ResultSetHeader, unknown];
  if (res.insertId !== 0) return res.insertId;
  // Duplicate — find existing ID
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [rows] = await conn.execute(conflictSql, conflictParams as any) as [{ id: number }[], unknown];
  return rows[0].id;
}

// ── main ─────────────────────────────────────────────────────────────────────

async function main() {
  const sqlite = new Database(SQLITE_PATH, { readonly: true });
  console.log(`Source: ${SQLITE_PATH}`);

  await ensureReady();
  const conn = await pool.getConnection();

  try {
    await conn.query("SET FOREIGN_KEY_CHECKS = 0");

    // ── provinces ────────────────────────────────────────────────────────────
    {
      type Row = {
        id: number; name: string; kingdom: string; created_at: string;
        cached_rtpa: number|null; cached_rtpa_age: string|null;
        cached_mtpa: number|null; cached_mtpa_age: string|null;
        cached_otpa: number|null; cached_otpa_age: string|null;
        cached_dtpa: number|null; cached_dtpa_age: string|null;
        cached_rwpa: number|null; cached_rwpa_age: string|null;
        cached_mwpa: number|null; cached_mwpa_age: string|null;
      };
      const rows = sqlite.prepare("SELECT * FROM provinces ORDER BY id").all() as Row[];
      console.log(`provinces: ${rows.length} rows`);
      const provMap = new Map<number, number>();
      for (const r of rows) {
        const id = await insertOne(
          conn,
          `INSERT IGNORE INTO provinces
            (name, kingdom, created_at,
             cached_rtpa, cached_rtpa_age, cached_mtpa, cached_mtpa_age,
             cached_otpa, cached_otpa_age, cached_dtpa, cached_dtpa_age,
             cached_rwpa, cached_rwpa_age, cached_mwpa, cached_mwpa_age)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [r.name, r.kingdom, r.created_at,
           r.cached_rtpa, r.cached_rtpa_age, r.cached_mtpa, r.cached_mtpa_age,
           r.cached_otpa, r.cached_otpa_age, r.cached_dtpa, r.cached_dtpa_age,
           r.cached_rwpa, r.cached_rwpa_age, r.cached_mwpa, r.cached_mwpa_age],
          "SELECT id FROM provinces WHERE name = ? AND kingdom = ?",
          [r.name, r.kingdom],
        );
        provMap.set(r.id, id);
      }

      // ── province_overview ────────────────────────────────────────────────
      {
        type R = {
          province_id: number; key_hash: string|null; race: string|null;
          personality: string|null; honor_title: string|null; ruler: string|null;
          land: number|null; networth: number|null; source: string;
          saved_by: string|null; accuracy: number|null; received_at: string;
        };
        const rs = sqlite.prepare("SELECT * FROM province_overview ORDER BY id").all() as R[];
        console.log(`province_overview: ${rs.length} rows`);
        await batchInsert(conn, "province_overview",
          ["province_id","key_hash","race","personality","honor_title","ruler","land","networth","source","saved_by","accuracy","received_at"],
          rs.map(r => [provMap.get(r.province_id)!, r.key_hash, r.race, r.personality, r.honor_title, r.ruler, r.land, r.networth, r.source, r.saved_by, r.accuracy, r.received_at]),
        );
      }

      // ── total_military_points ────────────────────────────────────────────
      {
        type R = { province_id: number; key_hash: string|null; off_points: number|null; def_points: number|null; source: string; saved_by: string|null; accuracy: number|null; received_at: string };
        const rs = sqlite.prepare("SELECT * FROM total_military_points ORDER BY id").all() as R[];
        console.log(`total_military_points: ${rs.length} rows`);
        await batchInsert(conn, "total_military_points",
          ["province_id","key_hash","off_points","def_points","source","saved_by","accuracy","received_at"],
          rs.map(r => [provMap.get(r.province_id)!, r.key_hash, r.off_points, r.def_points, r.source, r.saved_by, r.accuracy, r.received_at]),
        );
      }

      // ── home_military_points ─────────────────────────────────────────────
      {
        type R = { province_id: number; key_hash: string|null; mod_off_at_home: number|null; mod_def_at_home: number|null; source: string; saved_by: string|null; accuracy: number|null; received_at: string };
        const rs = sqlite.prepare("SELECT * FROM home_military_points ORDER BY id").all() as R[];
        console.log(`home_military_points: ${rs.length} rows`);
        await batchInsert(conn, "home_military_points",
          ["province_id","key_hash","mod_off_at_home","mod_def_at_home","source","saved_by","accuracy","received_at"],
          rs.map(r => [provMap.get(r.province_id)!, r.key_hash, r.mod_off_at_home, r.mod_def_at_home, r.source, r.saved_by, r.accuracy, r.received_at]),
        );
      }

      // ── province_troops ──────────────────────────────────────────────────
      {
        type R = { province_id: number; key_hash: string|null; soldiers: number|null; off_specs: number|null; def_specs: number|null; elites: number|null; war_horses: number|null; peasants: number|null; source: string; saved_by: string|null; accuracy: number|null; received_at: string };
        const rs = sqlite.prepare("SELECT * FROM province_troops ORDER BY id").all() as R[];
        console.log(`province_troops: ${rs.length} rows`);
        await batchInsert(conn, "province_troops",
          ["province_id","key_hash","soldiers","off_specs","def_specs","elites","war_horses","peasants","source","saved_by","accuracy","received_at"],
          rs.map(r => [provMap.get(r.province_id)!, r.key_hash, r.soldiers, r.off_specs, r.def_specs, r.elites, r.war_horses, r.peasants, r.source, r.saved_by, r.accuracy, r.received_at]),
        );
      }

      // ── province_resources ───────────────────────────────────────────────
      {
        type R = { province_id: number; key_hash: string|null; money: number|null; food: number|null; runes: number|null; prisoners: number|null; trade_balance: number|null; building_efficiency: number|null; thieves: number|null; stealth: number|null; wizards: number|null; mana: number|null; total_pop: number|null; max_pop: number|null; free_specialist_credits: number|null; free_building_credits: number|null; source: string; saved_by: string|null; accuracy: number|null; received_at: string };
        const rs = sqlite.prepare("SELECT * FROM province_resources ORDER BY id").all() as R[];
        console.log(`province_resources: ${rs.length} rows`);
        await batchInsert(conn, "province_resources",
          ["province_id","key_hash","money","food","runes","prisoners","trade_balance","building_efficiency","thieves","stealth","wizards","mana","total_pop","max_pop","free_specialist_credits","free_building_credits","source","saved_by","accuracy","received_at"],
          rs.map(r => [provMap.get(r.province_id)!, r.key_hash, r.money, r.food, r.runes, r.prisoners, r.trade_balance, r.building_efficiency, r.thieves, r.stealth, r.wizards, r.mana, r.total_pop ?? null, r.max_pop ?? null, r.free_specialist_credits ?? null, r.free_building_credits ?? null, r.source, r.saved_by, r.accuracy, r.received_at]),
        );
      }

      // ── province_status ──────────────────────────────────────────────────
      {
        type R = { province_id: number; key_hash: string|null; plagued: number|null; overpopulated: number|null; overpop_deserters: number|null; dragon_type: string|null; dragon_name: string|null; hit_status: string|null; war: number|null; source: string; saved_by: string|null; received_at: string };
        const rs = sqlite.prepare("SELECT * FROM province_status ORDER BY id").all() as R[];
        console.log(`province_status: ${rs.length} rows`);
        await batchInsert(conn, "province_status",
          ["province_id","key_hash","plagued","overpopulated","overpop_deserters","dragon_type","dragon_name","hit_status","war","source","saved_by","received_at"],
          rs.map(r => [provMap.get(r.province_id)!, r.key_hash, r.plagued, r.overpopulated, r.overpop_deserters ?? null, r.dragon_type ?? null, r.dragon_name ?? null, r.hit_status, r.war, r.source, r.saved_by, r.received_at]),
        );
      }

      // ── province_effects ─────────────────────────────────────────────────
      {
        type R = { province_id: number; key_hash: string|null; effect_name: string; effect_kind: string; duration_text: string|null; remaining_ticks: number|null; effectiveness_percent: number|null; source: string; saved_by: string|null; received_at: string };
        const rs = sqlite.prepare("SELECT * FROM province_effects ORDER BY id").all() as R[];
        console.log(`province_effects: ${rs.length} rows`);
        await batchInsert(conn, "province_effects",
          ["province_id","key_hash","effect_name","effect_kind","duration_text","remaining_ticks","effectiveness_percent","source","saved_by","received_at"],
          rs.map(r => [provMap.get(r.province_id)!, r.key_hash, r.effect_name, r.effect_kind, r.duration_text, r.remaining_ticks ?? null, r.effectiveness_percent ?? null, r.source, r.saved_by, r.received_at]),
        );
      }

      // ── intel_partitions ─────────────────────────────────────────────────
      {
        type R = { key_hash: string; province_id: number };
        const rs = sqlite.prepare("SELECT * FROM intel_partitions").all() as R[];
        console.log(`intel_partitions: ${rs.length} rows`);
        await batchInsert(conn, "intel_partitions",
          ["key_hash","province_id"],
          rs.map(r => [r.key_hash, provMap.get(r.province_id)!]),
        );
      }

      // ── military_intel + som_armies ──────────────────────────────────────
      {
        type MilRow = { id: number; province_id: number; key_hash: string|null; ome: number|null; dme: number|null; source: string; saved_by: string|null; accuracy: number|null; received_at: string };
        type ArmyRow = { military_intel_id: number; army_type: string; generals: number; soldiers: number; off_specs: number; def_specs: number; elites: number; war_horses: number; thieves: number; land_gained: number; return_days: number|null };
        const milRows = sqlite.prepare("SELECT * FROM military_intel ORDER BY id").all() as MilRow[];
        const armyRows = sqlite.prepare("SELECT * FROM som_armies ORDER BY military_intel_id, id").all() as ArmyRow[];
        console.log(`military_intel: ${milRows.length} rows, som_armies: ${armyRows.length} rows`);
        const milMap = new Map<number, number>();
        for (const r of milRows) {
          const id = await insertOne(
            conn,
            "INSERT IGNORE INTO military_intel (province_id, key_hash, ome, dme, source, saved_by, accuracy, received_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            [provMap.get(r.province_id)!, r.key_hash, r.ome, r.dme, r.source, r.saved_by, r.accuracy, r.received_at],
            "SELECT id FROM military_intel WHERE province_id = ? AND key_hash <=> ? AND source = ? AND saved_by <=> ? AND received_at = ?",
            [provMap.get(r.province_id)!, r.key_hash, r.source, r.saved_by, r.received_at],
          );
          milMap.set(r.id, id);
        }
        await batchInsert(conn, "som_armies",
          ["military_intel_id","army_type","generals","soldiers","off_specs","def_specs","elites","war_horses","thieves","land_gained","return_days"],
          armyRows.map(r => [milMap.get(r.military_intel_id)!, r.army_type, r.generals, r.soldiers, r.off_specs, r.def_specs, r.elites, r.war_horses, r.thieves, r.land_gained, r.return_days]),
        );
      }

      // ── survey_intel + survey_buildings ──────────────────────────────────
      {
        type SurveyRow = { id: number; province_id: number; key_hash: string|null; thievery_effectiveness: number|null; thief_prevent_chance: number|null; castles_effect: number|null; source: string; saved_by: string|null; accuracy: number|null; received_at: string };
        type BldgRow = { survey_intel_id: number; building: string; built: number; in_progress: number };
        const surveyRows = sqlite.prepare("SELECT * FROM survey_intel ORDER BY id").all() as SurveyRow[];
        const bldgRows = sqlite.prepare("SELECT * FROM survey_buildings ORDER BY survey_intel_id, id").all() as BldgRow[];
        console.log(`survey_intel: ${surveyRows.length} rows, survey_buildings: ${bldgRows.length} rows`);
        const surveyMap = new Map<number, number>();
        for (const r of surveyRows) {
          const id = await insertOne(
            conn,
            "INSERT IGNORE INTO survey_intel (province_id, key_hash, thievery_effectiveness, thief_prevent_chance, castles_effect, source, saved_by, accuracy, received_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            [provMap.get(r.province_id)!, r.key_hash, r.thievery_effectiveness ?? null, r.thief_prevent_chance ?? null, r.castles_effect ?? null, r.source, r.saved_by, r.accuracy, r.received_at],
            "SELECT id FROM survey_intel WHERE province_id = ? AND key_hash <=> ? AND source = ? AND saved_by <=> ? AND received_at = ?",
            [provMap.get(r.province_id)!, r.key_hash, r.source, r.saved_by, r.received_at],
          );
          surveyMap.set(r.id, id);
        }
        await batchInsert(conn, "survey_buildings",
          ["survey_intel_id","building","built","in_progress"],
          bldgRows.map(r => [surveyMap.get(r.survey_intel_id)!, r.building, r.built, r.in_progress]),
        );
      }

      // ── sos_intel + sos_sciences ─────────────────────────────────────────
      {
        type SosRow = { id: number; province_id: number; key_hash: string|null; source: string; saved_by: string|null; accuracy: number|null; received_at: string };
        type SciRow = { sos_intel_id: number; science: string; books: number; effect: number };
        const sosRows = sqlite.prepare("SELECT * FROM sos_intel ORDER BY id").all() as SosRow[];
        const sciRows = sqlite.prepare("SELECT * FROM sos_sciences ORDER BY sos_intel_id, id").all() as SciRow[];
        console.log(`sos_intel: ${sosRows.length} rows, sos_sciences: ${sciRows.length} rows`);
        const sosMap = new Map<number, number>();
        for (const r of sosRows) {
          const id = await insertOne(
            conn,
            "INSERT IGNORE INTO sos_intel (province_id, key_hash, source, saved_by, accuracy, received_at) VALUES (?, ?, ?, ?, ?, ?)",
            [provMap.get(r.province_id)!, r.key_hash, r.source, r.saved_by, r.accuracy, r.received_at],
            "SELECT id FROM sos_intel WHERE province_id = ? AND key_hash <=> ? AND source = ? AND saved_by <=> ? AND received_at = ?",
            [provMap.get(r.province_id)!, r.key_hash, r.source, r.saved_by, r.received_at],
          );
          sosMap.set(r.id, id);
        }
        await batchInsert(conn, "sos_sciences",
          ["sos_intel_id","science","books","effect"],
          sciRows.map(r => [sosMap.get(r.sos_intel_id)!, r.science, r.books, r.effect]),
        );
      }

      // ── rob_ops ──────────────────────────────────────────────────────────
      {
        type R = { province_id: number; key_hash: string; op: string; target_name: string|null; target_slot: number|null; target_kingdom: string|null; outcome: string; amount_stolen: number|null; thieves_lost: number; thieves: number|null; stealth: number|null; troops_assassinated: number|null; kidnapped: number|null; acres_burned: number|null; effect_duration: number|null; saved_by: string|null; received_at: string };
        const rs = sqlite.prepare("SELECT * FROM rob_ops ORDER BY id").all() as R[];
        console.log(`rob_ops: ${rs.length} rows`);
        await batchInsert(conn, "rob_ops",
          ["province_id","key_hash","op","target_name","target_slot","target_kingdom","outcome","amount_stolen","thieves_lost","thieves","stealth","troops_assassinated","kidnapped","acres_burned","effect_duration","saved_by","received_at"],
          rs.map(r => [provMap.get(r.province_id)!, r.key_hash, r.op, r.target_name, r.target_slot, r.target_kingdom, r.outcome, r.amount_stolen, r.thieves_lost, r.thieves, r.stealth, r.troops_assassinated ?? null, r.kidnapped ?? null, r.acres_burned ?? null, r.effect_duration ?? null, r.saved_by, r.received_at]),
        );
      }

      // ── intel_ops ────────────────────────────────────────────────────────
      {
        type R = { province_id: number; key_hash: string; op: string; intel_type: string; outcome: string; target_name: string|null; target_slot: number|null; target_kingdom: string|null; accuracy: number|null; thieves_lost: number; saved_by: string|null; received_at: string };
        const rs = sqlite.prepare("SELECT * FROM intel_ops ORDER BY id").all() as R[];
        console.log(`intel_ops: ${rs.length} rows`);
        await batchInsert(conn, "intel_ops",
          ["province_id","key_hash","op","intel_type","outcome","target_name","target_slot","target_kingdom","accuracy","thieves_lost","saved_by","received_at"],
          rs.map(r => [provMap.get(r.province_id)!, r.key_hash, r.op, r.intel_type, r.outcome, r.target_name, r.target_slot, r.target_kingdom, r.accuracy, r.thieves_lost, r.saved_by, r.received_at]),
        );
      }

      // ── sorcery_ops ──────────────────────────────────────────────────────
      {
        type R = { province_id: number; key_hash: string; spell: string; outcome: string; runes_spent: number|null; wizards_lost: number; duration_days: number|null; target_name: string|null; target_slot: number|null; target_kingdom: string|null; wizards: number|null; runes: number|null; mana: number|null; saved_by: string|null; received_at: string };
        const rs = sqlite.prepare("SELECT * FROM sorcery_ops ORDER BY id").all() as R[];
        console.log(`sorcery_ops: ${rs.length} rows`);
        await batchInsert(conn, "sorcery_ops",
          ["province_id","key_hash","spell","outcome","runes_spent","wizards_lost","duration_days","target_name","target_slot","target_kingdom","wizards","runes","mana","saved_by","received_at"],
          rs.map(r => [provMap.get(r.province_id)!, r.key_hash, r.spell, r.outcome, r.runes_spent, r.wizards_lost, r.duration_days, r.target_name, r.target_slot, r.target_kingdom, r.wizards, r.runes, r.mana, r.saved_by, r.received_at]),
        );
      }

      // ── attack_ops ───────────────────────────────────────────────────────
      {
        type R = { province_id: number; key_hash: string; attack_type: string; outcome: string; target_name: string|null; target_kingdom: string|null; acres_taken: number|null; buildings_survived: number|null; specialist_credits: number|null; peasants_settled: number|null; massacred: number|null; enemy_killed: number|null; enemy_imprisoned: number|null; return_days: number|null; saved_by: string|null; received_at: string };
        const rs = sqlite.prepare("SELECT * FROM attack_ops ORDER BY id").all() as R[];
        console.log(`attack_ops: ${rs.length} rows`);
        await batchInsert(conn, "attack_ops",
          ["province_id","key_hash","attack_type","outcome","target_name","target_kingdom","acres_taken","buildings_survived","specialist_credits","peasants_settled","massacred","enemy_killed","enemy_imprisoned","return_days","saved_by","received_at"],
          rs.map(r => [provMap.get(r.province_id)!, r.key_hash, r.attack_type, r.outcome, r.target_name, r.target_kingdom, r.acres_taken, r.buildings_survived, r.specialist_credits, r.peasants_settled, r.massacred, r.enemy_killed, r.enemy_imprisoned, r.return_days, r.saved_by, r.received_at]),
        );
      }
    }

    // ── key_kingdom_bindings ─────────────────────────────────────────────────
    {
      type R = { key_hash: string; kingdom: string; source: string; bound_at: string };
      const rs = sqlite.prepare("SELECT * FROM key_kingdom_bindings").all() as R[];
      console.log(`key_kingdom_bindings: ${rs.length} rows`);
      await batchInsert(conn, "key_kingdom_bindings",
        ["key_hash","kingdom","source","bound_at"],
        rs.map(r => [r.key_hash, r.kingdom, r.source, r.bound_at]),
      );
    }

    // ── kingdom_intel + kingdom_provinces ────────────────────────────────────
    {
      type KiRow = {
        id: number; key_hash: string|null; name: string; location: string;
        kingdom_title: string|null; total_networth: number|null; total_land: number|null;
        total_honor: number|null; wars_won: number|null; war_losses: number|null;
        networth_rank: number|null; land_rank: number|null; honor_rank: number|null;
        war_target: string|null; their_attitude_to_us: string|null; their_attitude_points: number|null;
        our_attitude_to_them: string|null; our_attitude_points: number|null;
        hostility_meter_visible_until: string|null; open_relations_json: string|null;
        war_doctrines_json: string|null; source: string; saved_by: string|null; received_at: string;
      };
      type KpRow = { kingdom_intel_id: number; slot: number|null; name: string; race: string; land: number; networth: number; honor_title: string|null };
      const kiRows = sqlite.prepare("SELECT * FROM kingdom_intel ORDER BY id").all() as KiRow[];
      const kpRows = sqlite.prepare("SELECT * FROM kingdom_provinces ORDER BY kingdom_intel_id, id").all() as KpRow[];
      console.log(`kingdom_intel: ${kiRows.length} rows, kingdom_provinces: ${kpRows.length} rows`);
      const kiMap = new Map<number, number>();
      for (const r of kiRows) {
        const id = await insertOne(
          conn,
          `INSERT IGNORE INTO kingdom_intel
            (key_hash, name, location, kingdom_title, total_networth, total_land, total_honor,
             wars_won, war_losses, networth_rank, land_rank, honor_rank, war_target,
             their_attitude_to_us, their_attitude_points, our_attitude_to_them, our_attitude_points,
             hostility_meter_visible_until, open_relations_json, war_doctrines_json,
             source, saved_by, received_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [r.key_hash, r.name, r.location, r.kingdom_title, r.total_networth, r.total_land,
           r.total_honor, r.wars_won, r.war_losses, r.networth_rank, r.land_rank, r.honor_rank,
           r.war_target, r.their_attitude_to_us, r.their_attitude_points, r.our_attitude_to_them,
           r.our_attitude_points, r.hostility_meter_visible_until, r.open_relations_json,
           r.war_doctrines_json, r.source, r.saved_by, r.received_at],
          "SELECT id FROM kingdom_intel WHERE key_hash <=> ? AND location = ? AND source = ? AND saved_by <=> ? AND received_at = ?",
          [r.key_hash, r.location, r.source, r.saved_by, r.received_at],
        );
        kiMap.set(r.id, id);
      }
      await batchInsert(conn, "kingdom_provinces",
        ["kingdom_intel_id","slot","name","race","land","networth","honor_title"],
        kpRows.map(r => [kiMap.get(r.kingdom_intel_id)!, r.slot, r.name, r.race, r.land, r.networth, r.honor_title]),
      );
    }

    // ── kingdom_news ─────────────────────────────────────────────────────────
    {
      type R = { kingdom: string; game_date: string; game_date_ord: number|null; event_type: string; raw_text: string; attacker_name: string|null; attacker_kingdom: string|null; defender_name: string|null; defender_kingdom: string|null; acres: number|null; books: number|null; sender_name: string|null; receiver_name: string|null; relation_kingdom: string|null; dragon_type: string|null; dragon_name: string|null; received_at: string };
      const rs = sqlite.prepare("SELECT * FROM kingdom_news ORDER BY id").all() as R[];
      console.log(`kingdom_news: ${rs.length} rows`);
      await batchInsert(conn, "kingdom_news",
        ["kingdom","game_date","game_date_ord","event_type","raw_text","attacker_name","attacker_kingdom","defender_name","defender_kingdom","acres","books","sender_name","receiver_name","relation_kingdom","dragon_type","dragon_name","received_at"],
        rs.map(r => [r.kingdom, r.game_date, r.game_date_ord, r.event_type, r.raw_text, r.attacker_name, r.attacker_kingdom, r.defender_name, r.defender_kingdom, r.acres, r.books, r.sender_name, r.receiver_name, r.relation_kingdom, r.dragon_type, r.dragon_name, r.received_at]),
      );
    }

    // ── kingdom_news_sharded ─────────────────────────────────────────────────
    {
      type R = { key_hash: string; kingdom: string; game_date: string; game_date_ord: number|null; event_type: string; raw_text: string; attacker_name: string|null; attacker_kingdom: string|null; defender_name: string|null; defender_kingdom: string|null; acres: number|null; books: number|null; sender_name: string|null; receiver_name: string|null; relation_kingdom: string|null; dragon_type: string|null; dragon_name: string|null; received_at: string };
      const rs = sqlite.prepare("SELECT * FROM kingdom_news_sharded ORDER BY id").all() as R[];
      console.log(`kingdom_news_sharded: ${rs.length} rows`);
      await batchInsert(conn, "kingdom_news_sharded",
        ["key_hash","kingdom","game_date","game_date_ord","event_type","raw_text","attacker_name","attacker_kingdom","defender_name","defender_kingdom","acres","books","sender_name","receiver_name","relation_kingdom","dragon_type","dragon_name","received_at"],
        rs.map(r => [r.key_hash, r.kingdom, r.game_date, r.game_date_ord, r.event_type, r.raw_text, r.attacker_name, r.attacker_kingdom, r.defender_name, r.defender_kingdom, r.acres, r.books, r.sender_name, r.receiver_name, r.relation_kingdom, r.dragon_type, r.dragon_name, r.received_at]),
      );
    }

    console.log("Migration complete.");
  } finally {
    await conn.query("SET FOREIGN_KEY_CHECKS = 1");
    conn.release();
    await pool.end();
    sqlite.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
