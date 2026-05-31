import type {
  PoolConnection,
  ResultSetHeader,
  RowDataPacket,
} from "mysql2/promise";
import { createHash } from "node:crypto";
import { pool, ensureReady, initDb } from "./db-mysql-pool";
export { pool, ensureReady, initDb };
import { BAD_SPELL_NAMES, COMBAT_EVENT_TYPES } from "./effects";
import { parseUtopiaDate, formatUtopiaDate, UTOPIA_DAYS_PER_MONTH } from "./ui";
import { utopiaDateOrdToUtcTimestamp } from "./utopia-age";
import { computeWizardCount } from "./nw";
import {
  computeDtpaValue,
  computeMtpaValue,
  computeMwpaValue,
  computeOtpaValue,
  rawPerAcreValue,
} from "./metrics";
import { createMetricsCacheQueue } from "./metrics-cache";
import type {
  SoTData,
  SurveyData,
  SoMData,
  SoSData,
  SoDData,
  InfiltrateData,
  KingdomData,
  StateData,
  TrainArmyData,
  BuildData,
  RobData,
  SorceryData,
  AttackData,
} from "./parsers/types";
import type { KingdomNewsData } from "./parsers/kingdom_news";
import type { ProvinceNewsData } from "./parsers/province_news";
import type { IntelOpAttempt } from "./intel-ops";
import type { GameDateStamp, TimeRangeMode } from "./db-api";
import type {
  KingdomRow,
  KingdomSnapshot,
  KingdomSnapshotHistoryPoint,
  RecentOp,
  ProvinceRow,
  ArmyRow,
  ProvinceDetail,
  KingdomRitual,
  KingdomDragon,
  KingdomNewsRow,
  NewsProvinceSummary,
  NewsKingdomSummary,
  KingdomNewsSummary,
  ProvinceHistoryPoint,
  ProvinceNewsRow,
  OpProvEntry,
  OpTypeBreakdown,
  KingdomOpsStats,
  IncomingProvinceEvent,
  IncomingDamageProvinceStat,
  IncomingDamageStats,
} from "./db-types";

// ── Named-param helper ───────────────────────────────────────────────────────
// Converts `:name` placeholders to `?` and collects values in order.
// Usage: const [sql, vals] = n("SELECT * FROM t WHERE id = :id", { id: 1 });
export function n(
  sql: string,
  params: Record<string, unknown>,
): [string, unknown[]] {
  const values: unknown[] = [];
  const query = sql.replace(/:(\w+)/g, (_, key) => {
    values.push(params[key]);
    return "?";
  });
  return [query, values];
}

// ── Transaction helper ───────────────────────────────────────────────────────

export async function withTransaction<T>(
  fn: (conn: PoolConnection) => Promise<T>,
): Promise<T> {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const result = await fn(conn);
    await conn.commit();
    return result;
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

// ── SQL helpers ──────────────────────────────────────────────────────────────

const TTL_DAYS = 7;
const COMBAT_TYPES_SQL = COMBAT_EVENT_TYPES.map((t) => `'${t}'`).join(",");

const BAD_SPELL_SQL_LIST = BAD_SPELL_NAMES.map(
  (name) => `'${name.replaceAll("'", "''")}'`,
).join(", ");

async function backfillOpGameDate(
  conn: PoolConnection,
  table: "attack_ops" | "intel_ops" | "rob_ops" | "sorcery_ops",
  provinceId: number,
  keyHash: string,
  receivedAt: string | undefined,
  gameDate: GameDateStamp | undefined,
) {
  if (!receivedAt || !gameDate) return;
  await conn.execute(
    `
      UPDATE ${table}
      SET game_date = COALESCE(game_date, ?),
          game_date_ord = COALESCE(game_date_ord, ?)
      WHERE province_id = ? AND key_hash = ? AND received_at = ?
    `,
    [gameDate.gameDate, gameDate.gameDateOrd, provinceId, keyHash, receivedAt],
  );
}

function normalizeRealDateTime(value: string | undefined): string | null {
  if (!value) return null;
  const normalized = value.trim().replace("T", " ");
  if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(?::\d{2})?$/.test(normalized))
    return null;
  return normalized.length === 16 ? `${normalized}:00` : normalized;
}

// latestSlotCte uses :keyHash (and optionally :kingdom) — callers pass through n().
// Inner subquery is non-correlated (GROUP BY location, slot) so the optimizer can
// compute it once rather than once per outer row. When a kingdom filter is
// present, both outer and inner are scoped to that kingdom.
const latestSlotCte = (extraWhere = "") => {
  const kingdomKnown = extraWhere.includes(":kingdom");
  const innerWhere = kingdomKnown ? "AND ki2.location = :kingdom" : "";
  const groupBy = kingdomKnown ? "kp2.slot" : "ki2.location, kp2.slot";
  return `
  latest_slot AS (
    SELECT ki.location AS kingdom, kp.slot, kp.name
    FROM kingdom_provinces kp
    JOIN kingdom_intel ki ON ki.id = kp.kingdom_intel_id
    WHERE ki.key_hash = :keyHash
      AND kp.slot IS NOT NULL
      ${extraWhere}
      AND kp.id IN (
        SELECT MAX(kp2.id)
        FROM kingdom_provinces kp2
        JOIN kingdom_intel ki2 ON ki2.id = kp2.kingdom_intel_id
        WHERE ki2.key_hash = :keyHash
          AND kp2.slot IS NOT NULL
          ${innerWhere}
        GROUP BY ${groupBy}
      )
  )
`;
};

// OVERVIEW scalar subqueries — use :keyHash (resolved via n())
const OVERVIEW_RACE_SQL = `(SELECT race        FROM province_overview WHERE province_id = p.id AND key_hash = :keyHash AND race        IS NOT NULL ORDER BY received_at DESC LIMIT 1) AS race`;
const OVERVIEW_PERS_SQL = `(SELECT personality FROM province_overview WHERE province_id = p.id AND key_hash = :keyHash AND personality IS NOT NULL ORDER BY received_at DESC LIMIT 1) AS personality`;
const OVERVIEW_HONOR_SQL = `(SELECT honor_title FROM province_overview WHERE province_id = p.id AND key_hash = :keyHash AND honor_title IS NOT NULL ORDER BY received_at DESC LIMIT 1) AS honor_title`;

// ── Internal transaction helpers ─────────────────────────────────────────────
// All three take a PoolConnection so they can participate in a caller's transaction.

interface IdRow extends RowDataPacket {
  id: number;
}
interface KingdomRow2 extends RowDataPacket {
  kingdom: string;
}

// Get-or-create a province row; returns its id.
// When kingdom is "", prefer an existing row with the same name and a real kingdom
// (self-intel arrives without a kingdom, but the province already exists from SoT).
export async function ensureProvince(
  conn: PoolConnection,
  name: string,
  kingdom: string,
): Promise<number> {
  if (!kingdom) {
    const [rows] = await conn.execute<IdRow[]>(
      "SELECT id FROM provinces WHERE name = ? AND kingdom != '' LIMIT 1",
      [name],
    );
    if (rows.length > 0) return rows[0].id;
  }
  await conn.execute(
    "INSERT IGNORE INTO provinces (name, kingdom) VALUES (?, ?)",
    [name, kingdom],
  );
  const [rows] = await conn.execute<IdRow[]>(
    "SELECT id FROM provinces WHERE name = ? AND kingdom = ?",
    [name, kingdom],
  );
  return rows[0].id;
}

// Record that keyHash has access to provinceId (idempotent).
export async function recordSubmission(
  conn: PoolConnection,
  keyHash: string,
  provinceId: number,
): Promise<void> {
  await conn.execute(
    "INSERT IGNORE INTO intel_partitions (key_hash, province_id) VALUES (?, ?)",
    [keyHash, provinceId],
  );
}

// Bind a key_hash to a kingdom (first write wins; warns on conflict).
export async function bindKeyToKingdom(
  conn: PoolConnection,
  keyHash: string,
  kingdom: string,
  source: string,
): Promise<void> {
  const [rows] = await conn.execute<KingdomRow2[]>(
    "SELECT kingdom FROM key_kingdom_bindings WHERE key_hash = ?",
    [keyHash],
  );
  const existing = rows[0];

  if (existing && existing.kingdom !== kingdom) {
    console.warn(
      `[intel ${new Date().toISOString()}] key binding mismatch for ${keyHash.slice(0, 8)}: existing=${existing.kingdom} incoming=${kingdom} source=${source}`,
    );
    return;
  }

  await conn.execute(
    "INSERT IGNORE INTO key_kingdom_bindings (key_hash, kingdom, source) VALUES (?, ?, ?)",
    [keyHash, kingdom, source],
  );
}

// ── Metrics cache ────────────────────────────────────────────────────────────

const SAME_TICK = (a: string, b: string) =>
  `(UNIX_TIMESTAMP(${a}) DIV 3600) = (UNIX_TIMESTAMP(${b}) DIV 3600)`;

async function mysqlUpdateMetricsCache(
  provinceId: number,
  keyHash: string,
  receivedAt?: string | null,
): Promise<void> {
  await ensureReady();

  // Appends a window WHERE fragment + positional params for the given table alias.
  const wc = (alias: string, p: unknown[]) => {
    if (receivedAt == null) return "TRUE";
    p.push(receivedAt, receivedAt);
    return `(${alias}.received_at >= DATE_SUB(?, INTERVAL 1 HOUR) AND ${alias}.received_at <= ?)`;
  };

  type EV = import("mysql2").ExecuteValues;

  // ── PPA ──────────────────────────────────────────────────────────────────
  interface PpaRow extends RowDataPacket {
    peasants: number;
    land: number;
    age: string;
  }
  const ppaP: unknown[] = [provinceId, keyHash];
  const [[ppaRow]] = await pool.execute<PpaRow[]>(
    `
    SELECT pt.peasants, po.land, pt.received_at AS age
    FROM province_troops pt
    JOIN province_overview po
      ON po.province_id = pt.province_id AND po.key_hash = pt.key_hash
      AND po.land > 0 AND ${SAME_TICK("pt.received_at", "po.received_at")}
    WHERE pt.province_id = ? AND pt.key_hash = ?
      AND pt.source IN ('sot','throne') AND pt.peasants IS NOT NULL
      AND ${wc("pt", ppaP)} AND ${wc("po", ppaP)}
    ORDER BY pt.received_at DESC LIMIT 1
  `,
    ppaP as EV,
  );

  let cached_ppa: number | null = null,
    cached_ppa_age: string | null = null;
  if (ppaRow) {
    cached_ppa = rawPerAcreValue(ppaRow.peasants, ppaRow.land);
    cached_ppa_age = ppaRow.age;
  }

  // ── rTPA ─────────────────────────────────────────────────────────────────
  interface RtpaRow extends RowDataPacket {
    thieves: number;
    land: number;
    age: string;
  }
  const rtpaP: unknown[] = [provinceId, keyHash];
  const [[rtpaRow]] = await pool.execute<RtpaRow[]>(
    `
    SELECT pr.thieves, po.land, pr.received_at AS age
    FROM province_resources pr
    JOIN province_overview po
      ON po.province_id = pr.province_id AND po.key_hash = pr.key_hash
      AND po.land > 0 AND ${SAME_TICK("pr.received_at", "po.received_at")}
    WHERE pr.province_id = ? AND pr.key_hash = ? AND pr.thieves IS NOT NULL
      AND ${wc("pr", rtpaP)} AND ${wc("po", rtpaP)}
    ORDER BY pr.received_at DESC LIMIT 1
  `,
    rtpaP as EV,
  );

  let cached_rtpa: number | null = null,
    cached_rtpa_age: string | null = null;
  if (rtpaRow) {
    cached_rtpa = rawPerAcreValue(rtpaRow.thieves, rtpaRow.land);
    cached_rtpa_age = rtpaRow.age;
  }

  // ── mTPA ─────────────────────────────────────────────────────────────────
  interface MtpaRow extends RowDataPacket {
    thieves: number;
    land: number;
    race: string | null;
    honor_title: string | null;
    personality: string | null;
    crime_effect: number;
    age: string;
  }
  let cached_mtpa: number | null = null,
    cached_mtpa_age: string | null = null;

  // ── oTPA / dTPA ──────────────────────────────────────────────────────────
  interface OdtpaRow extends MtpaRow {
    thieves_dens_effect: number | null;
    watch_towers_effect: number | null;
  }
  const odtpaP: unknown[] = [provinceId, keyHash];
  const [[odtpaRow]] = await pool.execute<OdtpaRow[]>(
    `
    SELECT pr.thieves, po.land, po.race,
      COALESCE(po.honor_title, (SELECT po2.honor_title FROM province_overview po2
        WHERE po2.province_id = pr.province_id AND po2.honor_title IS NOT NULL
        ORDER BY po2.received_at DESC LIMIT 1)) AS honor_title,
      COALESCE(po.personality, (SELECT po2.personality FROM province_overview po2
        WHERE po2.province_id = pr.province_id AND po2.personality IS NOT NULL
        ORDER BY po2.received_at DESC LIMIT 1)) AS personality,
      ss.effect AS crime_effect,
      srv.thievery_effectiveness AS thieves_dens_effect,
      srv.thief_prevent_chance AS watch_towers_effect,
      pr.received_at AS age
    FROM province_resources pr
    JOIN province_overview po
      ON po.province_id = pr.province_id AND po.key_hash = pr.key_hash
      AND po.land > 0 AND ${SAME_TICK("pr.received_at", "po.received_at")}
    JOIN sos_intel si ON si.province_id = pr.province_id AND si.key_hash = pr.key_hash
      AND ${SAME_TICK("pr.received_at", "si.received_at")}
    JOIN sos_sciences ss ON ss.sos_intel_id = si.id AND ss.science = 'Crime'
    JOIN survey_intel srv ON srv.province_id = pr.province_id AND srv.key_hash = pr.key_hash
      AND ${SAME_TICK("pr.received_at", "srv.received_at")}
    WHERE pr.province_id = ? AND pr.key_hash = ? AND pr.thieves IS NOT NULL
      AND ${wc("pr", odtpaP)} AND ${wc("po", odtpaP)} AND ${wc("si", odtpaP)} AND ${wc("srv", odtpaP)}
    ORDER BY pr.received_at DESC LIMIT 1
  `,
    odtpaP as EV,
  );

  let cached_otpa: number | null = null,
    cached_otpa_age: string | null = null;
  let cached_dtpa: number | null = null,
    cached_dtpa_age: string | null = null;
  if (odtpaRow) {
    const rtpa = rawPerAcreValue(odtpaRow.thieves, odtpaRow.land);
    const mtpa = computeMtpaValue(
      rtpa,
      odtpaRow.crime_effect,
      odtpaRow.race,
      odtpaRow.honor_title,
      odtpaRow.personality,
      odtpaRow.thieves_dens_effect,
    );
    cached_mtpa = mtpa;
    if (cached_mtpa != null) cached_mtpa_age = odtpaRow.age;
    cached_otpa = computeOtpaValue(mtpa);
    if (cached_otpa != null) cached_otpa_age = odtpaRow.age;
    cached_dtpa = computeDtpaValue(mtpa, odtpaRow.watch_towers_effect);
    if (cached_dtpa != null) cached_dtpa_age = odtpaRow.age;
  }

  // ── rWPA direct ──────────────────────────────────────────────────────────
  interface RwpaDirectRow extends RowDataPacket {
    wizards: number;
    land: number;
    race: string | null;
    honor_title: string | null;
    personality: string | null;
    mana: number | null;
    age: string;
  }
  const rwpaDirP: unknown[] = [provinceId, keyHash];
  const [[rwpaDirRow]] = await pool.execute<RwpaDirectRow[]>(
    `
    SELECT pr.wizards, po.land, po.race, pr.mana,
      COALESCE(po.honor_title, (SELECT po2.honor_title FROM province_overview po2
        WHERE po2.province_id = pr.province_id AND po2.honor_title IS NOT NULL
        ORDER BY po2.received_at DESC LIMIT 1)) AS honor_title,
      COALESCE(po.personality, (SELECT po2.personality FROM province_overview po2
        WHERE po2.province_id = pr.province_id AND po2.personality IS NOT NULL
        ORDER BY po2.received_at DESC LIMIT 1)) AS personality,
      pr.received_at AS age
    FROM province_resources pr
    JOIN province_overview po
      ON po.province_id = pr.province_id AND po.key_hash = pr.key_hash
      AND po.land > 0 AND ${SAME_TICK("pr.received_at", "po.received_at")}
    WHERE pr.province_id = ? AND pr.key_hash = ? AND pr.wizards IS NOT NULL
      AND ${wc("pr", rwpaDirP)} AND ${wc("po", rwpaDirP)}
    ORDER BY pr.received_at DESC LIMIT 1
  `,
    rwpaDirP as EV,
  );

  // ── mWPA direct ──────────────────────────────────────────────────────────
  interface MwpaDirectRow extends RwpaDirectRow {
    channeling_effect: number;
  }
  const mwpaDirP: unknown[] = [provinceId, keyHash];
  const [[mwpaDirRow]] = await pool.execute<MwpaDirectRow[]>(
    `
    SELECT pr.wizards, po.land, po.race, pr.mana,
      COALESCE(po.honor_title, (SELECT po2.honor_title FROM province_overview po2
        WHERE po2.province_id = pr.province_id AND po2.honor_title IS NOT NULL
        ORDER BY po2.received_at DESC LIMIT 1)) AS honor_title,
      COALESCE(po.personality, (SELECT po2.personality FROM province_overview po2
        WHERE po2.province_id = pr.province_id AND po2.personality IS NOT NULL
        ORDER BY po2.received_at DESC LIMIT 1)) AS personality,
      ss.effect AS channeling_effect, pr.received_at AS age
    FROM province_resources pr
    JOIN province_overview po
      ON po.province_id = pr.province_id AND po.key_hash = pr.key_hash
      AND po.land > 0 AND ${SAME_TICK("pr.received_at", "po.received_at")}
    JOIN sos_intel si ON si.province_id = pr.province_id AND si.key_hash = pr.key_hash
      AND ${SAME_TICK("pr.received_at", "si.received_at")}
    JOIN sos_sciences ss ON ss.sos_intel_id = si.id AND ss.science = 'Channeling'
    WHERE pr.province_id = ? AND pr.key_hash = ? AND pr.wizards IS NOT NULL
      AND ${wc("pr", mwpaDirP)} AND ${wc("po", mwpaDirP)} AND ${wc("si", mwpaDirP)}
    ORDER BY pr.received_at DESC LIMIT 1
  `,
    mwpaDirP as EV,
  );

  // ── rWPA / mWPA back-calc ─────────────────────────────────────────────────
  interface RwpaBackRow extends RowDataPacket {
    thieves: number;
    land: number;
    networth: number;
    race: string;
    honor_title: string | null;
    personality: string | null;
    mana: number | null;
    science_total_books: number | null;
    buildings_built: number | null;
    buildings_in_progress: number | null;
    soldiers: number | null;
    off_specs: number | null;
    def_specs: number | null;
    elites: number | null;
    war_horses: number | null;
    peasants: number | null;
    money: number | null;
    prisoners: number | null;
    channeling_effect: number | null;
    age: string;
  }
  const rwpaBkP: unknown[] = [provinceId, keyHash];
  const [[rwpaBkRow]] = await pool.execute<RwpaBackRow[]>(
    `
    SELECT pr.thieves, po.land, po.networth, po.race,
      COALESCE(po.honor_title, (SELECT po2.honor_title FROM province_overview po2
        WHERE po2.province_id = pr.province_id AND po2.honor_title IS NOT NULL
        ORDER BY po2.received_at DESC LIMIT 1)) AS honor_title,
      COALESCE(po.personality, (SELECT po2.personality FROM province_overview po2
        WHERE po2.province_id = pr.province_id AND po2.personality IS NOT NULL
        ORDER BY po2.received_at DESC LIMIT 1)) AS personality,
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
      AND ${SAME_TICK("pr.received_at", "po.received_at")}
    JOIN sos_intel si ON si.province_id = pr.province_id AND si.key_hash = pr.key_hash
      AND ${SAME_TICK("pr.received_at", "si.received_at")}
    JOIN survey_intel srv ON srv.province_id = pr.province_id AND srv.key_hash = pr.key_hash
      AND ${SAME_TICK("pr.received_at", "srv.received_at")}
    JOIN province_troops pt
      ON pt.province_id = pr.province_id AND pt.key_hash = pr.key_hash
      AND pt.source IN ('sot', 'throne') AND ${SAME_TICK("pr.received_at", "pt.received_at")}
    JOIN province_resources pr_sot
      ON pr_sot.province_id = pr.province_id AND pr_sot.key_hash = pr.key_hash
      AND pr_sot.source IN ('sot', 'throne') AND ${SAME_TICK("pr.received_at", "pr_sot.received_at")}
    WHERE pr.province_id = ? AND pr.key_hash = ? AND pr.thieves IS NOT NULL
      AND ${wc("pr", rwpaBkP)} AND ${wc("po", rwpaBkP)} AND ${wc("si", rwpaBkP)}
      AND ${wc("srv", rwpaBkP)} AND ${wc("pt", rwpaBkP)} AND ${wc("pr_sot", rwpaBkP)}
    ORDER BY pr.received_at DESC LIMIT 1
  `,
    rwpaBkP as EV,
  );

  // ── Compute rWPA / mWPA ───────────────────────────────────────────────────
  let cached_rwpa: number | null = null,
    cached_rwpa_age: string | null = null;
  let cached_mwpa: number | null = null,
    cached_mwpa_age: string | null = null;

  if (rwpaDirRow) {
    cached_rwpa = rawPerAcreValue(rwpaDirRow.wizards, rwpaDirRow.land);
    cached_rwpa_age = rwpaDirRow.age;
    if (mwpaDirRow) {
      cached_mwpa = computeMwpaValue(
        cached_rwpa,
        mwpaDirRow.channeling_effect,
        mwpaDirRow.race,
        mwpaDirRow.honor_title,
        mwpaDirRow.personality,
        mwpaDirRow.mana,
      );
      cached_mwpa_age = mwpaDirRow.age;
    }
  } else if (rwpaBkRow) {
    const wiz = computeWizardCount(rwpaBkRow);
    if (wiz != null) {
      cached_rwpa = rawPerAcreValue(wiz, rwpaBkRow.land);
      cached_rwpa_age = rwpaBkRow.age;
      cached_mwpa = computeMwpaValue(
        cached_rwpa,
        rwpaBkRow.channeling_effect,
        rwpaBkRow.race,
        rwpaBkRow.honor_title,
        rwpaBkRow.personality,
        rwpaBkRow.mana,
      );
      if (cached_mwpa != null) cached_mwpa_age = rwpaBkRow.age;
    }
  }

  // ── Persist ───────────────────────────────────────────────────────────────
  await pool.execute(
    `UPDATE provinces SET
      cached_ppa=COALESCE(?, cached_ppa), cached_ppa_age=COALESCE(?, cached_ppa_age),
      cached_rtpa=COALESCE(?, cached_rtpa), cached_rtpa_age=COALESCE(?, cached_rtpa_age),
      cached_mtpa=COALESCE(?, cached_mtpa), cached_mtpa_age=COALESCE(?, cached_mtpa_age),
      cached_otpa=COALESCE(?, cached_otpa), cached_otpa_age=COALESCE(?, cached_otpa_age),
      cached_dtpa=COALESCE(?, cached_dtpa), cached_dtpa_age=COALESCE(?, cached_dtpa_age),
      cached_rwpa=COALESCE(?, cached_rwpa), cached_rwpa_age=COALESCE(?, cached_rwpa_age),
      cached_mwpa=COALESCE(?, cached_mwpa), cached_mwpa_age=COALESCE(?, cached_mwpa_age)
    WHERE id=?`,
    [
      cached_ppa,
      cached_ppa_age,
      cached_rtpa,
      cached_rtpa_age,
      cached_mtpa,
      cached_mtpa_age,
      cached_otpa,
      cached_otpa_age,
      cached_dtpa,
      cached_dtpa_age,
      cached_rwpa,
      cached_rwpa_age,
      cached_mwpa,
      cached_mwpa_age,
      provinceId,
    ],
  );
}

const {
  queue: queueMetricsCacheRefresh,
  flush: flushMetricsCacheRefreshQueue,
  setEnabled: setMetricsCacheRefreshEnabled,
} = createMetricsCacheQueue(mysqlUpdateMetricsCache);
export { flushMetricsCacheRefreshQueue, setMetricsCacheRefreshEnabled };

// ── Store functions ───────────────────────────────────────────────────────────

export async function storeSoS(
  data: SoSData,
  savedBy: string,
  keyHash: string,
  isSelf = false,
  receivedAt?: string,
): Promise<void> {
  await ensureReady();
  const src = isSelf ? "council_science" : "sos";
  await withTransaction(async (conn) => {
    const provId = await ensureProvince(conn, data.name, data.kingdom);
    await recordSubmission(conn, keyHash, provId);

    const [result] = (await conn.execute(
      `INSERT IGNORE INTO sos_intel (province_id, key_hash, source, saved_by, accuracy, received_at)
       VALUES (?, ?, ?, ?, ?, COALESCE(?, NOW()))`,
      [provId, keyHash, src, savedBy, data.accuracy, receivedAt ?? null],
    )) as [ResultSetHeader, unknown];
    if (result.affectedRows === 0) return;

    const sosId = result.insertId;
    for (const s of data.sciences) {
      await conn.execute(
        "INSERT INTO sos_sciences (sos_intel_id, science, books, effect) VALUES (?, ?, ?, ?)",
        [sosId, s.science, s.books, s.effect],
      );
    }
    queueMetricsCacheRefresh(provId, keyHash, receivedAt);
  });
}

export async function storeSorcery(
  data: SorceryData,
  savedBy: string,
  keyHash: string,
  receivedAt?: string,
  gameDate?: GameDateStamp,
  source?: string,
): Promise<void> {
  await ensureReady();
  await withTransaction(async (conn) => {
    const provId = await ensureProvince(conn, data.name, "");
    await recordSubmission(conn, keyHash, provId);
    const [result] = (await conn.execute(
      `INSERT IGNORE INTO sorcery_ops
         (province_id, key_hash, spell, outcome, runes_spent, wizards_lost,
          duration_days, target_name, target_slot, target_kingdom,
          target_game_id, wizards, runes, mana,
          game_date, game_date_ord, saved_by, source, received_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, NOW()))`,
      [
        provId,
        keyHash,
        data.spell,
        data.outcome,
        data.runesSpent,
        data.wizardsLost,
        data.durationDays,
        data.targetName,
        data.targetSlot,
        data.targetKingdom,
        data.targetGameId,
        data.wizards,
        data.runes,
        data.mana,
        gameDate?.gameDate ?? null,
        gameDate?.gameDateOrd ?? null,
        savedBy,
        source ?? null,
        receivedAt ?? null,
      ],
    )) as [ResultSetHeader, unknown];
    if (result.affectedRows === 0) {
      await backfillOpGameDate(
        conn,
        "sorcery_ops",
        provId,
        keyHash,
        receivedAt,
        gameDate,
      );
      return;
    }

    if (data.wizards != null || data.runes != null) {
      await conn.execute(
        `INSERT IGNORE INTO province_resources
           (province_id, key_hash, wizards, runes, mana, source, saved_by, accuracy, received_at)
         VALUES (?, ?, ?, ?, ?, 'sorcery', ?, 100, COALESCE(?, NOW()))`,
        [
          provId,
          keyHash,
          data.wizards,
          data.runes,
          data.mana,
          savedBy,
          receivedAt ?? null,
        ],
      );
    }

    if (
      data.targetGameId != null &&
      data.targetName != null &&
      data.targetKingdom != null
    ) {
      await conn.execute(
        "UPDATE IGNORE provinces SET external_id = ? WHERE name = ? AND kingdom = ? AND external_id IS NULL",
        [data.targetGameId, data.targetName, data.targetKingdom],
      );
    }
  });
}

export async function storeRob(
  data: RobData,
  savedBy: string,
  keyHash: string,
  receivedAt?: string,
  gameDate?: GameDateStamp,
  source?: string,
): Promise<void> {
  await ensureReady();
  await withTransaction(async (conn) => {
    const provId = await ensureProvince(conn, data.name, "");
    await recordSubmission(conn, keyHash, provId);
    const [result] = (await conn.execute(
      `INSERT INTO rob_ops
         (province_id, key_hash, op, target_name, target_slot, target_kingdom,
          outcome, amount_stolen, thieves_lost, thieves, stealth,
          troops_assassinated, kidnapped, acres_burned, arson_building,
          effect_duration, deserters, deserter_type, wizards_assassinated,
          prisoners_freed, prisoners_captured, target_game_id, thieves_sent,
          game_date, game_date_ord, saved_by, source, received_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, NOW()))
       ON DUPLICATE KEY UPDATE
         acres_burned   = COALESCE(acres_burned,   VALUES(acres_burned)),
         arson_building = COALESCE(arson_building, VALUES(arson_building)),
         target_game_id = COALESCE(target_game_id, VALUES(target_game_id)),
         thieves_sent   = COALESCE(thieves_sent,   VALUES(thieves_sent)),
         source         = COALESCE(source,         VALUES(source))`,
      [
        provId,
        keyHash,
        data.op,
        data.targetName,
        data.targetSlot,
        data.targetKingdom,
        data.outcome,
        data.amountStolen,
        data.thievesLost,
        data.thieves,
        data.stealth,
        data.troopsAssassinated,
        data.kidnapped,
        data.acresBurned,
        data.arsonBuilding,
        data.effectDuration,
        data.deserters,
        data.deserterType,
        data.wizardsAssassinated,
        data.prisonersFreed,
        data.prisonersCaptured,
        data.targetGameId,
        data.thievesSent,
        gameDate?.gameDate ?? null,
        gameDate?.gameDateOrd ?? null,
        savedBy,
        source ?? null,
        receivedAt ?? null,
      ],
    )) as [ResultSetHeader, unknown];
    if (result.affectedRows !== 1) {
      await backfillOpGameDate(
        conn,
        "rob_ops",
        provId,
        keyHash,
        receivedAt,
        gameDate,
      );
      return;
    }

    if (data.thieves != null) {
      await conn.execute(
        `INSERT IGNORE INTO province_resources
           (province_id, key_hash, thieves, source, saved_by, accuracy, received_at)
         VALUES (?, ?, ?, 'rob', ?, 100, COALESCE(?, NOW()))`,
        [provId, keyHash, data.thieves, savedBy, receivedAt ?? null],
      );
    }

    if (
      data.targetGameId != null &&
      data.targetName != null &&
      data.targetKingdom != null
    ) {
      await conn.execute(
        "UPDATE IGNORE provinces SET external_id = ? WHERE name = ? AND kingdom = ? AND external_id IS NULL",
        [data.targetGameId, data.targetName, data.targetKingdom],
      );
    }
  });
}

export async function storeAttack(
  data: AttackData,
  savedBy: string,
  keyHash: string,
  receivedAt?: string,
  gameDate?: GameDateStamp,
  source?: string,
): Promise<void> {
  await ensureReady();
  await withTransaction(async (conn) => {
    const provId = await ensureProvince(conn, data.name, "");
    await recordSubmission(conn, keyHash, provId);
    const [result] = (await conn.execute(
      `INSERT IGNORE INTO attack_ops
         (province_id, key_hash, attack_type, outcome, target_name, target_kingdom,
          acres_taken, buildings_survived, specialist_credits, peasants_settled,
          massacred, enemy_killed, enemy_imprisoned, return_days,
          game_date, game_date_ord, saved_by, source, received_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, NOW()))`,
      [
        provId,
        keyHash,
        data.attackType,
        data.outcome,
        data.targetName,
        data.targetKingdom,
        data.acresTaken,
        data.buildingsSurvived,
        data.specialistCredits,
        data.peasantsSettled,
        data.massacred,
        data.enemyKilled,
        data.enemyImprisoned,
        data.returnDays,
        gameDate?.gameDate ?? null,
        gameDate?.gameDateOrd ?? null,
        savedBy,
        source ?? null,
        receivedAt ?? null,
      ],
    )) as [ResultSetHeader, unknown];
    if (result.affectedRows === 0) {
      await backfillOpGameDate(
        conn,
        "attack_ops",
        provId,
        keyHash,
        receivedAt,
        gameDate,
      );
    }
  });
}

export async function storeTrainArmy(
  data: TrainArmyData,
  savedBy: string,
  keyHash: string,
  receivedAt?: string,
): Promise<void> {
  await ensureReady();
  await withTransaction(async (conn) => {
    const provId = await ensureProvince(conn, data.name, data.kingdom);
    await recordSubmission(conn, keyHash, provId);
    await conn.execute(
      `INSERT IGNORE INTO province_resources
         (province_id, key_hash, free_specialist_credits, source, saved_by, accuracy, received_at)
       VALUES (?, ?, ?, 'train_army', ?, 100, COALESCE(?, NOW()))`,
      [
        provId,
        keyHash,
        data.freeSpecialistCredits,
        savedBy,
        receivedAt ?? null,
      ],
    );
  });
}

export async function storeBuild(
  data: BuildData,
  savedBy: string,
  keyHash: string,
  receivedAt?: string,
): Promise<void> {
  await ensureReady();
  await withTransaction(async (conn) => {
    const provId = await ensureProvince(conn, data.name, data.kingdom);
    await recordSubmission(conn, keyHash, provId);
    await conn.execute(
      `INSERT IGNORE INTO province_resources
         (province_id, key_hash, free_building_credits, source, saved_by, accuracy, received_at)
       VALUES (?, ?, ?, 'build', ?, 100, COALESCE(?, NOW()))`,
      [provId, keyHash, data.freeBuildingCredits, savedBy, receivedAt ?? null],
    );
  });
}

export async function storeInfiltrate(
  data: InfiltrateData,
  savedBy: string,
  keyHash: string,
  receivedAt?: string,
): Promise<void> {
  await ensureReady();
  await withTransaction(async (conn) => {
    const provId = await ensureProvince(conn, data.name, data.kingdom);
    await recordSubmission(conn, keyHash, provId);
    await conn.execute(
      `INSERT IGNORE INTO province_resources
         (province_id, key_hash, thieves, source, saved_by, accuracy, received_at)
       VALUES (?, ?, ?, 'infiltrate', ?, ?, COALESCE(?, NOW()))`,
      [
        provId,
        keyHash,
        data.thieves,
        savedBy,
        data.accuracy,
        receivedAt ?? null,
      ],
    );
    queueMetricsCacheRefresh(provId, keyHash, receivedAt);
  });
}

export async function storeSoD(
  data: SoDData,
  savedBy: string,
  keyHash: string,
  receivedAt?: string,
): Promise<void> {
  await ensureReady();
  await withTransaction(async (conn) => {
    const provId = await ensureProvince(conn, data.name, data.kingdom);
    await recordSubmission(conn, keyHash, provId);
    await conn.execute(
      `INSERT IGNORE INTO home_military_points
         (province_id, key_hash, mod_off_at_home, mod_def_at_home, source, saved_by, accuracy, received_at)
       VALUES (?, ?, NULL, ?, 'sod', ?, ?, COALESCE(?, NOW()))`,
      [
        provId,
        keyHash,
        data.defPoints,
        savedBy,
        data.accuracy,
        receivedAt ?? null,
      ],
    );
  });
}

async function resolveIntelOpTarget(
  conn: PoolConnection,
  data: IntelOpAttempt,
  keyHash: string,
): Promise<{
  targetName: string | null;
  targetSlot: number | null;
  targetKingdom: string | null;
}> {
  interface NameRow extends RowDataPacket {
    name: string;
  }
  interface SlotRow extends RowDataPacket {
    slot: number | null;
  }

  let targetName = data.targetName;
  let targetSlot = data.targetSlot;
  const targetKingdom = data.targetKingdom;

  if (targetKingdom && targetName == null && targetSlot != null) {
    const [rows] = await conn.execute<NameRow[]>(
      `SELECT kp.name
       FROM kingdom_provinces kp
       JOIN kingdom_intel ki ON ki.id = kp.kingdom_intel_id
       WHERE ki.key_hash = ? AND ki.location = ? AND kp.slot = ?
       ORDER BY ki.received_at DESC, ki.id DESC
       LIMIT 1`,
      [keyHash, targetKingdom, targetSlot],
    );
    targetName = rows[0]?.name ?? null;
  }

  if (targetKingdom && targetSlot == null && targetName) {
    const [rows] = await conn.execute<SlotRow[]>(
      `SELECT kp.slot
       FROM kingdom_provinces kp
       JOIN kingdom_intel ki ON ki.id = kp.kingdom_intel_id
       WHERE ki.key_hash = ? AND ki.location = ? AND kp.name = ?
       ORDER BY ki.received_at DESC, ki.id DESC
       LIMIT 1`,
      [keyHash, targetKingdom, targetName],
    );
    targetSlot = rows[0]?.slot ?? null;
  }

  return { targetName, targetSlot, targetKingdom };
}

export async function storeIntelOp(
  data: IntelOpAttempt,
  savedBy: string,
  keyHash: string,
  receivedAt?: string,
  gameDate?: GameDateStamp,
): Promise<void> {
  await ensureReady();
  await withTransaction(async (conn) => {
    const provId = await ensureProvince(conn, savedBy, "");
    await recordSubmission(conn, keyHash, provId);
    const target = await resolveIntelOpTarget(conn, data, keyHash);
    const [result] = (await conn.execute(
      `INSERT IGNORE INTO intel_ops
         (province_id, key_hash, op, intel_type, outcome,
          target_name, target_slot, target_kingdom, accuracy, thieves_lost,
          game_date, game_date_ord, saved_by, received_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, NOW()))`,
      [
        provId,
        keyHash,
        data.op,
        data.intelType,
        data.outcome,
        target.targetName,
        target.targetSlot,
        target.targetKingdom,
        data.accuracy,
        data.thievesLost,
        gameDate?.gameDate ?? null,
        gameDate?.gameDateOrd ?? null,
        savedBy,
        receivedAt ?? null,
      ],
    )) as [ResultSetHeader, unknown];
    if (result.affectedRows === 0) {
      await backfillOpGameDate(
        conn,
        "intel_ops",
        provId,
        keyHash,
        receivedAt,
        gameDate,
      );
    }
  });
}

export async function storeKingdom(
  data: KingdomData,
  savedBy: string,
  keyHash: string,
  receivedAt?: string,
): Promise<void> {
  await ensureReady();
  await withTransaction(async (conn) => {
    const [result] = (await conn.execute(
      `INSERT IGNORE INTO kingdom_intel (
         key_hash, name, location, kingdom_title, total_networth, total_land, total_honor,
         wars_won, war_losses, networth_rank, land_rank, honor_rank, war_target,
         their_attitude_to_us, their_attitude_points,
         our_attitude_to_them, our_attitude_points,
         hostility_meter_visible_until, open_relations_json, war_doctrines_json, saved_by, received_at
       )
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, NOW()))`,
      [
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
      ],
    )) as [ResultSetHeader, unknown];
    if (result.affectedRows === 0) return;

    const kdId = result.insertId;
    for (const p of data.provinces) {
      const provId = await ensureProvince(conn, p.name, data.location);
      await recordSubmission(conn, keyHash, provId);
      await conn.execute(
        "INSERT INTO kingdom_provinces (kingdom_intel_id, slot, name, race, land, networth, honor_title) VALUES (?, ?, ?, ?, ?, ?, ?)",
        [kdId, p.slot, p.name, p.race, p.land, p.networth, p.honorTitle],
      );
      await conn.execute(
        `INSERT IGNORE INTO province_overview
           (province_id, key_hash, race, personality, honor_title, land, networth, source, saved_by, received_at)
         VALUES (?, ?, ?, NULL, ?, ?, ?, 'kingdom', ?, COALESCE(?, NOW()))`,
        [
          provId,
          keyHash,
          p.race,
          p.honorTitle,
          p.land,
          p.networth,
          savedBy,
          receivedAt ?? null,
        ],
      );
    }
  });
}

export async function storeState(
  data: StateData,
  savedBy: string,
  keyHash: string,
  receivedAt?: string,
): Promise<void> {
  await ensureReady();
  await withTransaction(async (conn) => {
    const provId = await ensureProvince(conn, data.name, data.kingdom);
    await recordSubmission(conn, keyHash, provId);

    await conn.execute(
      `INSERT IGNORE INTO province_overview
         (province_id, key_hash, land, networth, source, saved_by, accuracy, received_at)
       VALUES (?, ?, ?, ?, 'state', ?, 100, COALESCE(?, NOW()))`,
      [provId, keyHash, data.land, data.networth, savedBy, receivedAt ?? null],
    );

    await conn.execute(
      `INSERT IGNORE INTO province_resources
         (province_id, key_hash, thieves, wizards, total_pop, max_pop, source, saved_by, accuracy, received_at)
       VALUES (?, ?, ?, ?, ?, ?, 'state', ?, 100, COALESCE(?, NOW()))`,
      [
        provId,
        keyHash,
        data.thieves,
        data.wizards,
        data.totalPop ?? null,
        data.maxPop ?? null,
        savedBy,
        receivedAt ?? null,
      ],
    );

    await conn.execute(
      `INSERT IGNORE INTO province_troops
         (province_id, key_hash, peasants, source, saved_by, accuracy, received_at)
       VALUES (?, ?, ?, 'state', ?, 100, COALESCE(?, NOW()))`,
      [provId, keyHash, data.peasants, savedBy, receivedAt ?? null],
    );
    queueMetricsCacheRefresh(provId, keyHash, receivedAt);
  });
}

export async function storeSoT(
  data: SoTData,
  savedBy: string,
  keyHash: string,
  isSelfThrone = false,
  receivedAt?: string,
): Promise<void> {
  await ensureReady();
  const src = isSelfThrone ? "throne" : "sot";
  await withTransaction(async (conn) => {
    const provId = await ensureProvince(conn, data.name, data.kingdom);
    await recordSubmission(conn, keyHash, provId);

    if (isSelfThrone && data.kingdom) {
      await bindKeyToKingdom(conn, keyHash, data.kingdom, "throne");
      // MySQL cannot UPDATE and SELECT the same table in a subquery directly;
      // wrap in a derived table to work around the restriction.
      await conn.execute(
        `UPDATE kingdom_intel SET war_target = ?
         WHERE id = (
           SELECT id FROM (
             SELECT id FROM kingdom_intel WHERE location = ? AND key_hash = ? ORDER BY id DESC LIMIT 1
           ) AS _tmp
         )`,
        [data.warTarget ?? null, data.kingdom, keyHash],
      );
    }

    // 1. Overview
    await conn.execute(
      `INSERT IGNORE INTO province_overview
         (province_id, key_hash, race, personality, honor_title, ruler, land, networth, source, saved_by, accuracy, received_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, NOW()))`,
      [
        provId,
        keyHash,
        data.race,
        data.personality ?? null,
        data.honorTitle ?? null,
        data.ruler ?? null,
        data.land,
        data.networth,
        src,
        savedBy,
        data.accuracy,
        receivedAt ?? null,
      ],
    );

    // 2. Total military points
    await conn.execute(
      `INSERT IGNORE INTO total_military_points
         (province_id, key_hash, off_points, def_points, source, saved_by, accuracy, received_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, COALESCE(?, NOW()))`,
      [
        provId,
        keyHash,
        data.offPoints,
        data.defPoints,
        src,
        savedBy,
        data.accuracy,
        receivedAt ?? null,
      ],
    );

    // 3. Troops at home
    await conn.execute(
      `INSERT IGNORE INTO province_troops
         (province_id, key_hash, soldiers, off_specs, def_specs, elites, war_horses, peasants, source, saved_by, accuracy, received_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, NOW()))`,
      [
        provId,
        keyHash,
        data.soldiers,
        data.offSpecs,
        data.defSpecs,
        data.elites,
        data.warHorses,
        data.peasants,
        src,
        savedBy,
        data.accuracy,
        receivedAt ?? null,
      ],
    );

    // 4. Resources
    await conn.execute(
      `INSERT IGNORE INTO province_resources
         (province_id, key_hash, money, food, runes, prisoners, trade_balance, building_efficiency, thieves, stealth, wizards, mana, source, saved_by, accuracy, received_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, NOW()))`,
      [
        provId,
        keyHash,
        data.money,
        data.food,
        data.runes,
        data.prisoners,
        data.tradeBalance,
        data.buildingEfficiency,
        data.thieves,
        data.stealth,
        data.wizards,
        data.mana,
        src,
        savedBy,
        data.accuracy,
        receivedAt ?? null,
      ],
    );

    // 5. Status
    await conn.execute(
      `INSERT IGNORE INTO province_status
         (province_id, kingdom, key_hash, plagued, overpopulated, overpop_deserters, dragon_type, dragon_name, hit_status, war, source, saved_by, received_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, NOW()))`,
      [
        provId,
        data.kingdom,
        keyHash,
        data.plagued ? 1 : 0,
        data.overpopulated ? 1 : 0,
        data.overpopDeserters ?? null,
        data.dragonType ?? null,
        data.dragonName ?? null,
        data.hitStatus,
        data.war ? 1 : 0,
        src,
        savedBy,
        receivedAt ?? null,
      ],
    );

    // 6. Active effects
    for (const effect of data.activeEffects) {
      await conn.execute(
        `INSERT IGNORE INTO province_effects
           (province_id, key_hash, effect_name, effect_kind, duration_text, remaining_ticks, effectiveness_percent, source, saved_by, received_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, NOW()))`,
        [
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
        ],
      );
    }

    // 7. Armies out (self-throne only)
    if (isSelfThrone && data.armiesOut?.length) {
      const [milResult] = (await conn.execute(
        `INSERT IGNORE INTO military_intel
           (province_id, key_hash, ome, dme, source, saved_by, accuracy, received_at)
         VALUES (?, ?, NULL, NULL, 'throne', ?, ?, COALESCE(?, NOW()))`,
        [provId, keyHash, savedBy, data.accuracy, receivedAt ?? null],
      )) as [ResultSetHeader, unknown];
      if (milResult.affectedRows === 0) return;
      const milId = milResult.insertId;
      for (let i = 0; i < data.armiesOut.length; i++) {
        const a = data.armiesOut[i];
        await conn.execute(
          "INSERT INTO som_armies (military_intel_id, army_type, land_gained, return_days) VALUES (?, ?, ?, ?)",
          [milId, `out_${i + 1}`, a.acres, a.daysLeft],
        );
      }
    }
    queueMetricsCacheRefresh(provId, keyHash, receivedAt);
  });
}

export async function storeSoM(
  data: SoMData,
  savedBy: string,
  keyHash: string,
  isSelf = false,
  receivedAt?: string,
): Promise<void> {
  await ensureReady();
  const src = isSelf ? "council_military" : "som";
  await withTransaction(async (conn) => {
    const provId = await ensureProvince(conn, data.name, data.kingdom);
    await recordSubmission(conn, keyHash, provId);

    const homeArmy = data.armies.find((a) => a.armyType === "home");
    if (homeArmy) {
      await conn.execute(
        `INSERT IGNORE INTO province_troops
           (province_id, key_hash, soldiers, off_specs, def_specs, elites, war_horses, peasants, source, saved_by, accuracy, received_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, COALESCE(?, NOW()))`,
        [
          provId,
          keyHash,
          homeArmy.soldiers,
          homeArmy.offSpecs,
          homeArmy.defSpecs,
          homeArmy.elites,
          homeArmy.warHorses,
          src,
          savedBy,
          data.accuracy,
          receivedAt ?? null,
        ],
      );
    }

    await conn.execute(
      `INSERT IGNORE INTO home_military_points
         (province_id, key_hash, mod_off_at_home, mod_def_at_home, source, saved_by, accuracy, received_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, COALESCE(?, NOW()))`,
      [
        provId,
        keyHash,
        data.netOffense,
        data.netDefense,
        src,
        savedBy,
        data.accuracy,
        receivedAt ?? null,
      ],
    );

    const [result] = (await conn.execute(
      `INSERT IGNORE INTO military_intel
         (province_id, key_hash, ome, dme, source, saved_by, accuracy, received_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, COALESCE(?, NOW()))`,
      [
        provId,
        keyHash,
        data.ome,
        data.dme,
        src,
        savedBy,
        data.accuracy,
        receivedAt ?? null,
      ],
    )) as [ResultSetHeader, unknown];
    if (result.affectedRows === 0) return;

    const milIntelId = result.insertId;
    for (const a of data.armies) {
      await conn.execute(
        `INSERT INTO som_armies
           (military_intel_id, army_type, generals, soldiers, off_specs, def_specs, elites, war_horses, thieves, land_gained, return_days)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          milIntelId,
          a.armyType,
          a.generals,
          a.soldiers,
          a.offSpecs,
          a.defSpecs,
          a.elites,
          a.warHorses,
          a.thieves,
          a.landGained,
          a.returnDays,
        ],
      );
    }
  });
}

export async function storeSurvey(
  data: SurveyData,
  savedBy: string,
  keyHash: string,
  isSelf = false,
  receivedAt?: string,
): Promise<void> {
  await ensureReady();
  const src = isSelf ? "council_internal" : "survey";
  await withTransaction(async (conn) => {
    const provId = await ensureProvince(conn, data.name, data.kingdom);
    await recordSubmission(conn, keyHash, provId);

    const [result] = (await conn.execute(
      `INSERT IGNORE INTO survey_intel
         (province_id, key_hash, source, saved_by, accuracy,
          thievery_effectiveness, thief_prevent_chance, castles_effect, received_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, NOW()))`,
      [
        provId,
        keyHash,
        src,
        savedBy,
        data.accuracy,
        data.thieveryEffectiveness ?? null,
        data.thiefPreventChance ?? null,
        data.castlesEffect ?? null,
        receivedAt ?? null,
      ],
    )) as [ResultSetHeader, unknown];
    if (result.affectedRows === 0) return;

    const surveyId = result.insertId;
    for (const b of data.buildings) {
      await conn.execute(
        "INSERT INTO survey_buildings (survey_intel_id, building, built, in_progress) VALUES (?, ?, ?, ?)",
        [surveyId, b.building, b.built, b.inProgress],
      );
    }
    queueMetricsCacheRefresh(provId, keyHash, receivedAt);
  });
}

export async function getBoundKingdom(keyHash: string): Promise<string | null> {
  await ensureReady();
  interface BindRow extends RowDataPacket {
    kingdom: string;
  }
  const [rows] = await pool.execute<BindRow[]>(
    "SELECT kingdom FROM key_kingdom_bindings WHERE key_hash = ?",
    [keyHash],
  );
  return rows[0]?.kingdom ?? null;
}

export async function storeKingdomNews(
  data: KingdomNewsData,
  keyHash: string,
  isSnatched = false,
  receivedAt?: string,
  urlKingdom?: string | null,
): Promise<void> {
  await ensureReady();

  let kingdom: string | null;
  if (isSnatched) {
    kingdom = data.targetKingdom ?? urlKingdom ?? null;
  } else {
    kingdom = await getBoundKingdom(keyHash);
  }
  if (!kingdom) return;

  await withTransaction(async (conn) => {
    for (const e of data.events) {
      await conn.execute(
        `INSERT IGNORE INTO kingdom_news_sharded (
           key_hash, kingdom, game_date, game_date_ord, event_type, raw_text,
           attacker_name, attacker_kingdom,
           defender_name, defender_kingdom,
           acres, books,
           sender_name, receiver_name,
           relation_kingdom,
           dragon_type, dragon_name,
           received_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, NOW()))`,
        [
          keyHash,
          kingdom,
          e.gameDate,
          parseUtopiaDate(e.gameDate),
          e.eventType,
          e.rawText,
          e.attackerName,
          e.attackerKingdom,
          e.defenderName,
          e.defenderKingdom,
          e.acres,
          e.books,
          e.senderName,
          e.receiverName,
          e.relationKingdom,
          e.dragonType,
          e.dragonName,
          receivedAt ?? null,
        ],
      );
    }
  });
}

export async function storeProvinceNews(
  data: ProvinceNewsData,
  savedBy: string,
  keyHash: string,
  receivedAt?: string,
): Promise<void> {
  await ensureReady();
  const kingdom = await getBoundKingdom(keyHash);
  if (!kingdom) return;
  await withTransaction(async (conn) => {
    const provinceId = await ensureProvince(conn, savedBy, kingdom);
    await recordSubmission(conn, keyHash, provinceId);
    for (const e of data.events) {
      const rawHash = createHash("sha256").update(e.rawText).digest("hex");
      await conn.execute(
        `INSERT IGNORE INTO province_news (
           province_id, key_hash, game_date, game_date_ord, event_type, raw_text, raw_hash,
           actor_name, actor_kingdom, amount, resource_type, received_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, NOW()))`,
        [
          provinceId,
          keyHash,
          e.gameDate,
          parseUtopiaDate(e.gameDate),
          e.eventType,
          e.rawText,
          rawHash,
          e.actorName,
          e.actorKingdom,
          e.amount,
          e.resourceType ?? "",
          receivedAt ?? null,
        ],
      );
    }
  });
}

// ── Read functions ────────────────────────────────────────────────────────────

export async function getLatestKingdomSnapshot(
  location: string,
  keyHash: string,
): Promise<KingdomSnapshot | null> {
  await ensureReady();
  interface SnapRow extends RowDataPacket {
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
  }
  interface KpRow extends RowDataPacket {
    slot: number | null;
    name: string;
    race: string;
    land: number;
    networth: number;
    honor_title: string | null;
  }

  const [snapRows] = await pool.execute<SnapRow[]>(
    `SELECT ki.id, ki.name, ki.location, ki.kingdom_title,
            ki.total_networth, ki.total_land, ki.total_honor, ki.wars_won, ki.war_losses,
            ki.networth_rank, ki.land_rank, ki.honor_rank, ki.war_target,
            ki.their_attitude_to_us, ki.their_attitude_points,
            ki.our_attitude_to_them, ki.our_attitude_points,
            ki.hostility_meter_visible_until, ki.open_relations_json, ki.war_doctrines_json,
            ki.received_at
     FROM kingdom_intel ki
     WHERE ki.location = ? AND ki.key_hash = ?
     ORDER BY ki.received_at DESC, ki.id DESC
     LIMIT 1`,
    [location, keyHash],
  );
  if (snapRows.length === 0) return null;
  const snap = snapRows[0];

  const [provRows] = await pool.execute<KpRow[]>(
    `SELECT slot, name, race, land, networth, honor_title
     FROM kingdom_provinces
     WHERE kingdom_intel_id = ?
     ORDER BY networth DESC, name ASC`,
    [snap.id],
  );

  return {
    id: snap.id,
    name: snap.name,
    location: snap.location,
    kingdomTitle: snap.kingdom_title,
    totalNetworth: snap.total_networth,
    totalLand: snap.total_land,
    totalHonor: snap.total_honor,
    warsWon: snap.wars_won,
    warLosses: snap.war_losses,
    networthRank: snap.networth_rank,
    landRank: snap.land_rank,
    honorRank: snap.honor_rank,
    warTarget: snap.war_target,
    theirAttitudeToUs: snap.their_attitude_to_us,
    theirAttitudePoints: snap.their_attitude_points,
    ourAttitudeToThem: snap.our_attitude_to_them,
    ourAttitudePoints: snap.our_attitude_points,
    hostilityMeterVisibleUntil: snap.hostility_meter_visible_until,
    openRelations: snap.open_relations_json
      ? JSON.parse(snap.open_relations_json)
      : [],
    warDoctrines: snap.war_doctrines_json
      ? JSON.parse(snap.war_doctrines_json)
      : [],
    receivedAt: snap.received_at,
    provinces: provRows.map((p) => ({
      slot: p.slot,
      name: p.name,
      race: p.race,
      land: p.land,
      networth: p.networth,
      honorTitle: p.honor_title,
    })),
  };
}

export async function getKingdomSnapshotHistory(
  location: string,
  keyHash: string,
): Promise<KingdomSnapshotHistoryPoint[]> {
  await ensureReady();
  interface HistRow extends RowDataPacket {
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
  }

  const [rows] = await pool.execute<HistRow[]>(
    `SELECT ki.id, ki.name, ki.location, ki.kingdom_title,
            ki.total_networth, ki.total_land, ki.total_honor, ki.wars_won, ki.war_losses,
            ki.networth_rank, ki.land_rank, ki.honor_rank, ki.received_at
     FROM kingdom_intel ki
     WHERE ki.location = ?
       AND (ki.total_networth IS NOT NULL OR ki.total_land IS NOT NULL OR ki.total_honor IS NOT NULL)
       AND ki.key_hash = ?
     ORDER BY ki.received_at ASC, ki.id ASC`,
    [location, keyHash],
  );

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
}

export async function getKingdomRitual(
  kingdom: string,
  keyHash: string,
): Promise<KingdomRitual | null> {
  await ensureReady();
  interface ObsRow extends RowDataPacket {
    received_at: string;
  }
  interface RitRow extends RowDataPacket {
    effect_name: string;
    remaining_ticks: number | null;
    effectiveness_percent: number | null;
    received_at: string;
  }

  const [obsRows] = await pool.execute<ObsRow[]>(
    `SELECT ps.received_at
     FROM province_status ps
     WHERE ps.kingdom = ? AND ps.key_hash = ? AND ps.source IN ('sot', 'throne')
     ORDER BY ps.received_at DESC, ps.id DESC
     LIMIT 1`,
    [kingdom, keyHash],
  );

  const [ritRows] = await pool.execute<RitRow[]>(
    `SELECT pe.effect_name, pe.remaining_ticks, pe.effectiveness_percent, pe.received_at
     FROM province_effects pe
     JOIN provinces p ON p.id = pe.province_id
     WHERE p.kingdom = ? AND pe.key_hash = ? AND pe.effect_kind = 'ritual'
     ORDER BY pe.received_at DESC, pe.id DESC
     LIMIT 1`,
    [kingdom, keyHash],
  );

  if (ritRows.length === 0) return null;
  const row = ritRows[0];
  const latestObs = obsRows[0];
  if (latestObs && latestObs.received_at > row.received_at) return null;
  return {
    name: row.effect_name,
    remainingTicks: row.remaining_ticks,
    effectivenessPercent: row.effectiveness_percent,
    receivedAt: row.received_at,
  };
}

export async function getKingdomDragon(
  kingdom: string,
  keyHash: string,
): Promise<KingdomDragon | null> {
  await ensureReady();
  interface DragRow extends RowDataPacket {
    dragon_type: string | null;
    dragon_name: string | null;
    received_at: string;
  }

  const [rows] = await pool.execute<DragRow[]>(
    `SELECT ps.dragon_type, ps.dragon_name, ps.received_at
     FROM province_status ps
     WHERE ps.kingdom = ? AND ps.key_hash = ? AND ps.source IN ('sot', 'throne')
     ORDER BY ps.received_at DESC, ps.id DESC
     LIMIT 1`,
    [kingdom, keyHash],
  );

  if (rows.length === 0 || !rows[0].dragon_type || !rows[0].dragon_name)
    return null;
  return {
    dragonType: rows[0].dragon_type,
    dragonName: rows[0].dragon_name,
    receivedAt: rows[0].received_at,
  };
}

export async function getLatestWarDate(
  kingdom: string,
  keyHash: string,
): Promise<string | null> {
  await ensureReady();
  interface AccessRow extends RowDataPacket {
    n: number;
  }
  interface DateRow extends RowDataPacket {
    game_date: string;
  }

  const [[access]] = await pool.execute<AccessRow[]>(
    "SELECT COUNT(*) AS n FROM kingdom_news_sharded WHERE key_hash = ? AND kingdom = ? LIMIT 1",
    [keyHash, kingdom],
  );
  if (!access.n) return null;

  const [rows] = await pool.execute<DateRow[]>(
    `SELECT game_date FROM kingdom_news_sharded
     WHERE key_hash = ? AND kingdom = ? AND event_type IN ('war_declared', 'war_declared_on_us')
     ORDER BY game_date_ord DESC, id DESC
     LIMIT 1`,
    [keyHash, kingdom],
  );
  return rows[0]?.game_date ?? null;
}

export async function getHistoryEventMarkers(
  kingdom: string,
  keyHash: string,
): Promise<{ id: string; label: string; at: string; date: string | null }[]> {
  await ensureReady();
  interface EventRow extends RowDataPacket {
    id: number;
    game_date: string;
    game_date_ord: number | null;
    event_type: string;
    relation_kingdom: string | null;
    dragon_type: string | null;
    dragon_name: string | null;
  }

  const [rows] = await pool.execute<EventRow[]>(
    `SELECT id, game_date, game_date_ord, event_type, relation_kingdom, dragon_type, dragon_name
     FROM kingdom_news_sharded
     WHERE key_hash = ? AND kingdom = ?
       AND event_type IN ('war_declared', 'war_declared_on_us', 'war_ended_victory', 'war_ended_defeat',
                          'ritual_started', 'ritual_active', 'ritual_ended',
                          'dragon_against_us', 'dragon_arrived', 'dragon_by_us', 'dragon_slain')
     ORDER BY game_date_ord ASC, id ASC`,
    [keyHash, kingdom],
  );

  return rows
    .filter((row) => row.game_date_ord != null)
    .map((row) => {
      if (
        row.event_type === "ritual_started" ||
        row.event_type === "ritual_active" ||
        row.event_type === "ritual_ended"
      ) {
        if (row.event_type === "ritual_ended") {
          return {
            id: `ritual_ended:${row.id}`,
            label: "Ritual ended",
            at: utopiaDateOrdToUtcTimestamp(row.game_date_ord!),
            date: row.game_date,
            direction: "in" as const,
          };
        }
        const isActive = row.event_type === "ritual_active";
        const ritualName = row.dragon_name ?? "Ritual";
        return {
          id: `${isActive ? "ritual_active" : "ritual"}:${row.id}`,
          label: isActive ? `${ritualName} activated` : `${ritualName} started`,
          at: utopiaDateOrdToUtcTimestamp(row.game_date_ord!),
          date: row.game_date,
          direction: isActive ? (null as null) : ("out" as const),
        };
      }
      if (
        row.event_type === "dragon_against_us" ||
        row.event_type === "dragon_arrived" ||
        row.event_type === "dragon_by_us" ||
        row.event_type === "dragon_slain"
      ) {
        const label =
          row.event_type === "dragon_slain"
            ? "Enemy Dragon Slain"
            : row.event_type === "dragon_by_us"
              ? row.dragon_type
                ? "Dragon Started"
                : "Dragon Launched"
              : row.event_type === "dragon_arrived"
                ? "Dragon Against Us!"
                : "Enemy Dragon Started";
        const direction =
          row.event_type === "dragon_by_us"
            ? ("out" as const)
            : row.event_type === "dragon_slain"
              ? null
              : ("in" as const);
        const idPrefix =
          row.event_type === "dragon_arrived"
            ? "dragon_arrived"
            : row.event_type === "dragon_against_us"
              ? "dragon_against"
              : row.event_type === "dragon_by_us"
                ? "dragon_by"
                : "dragon_slain";
        return {
          id: `${idPrefix}:${row.id}`,
          label,
          at: utopiaDateOrdToUtcTimestamp(row.game_date_ord!),
          date: row.game_date,
          direction,
          kingdom: row.relation_kingdom,
          dragonType: row.dragon_type,
          dragonName: row.dragon_name,
        };
      }
      const isStart =
        row.event_type === "war_declared" ||
        row.event_type === "war_declared_on_us";
      const label = isStart
        ? "War"
        : row.event_type === "war_ended_victory"
          ? "War Victory"
          : "War Defeat";
      const direction = (
        row.event_type === "war_declared" ||
        row.event_type === "war_ended_victory"
          ? "out"
          : "in"
      ) as "in" | "out";
      return {
        id: `${isStart ? "war" : row.event_type === "war_ended_victory" ? "war_victory" : "war_defeat"}:${row.id}`,
        label,
        at: utopiaDateOrdToUtcTimestamp(row.game_date_ord!),
        date: row.game_date,
        direction,
        kingdom: row.relation_kingdom,
      };
    });
}

export async function getKingdomNews(
  kingdom: string,
  keyHash: string,
  from?: string,
  to?: string,
): Promise<{ events: KingdomNewsRow[]; effectiveFrom: string | null }> {
  await ensureReady();
  interface AccessRow extends RowDataPacket {
    n: number;
  }
  interface MaxRow extends RowDataPacket {
    m: number | null;
  }
  interface EventRow extends RowDataPacket {
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
  }

  const [[access]] = await pool.execute<AccessRow[]>(
    "SELECT COUNT(*) AS n FROM kingdom_news_sharded WHERE key_hash = ? AND kingdom = ? LIMIT 1",
    [keyHash, kingdom],
  );
  if (!access.n) return { events: [], effectiveFrom: null };

  let fromOrd: number;
  let toOrd: number;
  let effectiveFrom: string | null = from ?? null;

  if (from || to) {
    fromOrd = from ? parseUtopiaDate(from) : 0;
    toOrd = to ? parseUtopiaDate(to) : 999999;
  } else {
    const [[maxRow]] = await pool.execute<MaxRow[]>(
      "SELECT MAX(game_date_ord) AS m FROM kingdom_news_sharded WHERE key_hash = ? AND kingdom = ?",
      [keyHash, kingdom],
    );
    const maxOrd = maxRow?.m ?? 0;
    fromOrd = maxOrd - 3 * UTOPIA_DAYS_PER_MONTH + 1;
    toOrd = 999999;
    effectiveFrom = formatUtopiaDate(fromOrd);
  }

  const [rows] = await pool.execute<EventRow[]>(
    `SELECT id, kingdom, game_date, event_type, raw_text,
            attacker_name, attacker_kingdom,
            defender_name, defender_kingdom,
            acres, books,
            sender_name, receiver_name,
            relation_kingdom, dragon_type, dragon_name, received_at
     FROM kingdom_news_sharded
     WHERE key_hash = ? AND kingdom = ? AND game_date_ord >= ? AND game_date_ord <= ?
     ORDER BY game_date_ord DESC, id DESC`,
    [keyHash, kingdom, fromOrd, toOrd],
  );

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
}

export async function getRecentOps(
  keyHash: string,
  limit = 20,
  since?: string,
): Promise<RecentOp[]> {
  await ensureReady();
  interface OpRow extends RowDataPacket {
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
    submitter_slot: number | null;
    arson_building: string | null;
    thieves_sent: number | null;
  }

  const sinceClause = since ? "WHERE received_at > :since" : "";

  const [sql, vals] = n(
    `
    WITH ${latestSlotCte()},
    ops AS (
      SELECT 'SoT' AS op_type, 'intel' AS op_category, po.received_at, po.saved_by,
             p.name AS province_name, p.kingdom,
             NULL AS actor_name, NULL AS actor_kingdom,
             'success' AS outcome, NULL AS summary,
             NULL AS detail_value, NULL AS detail_kind,
             NULL AS arson_building, NULL AS thieves_sent
      FROM province_overview po JOIN provinces p ON p.id = po.province_id
      WHERE po.key_hash = :keyHash AND po.source = 'sot'
      UNION ALL
      SELECT 'SoM', 'intel', mi.received_at, mi.saved_by,
             p.name, p.kingdom,
             NULL, NULL, 'success', NULL, NULL, NULL, NULL, NULL
      FROM military_intel mi JOIN provinces p ON p.id = mi.province_id
      WHERE mi.key_hash = :keyHash AND mi.source = 'som'
      UNION ALL
      SELECT 'SoD', 'intel', hmp.received_at, hmp.saved_by,
             p.name, p.kingdom,
             NULL, NULL, 'success', NULL, NULL, NULL, NULL, NULL
      FROM home_military_points hmp JOIN provinces p ON p.id = hmp.province_id
      WHERE hmp.key_hash = :keyHash AND hmp.source = 'sod'
      UNION ALL
      SELECT 'SoS', 'intel', si.received_at, si.saved_by,
             p.name, p.kingdom,
             NULL, NULL, 'success', NULL, NULL, NULL, NULL, NULL
      FROM sos_intel si JOIN provinces p ON p.id = si.province_id
      WHERE si.key_hash = :keyHash AND si.source = 'sos'
      UNION ALL
      SELECT 'Survey', 'intel', sv.received_at, sv.saved_by,
             p.name, p.kingdom,
             NULL, NULL, 'success', NULL, NULL, NULL, NULL, NULL
      FROM survey_intel sv JOIN provinces p ON p.id = sv.province_id
      WHERE sv.key_hash = :keyHash AND sv.source = 'survey'
      UNION ALL
      SELECT 'Infiltrate', 'intel', pr.received_at, pr.saved_by,
             p.name, p.kingdom,
             NULL, NULL, 'success', NULL, NULL, NULL, NULL, NULL
      FROM province_resources pr JOIN provinces p ON p.id = pr.province_id
      WHERE pr.key_hash = :keyHash AND pr.source = 'infiltrate'
      UNION ALL
      SELECT io.intel_type, 'intel', io.received_at, io.saved_by,
             COALESCE(io.target_name, 'Unknown'), COALESCE(io.target_kingdom, ''),
             p.name, p.kingdom,
             io.outcome, NULL,
             CASE WHEN io.thieves_lost > 0 THEN io.thieves_lost ELSE NULL END,
             CASE WHEN io.thieves_lost > 0 THEN 'thieves_lost' ELSE NULL END,
             NULL, NULL
      FROM intel_ops io JOIN provinces p ON p.id = io.province_id
      WHERE io.key_hash = :keyHash AND io.outcome = 'failure'
      UNION ALL
      SELECT ro.op, 'thievery', ro.received_at, ro.saved_by,
             COALESCE(ro.target_name, 'Unknown'), COALESCE(ro.target_kingdom, ''),
             p.name, p.kingdom,
             ro.outcome, NULL,
             CASE
               WHEN ro.amount_stolen    IS NOT NULL THEN ro.amount_stolen
               WHEN ro.troops_assassinated IS NOT NULL THEN ro.troops_assassinated
               WHEN ro.kidnapped        IS NOT NULL THEN ro.kidnapped
               WHEN ro.acres_burned     IS NOT NULL THEN ro.acres_burned
               WHEN ro.effect_duration  IS NOT NULL THEN ro.effect_duration
               WHEN ro.wizards_assassinated IS NOT NULL THEN ro.wizards_assassinated
               WHEN ro.prisoners_captured IS NOT NULL THEN ro.prisoners_captured
               WHEN ro.thieves_lost > 0             THEN ro.thieves_lost
               ELSE NULL
             END,
             CASE
               WHEN ro.amount_stolen    IS NOT NULL THEN 'amount_stolen'
               WHEN ro.troops_assassinated IS NOT NULL THEN 'troops_assassinated'
               WHEN ro.kidnapped        IS NOT NULL THEN 'kidnapped'
               WHEN ro.acres_burned     IS NOT NULL THEN 'acres_burned'
               WHEN ro.effect_duration  IS NOT NULL THEN 'effect_duration'
               WHEN ro.wizards_assassinated IS NOT NULL THEN 'wizards_assassinated'
               WHEN ro.prisoners_captured IS NOT NULL THEN 'prisoners_captured'
               WHEN ro.thieves_lost > 0             THEN 'thieves_lost'
               ELSE NULL
             END,
             ro.arson_building, ro.thieves_sent
      FROM rob_ops ro JOIN provinces p ON p.id = ro.province_id
      WHERE ro.key_hash = :keyHash AND COALESCE(ro.source, '') != 'province_logs'
      UNION ALL
      SELECT so.spell, 'sorcery', so.received_at, so.saved_by,
             COALESCE(so.target_name, 'Unknown'), COALESCE(so.target_kingdom, ''),
             p.name, p.kingdom,
             so.outcome, NULL,
             CASE
               WHEN so.duration_days IS NOT NULL THEN so.duration_days
               WHEN so.wizards_lost > 0          THEN so.wizards_lost
               WHEN so.runes_spent  IS NOT NULL  THEN so.runes_spent
               ELSE NULL
             END,
             CASE
               WHEN so.duration_days IS NOT NULL THEN 'duration_days'
               WHEN so.wizards_lost > 0          THEN 'wizards_lost'
               WHEN so.runes_spent  IS NOT NULL  THEN 'runes_spent'
               ELSE NULL
             END,
             NULL, NULL
      FROM sorcery_ops so JOIN provinces p ON p.id = so.province_id
      WHERE so.key_hash = :keyHash AND COALESCE(so.source, '') != 'province_logs'
      UNION ALL
      SELECT ao.attack_type, 'attack', ao.received_at, ao.saved_by,
             COALESCE(ao.target_name, 'Unknown'), COALESCE(ao.target_kingdom, ''),
             p.name, p.kingdom,
             ao.outcome, NULL,
             CASE
               WHEN ao.acres_taken      IS NOT NULL THEN ao.acres_taken
               WHEN ao.massacred        IS NOT NULL THEN ao.massacred
               WHEN ao.enemy_killed     IS NOT NULL THEN ao.enemy_killed
               WHEN ao.enemy_imprisoned IS NOT NULL THEN ao.enemy_imprisoned
               WHEN ao.return_days      IS NOT NULL THEN ao.return_days
               ELSE NULL
             END,
             CASE
               WHEN ao.acres_taken      IS NOT NULL THEN 'acres_taken'
               WHEN ao.massacred        IS NOT NULL THEN 'massacred'
               WHEN ao.enemy_killed     IS NOT NULL THEN 'enemy_killed'
               WHEN ao.enemy_imprisoned IS NOT NULL THEN 'enemy_imprisoned'
               WHEN ao.return_days      IS NOT NULL THEN 'return_days'
               ELSE NULL
             END,
             NULL, NULL
      FROM attack_ops ao JOIN provinces p ON p.id = ao.province_id
      WHERE ao.key_hash = :keyHash AND COALESCE(ao.source, '') != 'province_logs'
    )
    SELECT op_type, op_category, received_at, saved_by, province_name, kingdom,
           actor_name, actor_kingdom, outcome, summary, detail_value, detail_kind,
           arson_building, thieves_sent,
           (SELECT ls.slot FROM latest_slot ls WHERE ls.kingdom = ops.kingdom AND ls.name = ops.province_name) AS slot,
           (
             SELECT CASE WHEN COUNT(DISTINCT ls.slot) = 1 THEN MIN(ls.slot) ELSE NULL END
             FROM latest_slot ls
             WHERE ls.name = ops.saved_by
           ) AS submitter_slot
    FROM ops
    ${sinceClause}
    ORDER BY received_at DESC
    LIMIT :limit
  `,
    { keyHash, since: since ?? null, limit },
  );

  const [rows] = await pool.execute<OpRow[]>(
    sql,
    vals as import("mysql2").ExecuteValues,
  );
  return rows as RecentOp[];
}

export async function getKingdoms(keyHash: string): Promise<KingdomRow[]> {
  await ensureReady();
  interface KRow extends RowDataPacket {
    location: string;
    province_count: number;
    last_seen: string | null;
  }
  const [sql, vals] = n(
    `
    WITH ${latestSlotCte()}
    SELECT p.kingdom AS location,
           COUNT(DISTINCT p.id) AS province_count,
           MAX(po.received_at) AS last_seen
    FROM provinces p
    LEFT JOIN province_overview po ON po.province_id = p.id AND po.key_hash = :keyHash
    WHERE p.kingdom != ''
      AND EXISTS (SELECT 1 FROM intel_partitions WHERE key_hash = :keyHash AND province_id = p.id)
      AND (
        EXISTS (SELECT 1 FROM latest_slot ls WHERE ls.kingdom = p.kingdom AND ls.name = p.name)
        OR NOT EXISTS (
          SELECT 1 FROM kingdom_provinces kp
          JOIN kingdom_intel ki ON kp.kingdom_intel_id = ki.id
          WHERE ki.location = p.kingdom AND ki.key_hash = :keyHash AND kp.name = p.name
        )
      )
    GROUP BY p.kingdom
    ORDER BY last_seen DESC
  `,
    { keyHash },
  );
  const [rows] = await pool.execute<KRow[]>(
    sql,
    vals as import("mysql2").ExecuteValues,
  );
  return rows as KingdomRow[];
}

export async function getKingdomNewsSummary(
  kingdom: string,
  keyHash: string,
  from?: string,
  to?: string,
): Promise<KingdomNewsSummary> {
  await ensureReady();
  const empty: KingdomNewsSummary = {
    ourKingdom: kingdom,
    totalMarchAcresIn: 0,
    totalRazeAcresIn: 0,
    totalMarchAcresOut: 0,
    totalRazeAcresOut: 0,
    uniqueAttackers: 0,
    byKingdom: [],
  };

  interface AccessRow extends RowDataPacket {
    n: number;
  }
  const [[access]] = await pool.execute<AccessRow[]>(
    "SELECT COUNT(*) AS n FROM kingdom_news_sharded WHERE key_hash = ? AND kingdom = ? LIMIT 1",
    [keyHash, kingdom],
  );
  if (!access.n) return empty;

  interface MaxRow extends RowDataPacket {
    m: number | null;
  }
  let fromOrd: number;
  let toOrd: number;
  if (from || to) {
    fromOrd = from ? parseUtopiaDate(from) : 0;
    toOrd = to ? parseUtopiaDate(to) : 999999;
  } else {
    const [[maxRow]] = await pool.execute<MaxRow[]>(
      "SELECT MAX(game_date_ord) AS m FROM kingdom_news_sharded WHERE key_hash = ? AND kingdom = ?",
      [keyHash, kingdom],
    );
    const maxOrd = maxRow?.m ?? 0;
    fromOrd = maxOrd - 3 * UTOPIA_DAYS_PER_MONTH + 1;
    toOrd = 999999;
  }

  interface CombatRow extends RowDataPacket {
    attacker_name: string | null;
    attacker_kingdom: string;
    defender_name: string | null;
    defender_kingdom: string;
    event_type: string;
    acres: number | null;
    books: number | null;
  }
  const [combatRows] = await pool.execute<CombatRow[]>(
    `SELECT attacker_name, attacker_kingdom, defender_name, defender_kingdom, event_type, acres, books
     FROM kingdom_news_sharded
     WHERE key_hash = ? AND kingdom = ? AND event_type IN (${COMBAT_TYPES_SQL})
       AND attacker_kingdom IS NOT NULL AND defender_kingdom IS NOT NULL
       AND game_date_ord >= ? AND game_date_ord <= ?`,
    [keyHash, kingdom, fromOrd, toOrd],
  );

  type AttackerEntry = {
    attacker_name: string | null;
    attacker_kingdom: string;
    hits: number;
    marchHits: number;
    ambushHits: number;
    razeHits: number;
    pillageHits: number;
    learnHits: number;
    failedHits: number;
    marchAcres: number;
    ambushAcres: number;
    razeAcres: number;
    books: number;
  };
  type DefenderEntry = {
    defender_name: string | null;
    defender_kingdom: string;
    hits: number;
    marchHits: number;
    ambushHits: number;
    razeHits: number;
    pillageHits: number;
    learnHits: number;
    failedHits: number;
    marchAcres: number;
    ambushAcres: number;
    razeAcres: number;
  };
  const newAttacker = (name: string | null, kd: string): AttackerEntry => ({
    attacker_name: name,
    attacker_kingdom: kd,
    hits: 0,
    marchHits: 0,
    ambushHits: 0,
    razeHits: 0,
    pillageHits: 0,
    learnHits: 0,
    failedHits: 0,
    marchAcres: 0,
    ambushAcres: 0,
    razeAcres: 0,
    books: 0,
  });
  const newDefender = (name: string | null, kd: string): DefenderEntry => ({
    defender_name: name,
    defender_kingdom: kd,
    hits: 0,
    marchHits: 0,
    ambushHits: 0,
    razeHits: 0,
    pillageHits: 0,
    learnHits: 0,
    failedHits: 0,
    marchAcres: 0,
    ambushAcres: 0,
    razeAcres: 0,
  });

  const attackerMap = new Map<string, AttackerEntry>();
  const defenderMap = new Map<string, DefenderEntry>();

  for (const r of combatRows) {
    const ak = `${r.attacker_name ?? ""}\0${r.attacker_kingdom}`;
    const a =
      attackerMap.get(ak) ?? newAttacker(r.attacker_name, r.attacker_kingdom);
    a.hits++;
    if (r.event_type === "march") {
      a.marchHits++;
      a.marchAcres += r.acres ?? 0;
    } else if (r.event_type === "ambush") {
      a.ambushHits++;
      a.ambushAcres += r.acres ?? 0;
    } else if (r.event_type === "raze") {
      a.razeHits++;
      a.razeAcres += r.acres ?? 0;
    } else if (r.event_type === "pillage") {
      a.pillageHits++;
    } else if (r.event_type === "learn" || r.event_type === "loot") {
      // Legacy kingdom news rows used "loot" for Learn attacks because the
      // source text says books were looted. Treat both as Learn at read time.
      a.learnHits++;
      a.books += r.books ?? 0;
    } else if (r.event_type === "failed_attack") {
      a.failedHits++;
    }
    attackerMap.set(ak, a);

    const dk = `${r.defender_name ?? ""}\0${r.defender_kingdom}`;
    const d =
      defenderMap.get(dk) ?? newDefender(r.defender_name, r.defender_kingdom);
    d.hits++;
    if (r.event_type === "march") {
      d.marchHits++;
      d.marchAcres += r.acres ?? 0;
    } else if (r.event_type === "ambush") {
      d.ambushHits++;
      d.ambushAcres += r.acres ?? 0;
    } else if (r.event_type === "raze") {
      d.razeHits++;
      d.razeAcres += r.acres ?? 0;
    } else if (r.event_type === "pillage") {
      d.pillageHits++;
    } else if (r.event_type === "learn" || r.event_type === "loot") {
      d.learnHits++;
    } else if (r.event_type === "failed_attack") {
      d.failedHits++;
    }
    defenderMap.set(dk, d);
  }

  const asAttacker = [...attackerMap.values()];
  const asDefender = [...defenderMap.values()];

  type ProvKey = string;
  type ProvEntry = {
    kd: string;
    name: string | null;
    hitsMade: number;
    marchMade: number;
    ambushMade: number;
    razeMade: number;
    pillageMade: number;
    learnMade: number;
    failedMade: number;
    marchAcresGained: number;
    ambushAcresGained: number;
    razeAcresDealt: number;
    booksLearned: number;
    hitsTaken: number;
    marchTaken: number;
    ambushTaken: number;
    razeTaken: number;
    pillageTaken: number;
    learnTaken: number;
    failedTaken: number;
    marchAcresLost: number;
    ambushAcresLost: number;
    razeAcresLost: number;
  };
  const provMap = new Map<ProvKey, ProvEntry>();
  const provKey = (name: string | null, kd: string) => `${name ?? ""}\0${kd}`;
  const emptyProv = (name: string | null, kd: string): ProvEntry => ({
    kd,
    name,
    hitsMade: 0,
    marchMade: 0,
    ambushMade: 0,
    razeMade: 0,
    pillageMade: 0,
    learnMade: 0,
    failedMade: 0,
    marchAcresGained: 0,
    ambushAcresGained: 0,
    razeAcresDealt: 0,
    booksLearned: 0,
    hitsTaken: 0,
    marchTaken: 0,
    ambushTaken: 0,
    razeTaken: 0,
    pillageTaken: 0,
    learnTaken: 0,
    failedTaken: 0,
    marchAcresLost: 0,
    ambushAcresLost: 0,
    razeAcresLost: 0,
  });

  for (const r of asAttacker) {
    const k = provKey(r.attacker_name, r.attacker_kingdom);
    const p = provMap.get(k) ?? emptyProv(r.attacker_name, r.attacker_kingdom);
    p.hitsMade += r.hits;
    p.marchMade += r.marchHits;
    p.ambushMade += r.ambushHits;
    p.razeMade += r.razeHits;
    p.pillageMade += r.pillageHits;
    p.learnMade += r.learnHits;
    p.failedMade += r.failedHits;
    p.marchAcresGained += r.marchAcres;
    p.ambushAcresGained += r.ambushAcres;
    p.razeAcresDealt += r.razeAcres;
    p.booksLearned += r.books;
    provMap.set(k, p);
  }
  for (const r of asDefender) {
    const k = provKey(r.defender_name, r.defender_kingdom);
    const p = provMap.get(k) ?? emptyProv(r.defender_name, r.defender_kingdom);
    p.hitsTaken += r.hits;
    p.marchTaken += r.marchHits;
    p.ambushTaken += r.ambushHits;
    p.razeTaken += r.razeHits;
    p.pillageTaken += r.pillageHits;
    p.learnTaken += r.learnHits;
    p.failedTaken += r.failedHits;
    p.marchAcresLost += r.marchAcres;
    p.ambushAcresLost += r.ambushAcres;
    p.razeAcresLost += r.razeAcres;
    provMap.set(k, p);
  }

  const kingdoms = [...new Set([...provMap.values()].map((p) => p.kd))];
  const slotMap = new Map<string, number | null>();
  if (kingdoms.length > 0) {
    const placeholders = kingdoms.map(() => "?").join(",");
    interface SlotRow extends RowDataPacket {
      name: string;
      kingdom: string;
      slot: number | null;
    }
    const [slotRows] = await pool.execute<SlotRow[]>(
      `SELECT kp.name, ki.location AS kingdom, kp.slot
       FROM kingdom_provinces kp
       JOIN kingdom_intel ki ON ki.id = kp.kingdom_intel_id
       WHERE ki.key_hash = ? AND ki.location IN (${placeholders}) AND kp.name IS NOT NULL`,
      [keyHash, ...kingdoms],
    );
    for (const r of slotRows) slotMap.set(`${r.name}\0${r.kingdom}`, r.slot);
  }

  const kdMap = new Map<string, NewsProvinceSummary[]>();
  for (const p of provMap.values()) {
    const slot = p.name ? (slotMap.get(`${p.name}\0${p.kd}`) ?? null) : null;
    const list = kdMap.get(p.kd) ?? [];
    list.push({
      provinceName: p.name,
      slot,
      hitsMade: p.hitsMade,
      marchMade: p.marchMade,
      ambushMade: p.ambushMade,
      razeMade: p.razeMade,
      plunderMade: p.pillageMade,
      learnMade: p.learnMade,
      failedMade: p.failedMade,
      marchAcresGained: p.marchAcresGained,
      ambushAcresGained: p.ambushAcresGained,
      razeAcresDealt: p.razeAcresDealt,
      booksLearned: p.booksLearned,
      hitsTaken: p.hitsTaken,
      marchTaken: p.marchTaken,
      ambushTaken: p.ambushTaken,
      razeTaken: p.razeTaken,
      plunderTaken: p.pillageTaken,
      learnTaken: p.learnTaken,
      failedTaken: p.failedTaken,
      marchAcresLost: p.marchAcresLost,
      ambushAcresLost: p.ambushAcresLost,
      razeAcresLost: p.razeAcresLost,
    });
    kdMap.set(p.kd, list);
  }

  interface KdNameRow extends RowDataPacket {
    name: string;
  }
  const kdNames = new Map<string, string>();
  for (const loc of kdMap.keys()) {
    const [[row]] = await pool.execute<KdNameRow[]>(
      "SELECT name FROM kingdom_intel WHERE key_hash = ? AND location = ? ORDER BY received_at DESC LIMIT 1",
      [keyHash, loc],
    );
    if (row) kdNames.set(loc, row.name);
  }

  const byKingdom: NewsKingdomSummary[] = [...kdMap.entries()].map(
    ([kd, provs]) => {
      provs.sort((a, b) => {
        const netB = b.marchAcresGained - b.marchAcresLost - b.razeAcresLost;
        const netA = a.marchAcresGained - a.marchAcresLost - a.razeAcresLost;
        return netB - netA;
      });
      const sum = <K extends keyof NewsProvinceSummary>(f: K) =>
        provs.reduce((s, p) => s + (p[f] as number), 0);
      return {
        kingdom: kd,
        kingdomName: kdNames.get(kd) ?? null,
        provinces: provs,
        totalHitsMade: sum("hitsMade"),
        totalMarchMade: sum("marchMade"),
        totalAmbushMade: sum("ambushMade"),
        totalRazeMade: sum("razeMade"),
        totalPlunderMade: sum("plunderMade"),
        totalLearnMade: sum("learnMade"),
        totalFailedMade: sum("failedMade"),
        totalMarchAcresGained: sum("marchAcresGained"),
        totalAmbushAcresGained: sum("ambushAcresGained"),
        totalRazeAcresDealt: sum("razeAcresDealt"),
        totalHitsTaken: sum("hitsTaken"),
        totalMarchTaken: sum("marchTaken"),
        totalAmbushTaken: sum("ambushTaken"),
        totalRazeTaken: sum("razeTaken"),
        totalPlunderTaken: sum("plunderTaken"),
        totalLearnTaken: sum("learnTaken"),
        totalFailedTaken: sum("failedTaken"),
        totalMarchAcresLost: sum("marchAcresLost"),
        totalAmbushAcresLost: sum("ambushAcresLost"),
        totalRazeAcresLost: sum("razeAcresLost"),
      };
    },
  );

  byKingdom.sort((a, b) => {
    if (a.kingdom === kingdom) return -1;
    if (b.kingdom === kingdom) return 1;
    return (
      b.totalHitsMade - a.totalHitsMade ||
      a.totalMarchAcresGained - b.totalMarchAcresGained
    );
  });

  const ours = byKingdom.find((k) => k.kingdom === kingdom);
  const enemies = byKingdom.filter((k) => k.kingdom !== kingdom);
  const totalMarchAcresIn = enemies.reduce(
    (s, k) => s + k.totalMarchAcresGained,
    0,
  );
  const totalRazeAcresIn = enemies.reduce(
    (s, k) => s + k.totalRazeAcresDealt,
    0,
  );
  const totalMarchAcresOut = ours?.totalMarchAcresGained ?? 0;
  const totalRazeAcresOut = ours?.totalRazeAcresDealt ?? 0;
  const uniqueAttackers = asAttacker.filter(
    (r) => r.attacker_kingdom !== kingdom,
  ).length;

  return {
    ourKingdom: kingdom,
    totalMarchAcresIn,
    totalRazeAcresIn,
    totalMarchAcresOut,
    totalRazeAcresOut,
    uniqueAttackers,
    byKingdom,
  };
}

export async function getProvinceHistory(
  name: string,
  kingdom: string,
  keyHash: string,
): Promise<ProvinceHistoryPoint[]> {
  await ensureReady();
  interface ProvRow extends RowDataPacket {
    id: number;
  }
  interface AccessRow extends RowDataPacket {
    n: number;
  }

  const [[prov]] = await pool.execute<ProvRow[]>(
    "SELECT id FROM provinces WHERE name = ? AND kingdom = ?",
    [name, kingdom],
  );
  if (!prov) return [];

  const [[access]] = await pool.execute<AccessRow[]>(
    "SELECT COUNT(*) AS n FROM intel_partitions WHERE key_hash = ? AND province_id = ?",
    [keyHash, prov.id],
  );
  if (!access.n) return [];

  const id = prov.id;
  interface OverviewRaw extends RowDataPacket {
    received_at: string;
    land: number | null;
    networth: number | null;
    source: string | null;
    saved_by: string | null;
  }
  interface TroopsRaw extends RowDataPacket {
    received_at: string;
    soldiers: number | null;
    off_specs: number | null;
    def_specs: number | null;
    elites: number | null;
    war_horses: number | null;
    peasants: number | null;
    source: string | null;
    saved_by: string | null;
  }
  interface ResourcesRaw extends RowDataPacket {
    received_at: string;
    money: number | null;
    food: number | null;
    runes: number | null;
    thieves: number | null;
    wizards: number | null;
    source: string | null;
    saved_by: string | null;
  }
  interface MilPointsRaw extends RowDataPacket {
    received_at: string;
    off_points: number | null;
    def_points: number | null;
    source: string | null;
    saved_by: string | null;
  }
  interface AttackRaw extends RowDataPacket {
    received_at: string;
    attack_type: string;
    attacker_name: string;
    attacker_kingdom: string;
    acres_taken: number | null;
    enemy_killed: number | null;
    enemy_imprisoned: number | null;
    massacred: number | null;
  }
  interface RobRaw extends RowDataPacket {
    received_at: string;
    op: string;
    outcome: string;
    amount_stolen: number | null;
    thieves_lost: number;
    attacker_name: string;
    attacker_kingdom: string;
    troops_assassinated: number | null;
    kidnapped: number | null;
    acres_burned: number | null;
    effect_duration: number | null;
    wizards_assassinated: number | null;
    prisoners_freed: number | null;
    prisoners_captured: number | null;
  }
  interface SorceryRaw extends RowDataPacket {
    received_at: string;
    spell: string;
    outcome: string;
    duration_days: number | null;
    wizards_lost: number;
    caster_name: string;
    caster_kingdom: string;
  }

  const [
    overviews,
    troops,
    resources,
    milPoints,
    attacksTaken,
    thieveryOpsTaken,
    sorceryOpsTaken,
  ] = await Promise.all([
    pool
      .execute<
        OverviewRaw[]
      >("SELECT received_at, land, networth, source, saved_by FROM province_overview WHERE province_id = ? AND key_hash = ? ORDER BY received_at ASC", [id, keyHash])
      .then(([r]) => r),
    pool
      .execute<
        TroopsRaw[]
      >("SELECT received_at, soldiers, off_specs, def_specs, elites, war_horses, peasants, source, saved_by FROM province_troops WHERE province_id = ? AND key_hash = ? ORDER BY received_at ASC", [id, keyHash])
      .then(([r]) => r),
    pool
      .execute<
        ResourcesRaw[]
      >("SELECT received_at, money, food, runes, thieves, wizards, source, saved_by FROM province_resources WHERE province_id = ? AND key_hash = ? ORDER BY received_at ASC", [id, keyHash])
      .then(([r]) => r),
    pool
      .execute<
        MilPointsRaw[]
      >("SELECT received_at, off_points, def_points, source, saved_by FROM total_military_points WHERE province_id = ? AND key_hash = ? ORDER BY received_at ASC", [id, keyHash])
      .then(([r]) => r),
    pool
      .execute<AttackRaw[]>(
        `SELECT ao.received_at, ao.attack_type, p.name AS attacker_name, p.kingdom AS attacker_kingdom,
              ao.acres_taken, ao.enemy_killed, ao.enemy_imprisoned, ao.massacred
       FROM attack_ops ao JOIN provinces p ON p.id = ao.province_id
       WHERE ao.key_hash = ? AND ao.target_name = ? AND ao.target_kingdom = ? AND ao.outcome = 'success'
       ORDER BY ao.received_at ASC`,
        [keyHash, name, kingdom],
      )
      .then(([r]) => r),
    pool
      .execute<RobRaw[]>(
        `SELECT ro.received_at, ro.op, ro.outcome, ro.amount_stolen, ro.thieves_lost,
              p.name AS attacker_name, p.kingdom AS attacker_kingdom,
              ro.troops_assassinated, ro.kidnapped, ro.acres_burned, ro.effect_duration,
              ro.wizards_assassinated, ro.prisoners_freed, ro.prisoners_captured
       FROM rob_ops ro JOIN provinces p ON p.id = ro.province_id
       WHERE ro.key_hash = ? AND ro.target_name = ? AND ro.target_kingdom = ?
         AND COALESCE(ro.source, '') != 'province_logs'
       ORDER BY ro.received_at ASC`,
        [keyHash, name, kingdom],
      )
      .then(([r]) => r),
    pool
      .execute<SorceryRaw[]>(
        `SELECT so.received_at, so.spell, so.outcome, so.duration_days, so.wizards_lost,
              p.name AS caster_name, p.kingdom AS caster_kingdom
       FROM sorcery_ops so JOIN provinces p ON p.id = so.province_id
       WHERE so.key_hash = ? AND so.target_name = ? AND so.target_kingdom = ?
         AND COALESCE(so.source, '') != 'province_logs'
       ORDER BY so.received_at ASC`,
        [keyHash, name, kingdom],
      )
      .then(([r]) => r),
  ]);

  const BUCKET_MS = 5 * 60 * 1000;
  function bucketKey(isoStr: string): string {
    const ms = new Date(isoStr.replace(" ", "T") + "Z").getTime();
    const bucketMs = Math.floor(ms / BUCKET_MS) * BUCKET_MS;
    return new Date(bucketMs)
      .toISOString()
      .replace("T", " ")
      .replace(".000Z", "");
  }

  const buckets = new Map<string, ProvinceHistoryPoint>();
  function ensureBucket(key: string): ProvinceHistoryPoint {
    if (!buckets.has(key)) {
      buckets.set(key, {
        receivedAt: key,
        networth: null,
        land: null,
        peasants: null,
        soldiers: null,
        offSpecs: null,
        defSpecs: null,
        elites: null,
        warHorses: null,
        offPoints: null,
        defPoints: null,
        money: null,
        food: null,
        runes: null,
        thieves: null,
        wizards: null,
        attacksTaken: [],
        thieveryOpsTaken: [],
        sorceryOpsTaken: [],
        meta: {},
      });
    }
    return buckets.get(key)!;
  }
  function mergeMetric(
    b: ProvinceHistoryPoint,
    metricKey: string,
    source: string | null,
    savedBy: string | null,
  ) {
    const m =
      b.meta[metricKey] ?? (b.meta[metricKey] = { sources: [], savedBy: [] });
    if (source && !m.sources.includes(source)) m.sources.push(source);
    if (savedBy && !m.savedBy.includes(savedBy)) m.savedBy.push(savedBy);
  }

  for (const row of overviews) {
    const b = ensureBucket(bucketKey(row.received_at));
    if (row.land != null) {
      b.land = row.land;
      mergeMetric(b, "land", row.source, row.saved_by);
    }
    if (row.networth != null) {
      b.networth = row.networth;
      mergeMetric(b, "networth", row.source, row.saved_by);
    }
  }
  for (const row of troops) {
    const b = ensureBucket(bucketKey(row.received_at));
    if (row.soldiers != null) {
      b.soldiers = row.soldiers;
      mergeMetric(b, "soldiers", row.source, row.saved_by);
    }
    if (row.off_specs != null) {
      b.offSpecs = row.off_specs;
      mergeMetric(b, "offSpecs", row.source, row.saved_by);
    }
    if (row.def_specs != null) {
      b.defSpecs = row.def_specs;
      mergeMetric(b, "defSpecs", row.source, row.saved_by);
    }
    if (row.elites != null) {
      b.elites = row.elites;
      mergeMetric(b, "elites", row.source, row.saved_by);
    }
    if (row.war_horses != null) {
      b.warHorses = row.war_horses;
      mergeMetric(b, "warHorses", row.source, row.saved_by);
    }
    if (row.peasants != null) {
      b.peasants = row.peasants;
      mergeMetric(b, "peasants", row.source, row.saved_by);
    }
  }
  for (const row of resources) {
    const b = ensureBucket(bucketKey(row.received_at));
    if (row.money != null) {
      b.money = row.money;
      mergeMetric(b, "money", row.source, row.saved_by);
    }
    if (row.food != null) {
      b.food = row.food;
      mergeMetric(b, "food", row.source, row.saved_by);
    }
    if (row.runes != null) {
      b.runes = row.runes;
      mergeMetric(b, "runes", row.source, row.saved_by);
    }
    if (row.thieves != null) {
      b.thieves = row.thieves;
      mergeMetric(b, "thieves", row.source, row.saved_by);
    }
    if (row.wizards != null) {
      b.wizards = row.wizards;
      mergeMetric(b, "wizards", row.source, row.saved_by);
    }
  }
  for (const row of milPoints) {
    const b = ensureBucket(bucketKey(row.received_at));
    if (row.off_points != null) {
      b.offPoints = row.off_points;
      mergeMetric(b, "offPoints", row.source, row.saved_by);
    }
    if (row.def_points != null) {
      b.defPoints = row.def_points;
      mergeMetric(b, "defPoints", row.source, row.saved_by);
    }
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
      wizardsAssassinated: row.wizards_assassinated,
      prisonersFreed: row.prisoners_freed,
      prisonersCaptured: row.prisoners_captured,
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

  return [...buckets.values()].sort((a, b) =>
    a.receivedAt.localeCompare(b.receivedAt),
  );
}

export async function cleanupExpired(): Promise<void> {
  await ensureReady();
  const cutoff = `DATE_SUB(NOW(), INTERVAL ${TTL_DAYS} DAY)`;
  for (const tbl of [
    "province_overview",
    "total_military_points",
    "home_military_points",
    "province_troops",
    "province_resources",
    "province_status",
    "military_intel",
    "survey_intel",
    "sos_intel",
    "kingdom_intel",
    "kingdom_news",
    "kingdom_news_sharded",
    "rob_ops",
    "intel_ops",
    "sorcery_ops",
    "attack_ops",
  ]) {
    await pool.query(`DELETE FROM \`${tbl}\` WHERE received_at < ${cutoff}`);
  }
}

// ── Army merge helpers (private, mirrors db.ts) ───────────────────────────────

type SomArmy = {
  type: string;
  generals: number;
  soldiers: number;
  offSpecs: number;
  defSpecs: number;
  elites: number;
  warHorses: number;
  thieves: number;
  land: number;
  eta: number;
};
type ThroneArmy = { type: string; land: number; eta: number };

function mergeArmyArrays(
  somArmies: SomArmy[],
  throneArmies: ThroneArmy[],
  throneNewer: boolean,
): ArmyRow[] {
  if (!throneNewer || throneArmies.length === 0) {
    return somArmies.map((a) => ({
      armyType: a.type,
      generals: a.generals,
      soldiers: a.soldiers,
      offSpecs: a.offSpecs,
      defSpecs: a.defSpecs,
      elites: a.elites,
      warHorses: a.warHorses,
      thieves: a.thieves,
      landGained: a.land,
      returnDays: a.eta,
    }));
  }
  const somByType = new Map(somArmies.map((a) => [a.type, a]));
  const outArmies: ArmyRow[] = throneArmies.map((t) => {
    const s = somByType.get(t.type);
    return {
      armyType: t.type,
      generals: s?.generals ?? null,
      soldiers: s?.soldiers ?? null,
      offSpecs: s?.offSpecs ?? null,
      defSpecs: s?.defSpecs ?? null,
      elites: s?.elites ?? null,
      warHorses: s?.warHorses ?? null,
      thieves: s?.thieves ?? null,
      landGained: t.land ?? s?.land ?? null,
      returnDays: t.eta,
    };
  });
  const nonOutArmies: ArmyRow[] = somArmies
    .filter((a) => !a.type.startsWith("out_"))
    .map((a) => ({
      armyType: a.type,
      generals: a.generals,
      soldiers: a.soldiers,
      offSpecs: a.offSpecs,
      defSpecs: a.defSpecs,
      elites: a.elites,
      warHorses: a.warHorses,
      thieves: a.thieves,
      landGained: a.land,
      returnDays: a.eta,
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
  return merged.length
    ? JSON.stringify(
        merged.map((a) => ({
          type: a.armyType,
          soldiers: a.soldiers ?? 0,
          offSpecs: a.offSpecs ?? 0,
          defSpecs: a.defSpecs ?? 0,
          elites: a.elites ?? 0,
          land: a.landGained ?? 0,
          eta: a.returnDays,
        })),
      )
    : null;
}

// ── hydrateKingdomProvinceRows ────────────────────────────────────────────────

async function hydrateKingdomProvinceRows(
  rows: ProvinceRow[],
  keyHash: string,
): Promise<void> {
  const byId = new Map(rows.map((row) => [row.id, row]));
  const ids = rows.map((row) => row.id);
  const idList = ids.map(() => "?").join(", ");
  const p = () => [keyHash, ...ids];

  const [
    totalMilitaryRows,
    troopRows,
    resourceRows,
    resourceFieldRows,
    statusRows,
    spellRows,
    scienceRows,
    surveyRows,
    homeMilitaryRows,
    militaryRows,
    armyRows,
  ] = await Promise.all([
    pool
      .execute<any[]>(
        `SELECT province_id, off_points, def_points, received_at AS military_age, source AS military_source
       FROM (
         SELECT tmp.*,
                ROW_NUMBER() OVER (PARTITION BY tmp.province_id ORDER BY tmp.received_at DESC, tmp.id DESC) AS rn
         FROM total_military_points tmp
         WHERE tmp.key_hash = ? AND tmp.province_id IN (${idList})
       ) ranked WHERE rn = 1`,
        p(),
      )
      .then(([r]) => r),

    pool
      .execute<any[]>(
        `SELECT province_id, source_group, soldiers, off_specs, def_specs, elites, war_horses, peasants, received_at, source
       FROM (
         SELECT pt.*,
                CASE WHEN pt.source IN ('sot','throne') THEN 'total' WHEN pt.source IN ('som','council_military') THEN 'home' END AS source_group,
                ROW_NUMBER() OVER (
                  PARTITION BY pt.province_id,
                               CASE WHEN pt.source IN ('sot','throne') THEN 'total' WHEN pt.source IN ('som','council_military') THEN 'home' END
                  ORDER BY pt.received_at DESC, pt.id DESC
                ) AS rn
         FROM province_troops pt
         WHERE pt.key_hash = ? AND pt.province_id IN (${idList})
           AND pt.source IN ('sot','throne','som','council_military')
       ) ranked WHERE rn = 1`,
        p(),
      )
      .then(([r]) => r),

    pool
      .execute<any[]>(
        `SELECT province_id, money, food, runes, prisoners, trade_balance, building_efficiency, stealth, wizards, mana,
              received_at AS resources_age, source AS resources_source
       FROM (
         SELECT pr.*,
                ROW_NUMBER() OVER (PARTITION BY pr.province_id ORDER BY pr.received_at DESC, pr.id DESC) AS rn
         FROM province_resources pr
         WHERE pr.key_hash = ? AND pr.province_id IN (${idList}) AND pr.source IN ('sot','throne')
       ) ranked WHERE rn = 1`,
        p(),
      )
      .then(([r]) => r),

    pool
      .execute<any[]>(
        `SELECT province_id, total_pop, max_pop, thieves, free_specialist_credits, free_building_credits, received_at
       FROM province_resources
       WHERE key_hash = ? AND province_id IN (${idList})
         AND (total_pop IS NOT NULL OR max_pop IS NOT NULL OR thieves IS NOT NULL
              OR free_specialist_credits IS NOT NULL OR free_building_credits IS NOT NULL)
       ORDER BY province_id ASC, received_at DESC, id DESC`,
        p(),
      )
      .then(([r]) => r),

    pool
      .execute<any[]>(
        `SELECT province_id, hit_status, received_at AS status_age
       FROM (
         SELECT ps.*,
                ROW_NUMBER() OVER (PARTITION BY ps.province_id ORDER BY ps.received_at DESC, ps.id DESC) AS rn
         FROM province_status ps
         WHERE ps.key_hash = ? AND ps.province_id IN (${idList})
       ) ranked WHERE rn = 1`,
        p(),
      )
      .then(([r]) => r),

    pool
      .execute<any[]>(
        `SELECT province_id, MAX(received_at) AS effects_age,
              GROUP_CONCAT(
                CASE WHEN effect_kind = 'spell' AND effect_name NOT IN (${BAD_SPELL_SQL_LIST})
                THEN CONCAT(effect_name, CASE WHEN remaining_ticks IS NOT NULL THEN CONCAT(' (', remaining_ticks, ')') ELSE '' END)
                END
                SEPARATOR ' | '
              ) AS good_spell_details,
              GROUP_CONCAT(
                CASE WHEN effect_kind = 'spell' AND effect_name IN (${BAD_SPELL_SQL_LIST})
                THEN CONCAT(effect_name, CASE WHEN remaining_ticks IS NOT NULL THEN CONCAT(' (', remaining_ticks, ')') ELSE '' END)
                END
                SEPARATOR ' | '
              ) AS bad_spell_details,
              SUM(CASE WHEN effect_kind = 'spell' AND effect_name NOT IN (${BAD_SPELL_SQL_LIST}) THEN 1 ELSE 0 END) AS good_spell_count,
              SUM(CASE WHEN effect_kind = 'spell' AND effect_name IN (${BAD_SPELL_SQL_LIST}) THEN 1 ELSE 0 END) AS bad_spell_count
       FROM (
         SELECT pe.*,
                ROW_NUMBER() OVER (PARTITION BY pe.province_id, pe.effect_name, pe.effect_kind ORDER BY pe.id DESC) AS rn
         FROM province_effects pe
         WHERE pe.key_hash = ? AND pe.province_id IN (${idList})
           AND pe.received_at = (
             SELECT MAX(pe2.received_at) FROM province_effects pe2
             WHERE pe2.province_id = pe.province_id AND pe2.key_hash = pe.key_hash
           )
       ) latest_effects
       WHERE rn = 1
       GROUP BY province_id`,
        p(),
      )
      .then(([r]) => r),

    pool
      .execute<any[]>(
        `SELECT si.province_id, si.received_at AS sciences_age,
              MAX(CASE WHEN ss.science = 'Crime'      THEN ss.effect END) AS crime_effect,
              MAX(CASE WHEN ss.science = 'Siege'      THEN ss.effect END) AS siege_effect,
              MAX(CASE WHEN ss.science = 'Channeling' THEN ss.effect END) AS channeling_effect,
              MAX(CASE WHEN ss.science = 'Shielding'  THEN ss.effect END) AS shielding_effect,
              MAX(CASE WHEN ss.science = 'Housing'    THEN ss.effect END) AS housing_effect,
              SUM(ss.books) AS science_total_books
       FROM (
         SELECT si2.*,
                ROW_NUMBER() OVER (PARTITION BY si2.province_id ORDER BY si2.received_at DESC, si2.id DESC) AS rn
         FROM sos_intel si2
         WHERE si2.key_hash = ? AND si2.province_id IN (${idList})
       ) si
       LEFT JOIN sos_sciences ss ON ss.sos_intel_id = si.id
       WHERE si.rn = 1
       GROUP BY si.province_id, si.received_at`,
        p(),
      )
      .then(([r]) => r),

    pool
      .execute<any[]>(
        `SELECT si.province_id, si.received_at AS survey_age,
              si.thief_prevent_chance AS watch_towers_effect,
              si.thievery_effectiveness AS thieves_dens_effect,
              si.castles_effect,
              MAX(CASE WHEN sb.building = 'Barren Land' THEN sb.built END) AS barren_land,
              MAX(CASE WHEN sb.building = 'Homes'       THEN sb.built END) AS homes_built,
              MAX(CASE WHEN sb.building = 'Guilds'      THEN sb.built END) AS guilds_built,
              SUM(CASE WHEN sb.building != 'Barren Land' THEN sb.built ELSE 0 END) AS buildings_built,
              SUM(sb.in_progress) AS buildings_in_progress
       FROM (
         SELECT si2.*,
                ROW_NUMBER() OVER (PARTITION BY si2.province_id ORDER BY si2.received_at DESC, si2.id DESC) AS rn
         FROM survey_intel si2
         WHERE si2.key_hash = ? AND si2.province_id IN (${idList})
       ) si
       LEFT JOIN survey_buildings sb ON sb.survey_intel_id = si.id
       WHERE si.rn = 1
       GROUP BY si.province_id, si.received_at, si.thief_prevent_chance, si.thievery_effectiveness, si.castles_effect`,
        p(),
      )
      .then(([r]) => r),

    pool
      .execute<any[]>(
        `SELECT province_id, mod_off_at_home AS off_home, mod_def_at_home AS def_home,
              received_at AS home_mil_age, source AS home_mil_source
       FROM (
         SELECT hmp.*,
                ROW_NUMBER() OVER (PARTITION BY hmp.province_id ORDER BY hmp.received_at DESC, hmp.id DESC) AS rn
         FROM home_military_points hmp
         WHERE hmp.key_hash = ? AND hmp.province_id IN (${idList})
       ) ranked WHERE rn = 1`,
        p(),
      )
      .then(([r]) => r),

    pool
      .execute<any[]>(
        `SELECT province_id, source_group, ome, dme, received_at
       FROM (
         SELECT mi.*,
                CASE WHEN mi.source IN ('som','council_military') THEN 'som' WHEN mi.source = 'throne' THEN 'throne' END AS source_group,
                ROW_NUMBER() OVER (
                  PARTITION BY mi.province_id,
                               CASE WHEN mi.source IN ('som','council_military') THEN 'som' WHEN mi.source = 'throne' THEN 'throne' END
                  ORDER BY mi.received_at DESC, mi.id DESC
                ) AS rn
         FROM military_intel mi
         WHERE mi.key_hash = ? AND mi.province_id IN (${idList})
           AND (mi.source IN ('som','council_military') OR mi.source = 'throne')
       ) ranked WHERE rn = 1`,
        p(),
      )
      .then(([r]) => r),

    pool
      .execute<any[]>(
        `WITH latest_military AS (
         SELECT * FROM (
           SELECT mi.*,
                  CASE WHEN mi.source IN ('som','council_military') THEN 'som' WHEN mi.source = 'throne' THEN 'throne' END AS source_group,
                  ROW_NUMBER() OVER (
                    PARTITION BY mi.province_id,
                                 CASE WHEN mi.source IN ('som','council_military') THEN 'som' WHEN mi.source = 'throne' THEN 'throne' END
                    ORDER BY mi.received_at DESC, mi.id DESC
                  ) AS rn
           FROM military_intel mi
           WHERE mi.key_hash = ? AND mi.province_id IN (${idList})
             AND (mi.source IN ('som','council_military') OR mi.source = 'throne')
         ) ranked WHERE rn = 1
       ),
       latest_military_som AS (SELECT id, province_id, received_at FROM latest_military WHERE source_group = 'som'),
       latest_military_throne AS (SELECT id, province_id, received_at FROM latest_military WHERE source_group = 'throne'),
       latest_army_intel AS (
         SELECT COALESCE(ms.province_id, mt.province_id) AS province_id,
                CASE WHEN mt.id IS NOT NULL AND (ms.id IS NULL OR mt.received_at > ms.received_at) THEN mt.id ELSE ms.id END AS military_intel_id
         FROM latest_military_som ms LEFT JOIN latest_military_throne mt ON mt.province_id = ms.province_id
         UNION ALL
         SELECT mt.province_id, mt.id FROM latest_military_throne mt
         LEFT JOIN latest_military_som ms ON ms.province_id = mt.province_id WHERE ms.id IS NULL
       ),
       army_summary AS (
         SELECT lai.province_id, COUNT(sa.id) AS armies_out_count,
                SUM(sa.land_gained) AS land_incoming, MIN(sa.return_days) AS earliest_return
         FROM latest_army_intel lai
         LEFT JOIN som_armies sa ON sa.military_intel_id = lai.military_intel_id AND sa.return_days IS NOT NULL
         GROUP BY lai.province_id
       ),
       som_armies_summary AS (
         SELECT ms.province_id,
                JSON_ARRAYAGG(JSON_OBJECT('type',sa.army_type,'generals',sa.generals,'soldiers',sa.soldiers,'offSpecs',sa.off_specs,'defSpecs',sa.def_specs,'elites',sa.elites,'warHorses',sa.war_horses,'thieves',sa.thieves,'land',sa.land_gained,'eta',sa.return_days)) AS som_armies_json
         FROM latest_military_som ms
         JOIN som_armies sa ON sa.military_intel_id = ms.id AND sa.return_days IS NOT NULL
         GROUP BY ms.province_id
       ),
       throne_armies_summary AS (
         SELECT mt.province_id,
                JSON_ARRAYAGG(JSON_OBJECT('type',sa.army_type,'land',sa.land_gained,'eta',sa.return_days)) AS throne_armies_json
         FROM latest_military_throne mt
         JOIN som_armies sa ON sa.military_intel_id = mt.id AND sa.return_days IS NOT NULL
         GROUP BY mt.province_id
       )
       SELECT army.province_id, army.armies_out_count, army.land_incoming, army.earliest_return,
              som_armies.som_armies_json, throne_armies.throne_armies_json
       FROM army_summary army
       LEFT JOIN som_armies_summary som_armies ON som_armies.province_id = army.province_id
       LEFT JOIN throne_armies_summary throne_armies ON throne_armies.province_id = army.province_id`,
        p(),
      )
      .then(([r]) => r),
  ]);

  for (const s of totalMilitaryRows) {
    Object.assign(byId.get(s.province_id)!, {
      off_points: s.off_points,
      def_points: s.def_points,
      military_age: s.military_age,
      military_source: s.military_source,
    });
  }
  for (const s of troopRows) {
    const row = byId.get(s.province_id)!;
    if (s.source_group === "total") {
      Object.assign(row, {
        soldiers: s.soldiers,
        off_specs: s.off_specs,
        def_specs: s.def_specs,
        elites: s.elites,
        war_horses: s.war_horses,
        peasants: s.peasants,
        troops_age: s.received_at,
        troops_source: s.source,
      });
    } else {
      Object.assign(row, {
        soldiers_home: s.soldiers,
        off_specs_home: s.off_specs,
        def_specs_home: s.def_specs,
        elites_home: s.elites,
        troops_home_age: s.received_at,
      });
    }
  }
  for (const s of resourceRows) {
    Object.assign(byId.get(s.province_id)!, {
      money: s.money,
      food: s.food,
      runes: s.runes,
      prisoners: s.prisoners,
      trade_balance: s.trade_balance,
      building_efficiency: s.building_efficiency,
      stealth: s.stealth,
      wizards: s.wizards,
      mana: s.mana,
      resources_age: s.resources_age,
      resources_source: s.resources_source,
    });
  }
  for (const s of resourceFieldRows) {
    const row = byId.get(s.province_id)!;
    if (row.total_pop == null && s.total_pop != null)
      row.total_pop = s.total_pop;
    if (row.max_pop == null && s.max_pop != null) row.max_pop = s.max_pop;
    if (row.thieves == null && s.thieves != null) {
      row.thieves = s.thieves;
      row.thieves_age = s.received_at;
    }
    if (
      row.free_specialist_credits == null &&
      s.free_specialist_credits != null
    ) {
      row.free_specialist_credits = s.free_specialist_credits;
      row.free_specialist_credits_age = s.received_at;
    }
    if (row.free_building_credits == null && s.free_building_credits != null) {
      row.free_building_credits = s.free_building_credits;
      row.free_building_credits_age = s.received_at;
    }
  }
  for (const s of statusRows) {
    Object.assign(byId.get(s.province_id)!, {
      hit_status: s.hit_status,
      status_age: s.status_age,
    });
  }
  for (const s of spellRows) {
    Object.assign(byId.get(s.province_id)!, {
      effects_age: s.effects_age,
      good_spell_details: s.good_spell_details,
      bad_spell_details: s.bad_spell_details,
      good_spell_count: s.good_spell_count,
      bad_spell_count: s.bad_spell_count,
    });
  }
  for (const s of scienceRows) {
    Object.assign(byId.get(s.province_id)!, {
      sciences_age: s.sciences_age,
      crime_effect: s.crime_effect,
      siege_effect: s.siege_effect,
      channeling_effect: s.channeling_effect,
      shielding_effect: s.shielding_effect,
      housing_effect: s.housing_effect,
      science_total_books: s.science_total_books,
    });
  }
  for (const s of surveyRows) {
    Object.assign(byId.get(s.province_id)!, {
      survey_age: s.survey_age,
      watch_towers_effect: s.watch_towers_effect,
      thieves_dens_effect: s.thieves_dens_effect,
      castles_effect: s.castles_effect,
      barren_land: s.barren_land,
      homes_built: s.homes_built,
      guilds_built: s.guilds_built,
      buildings_built: s.buildings_built,
      buildings_in_progress: s.buildings_in_progress,
    });
  }
  for (const s of homeMilitaryRows) {
    Object.assign(byId.get(s.province_id)!, {
      off_home: s.off_home,
      def_home: s.def_home,
      home_mil_age: s.home_mil_age,
      home_mil_source: s.home_mil_source,
    });
  }
  for (const s of militaryRows) {
    const row = byId.get(s.province_id)!;
    if (s.source_group === "som") {
      row.ome = s.ome;
      row.dme = s.dme;
      row.som_age = s.received_at;
    } else {
      row.throne_age = s.received_at;
    }
  }
  for (const s of armyRows) {
    const somJson =
      typeof s.som_armies_json === "string"
        ? s.som_armies_json
        : s.som_armies_json
          ? JSON.stringify(s.som_armies_json)
          : null;
    const throneJson =
      typeof s.throne_armies_json === "string"
        ? s.throne_armies_json
        : s.throne_armies_json
          ? JSON.stringify(s.throne_armies_json)
          : null;
    Object.assign(byId.get(s.province_id)!, {
      armies_out_count: s.armies_out_count,
      land_incoming: s.land_incoming,
      earliest_return: s.earliest_return,
      som_armies_json: somJson,
      throne_armies_json: throneJson,
    });
  }
}

export async function getKingdomProvinces(
  kingdom: string,
  keyHash: string,
): Promise<ProvinceRow[]> {
  await ensureReady();

  const [sql, vals] = n(
    `
    WITH ${latestSlotCte("AND ki.location = :kingdom")}
    SELECT p.id, p.name, p.kingdom,
           (SELECT ls.slot FROM latest_slot ls WHERE ls.kingdom = p.kingdom AND ls.name = p.name) AS slot,
           ${OVERVIEW_RACE_SQL}, ${OVERVIEW_PERS_SQL}, ${OVERVIEW_HONOR_SQL},
           po.land, po.networth, po.received_at AS overview_age, po.source AS overview_source,
           p.cached_ppa, p.cached_ppa_age,
           p.cached_rtpa, p.cached_rtpa_age,
           p.cached_mtpa, p.cached_mtpa_age,
           p.cached_otpa, p.cached_otpa_age,
           p.cached_dtpa, p.cached_dtpa_age,
           p.cached_rwpa, p.cached_rwpa_age,
           p.cached_mwpa, p.cached_mwpa_age
    FROM provinces p
    JOIN province_overview po ON po.id = (
      SELECT po2.id FROM province_overview po2
      WHERE po2.province_id = p.id AND po2.key_hash = :keyHash
      ORDER BY po2.received_at DESC, po2.id DESC
      LIMIT 1
    )
    WHERE p.kingdom = :kingdom
      AND EXISTS (SELECT 1 FROM intel_partitions WHERE key_hash = :keyHash AND province_id = p.id)
      AND (
        EXISTS (SELECT 1 FROM latest_slot WHERE kingdom = p.kingdom AND name = p.name)
        OR NOT EXISTS (
          SELECT 1 FROM kingdom_provinces kp
          JOIN kingdom_intel ki ON kp.kingdom_intel_id = ki.id
          WHERE ki.location = p.kingdom AND ki.key_hash = :keyHash AND kp.name = p.name
        )
      )
    ORDER BY po.networth IS NULL ASC, po.networth DESC
  `,
    { keyHash, kingdom },
  );

  const [baseRows] = await pool.execute<any[]>(
    sql,
    vals as import("mysql2").ExecuteValues,
  );

  const rows = (baseRows as any[]).map((base) => ({
    ...base,
    off_points: null,
    def_points: null,
    military_age: null,
    military_source: null,
    soldiers: null,
    off_specs: null,
    def_specs: null,
    elites: null,
    war_horses: null,
    peasants: null,
    troops_age: null,
    troops_source: null,
    soldiers_home: null,
    off_specs_home: null,
    def_specs_home: null,
    elites_home: null,
    troops_home_age: null,
    off_home: null,
    def_home: null,
    home_mil_age: null,
    home_mil_source: null,
    money: null,
    food: null,
    runes: null,
    prisoners: null,
    trade_balance: null,
    building_efficiency: null,
    thieves: null,
    thieves_age: null,
    stealth: null,
    wizards: null,
    mana: null,
    total_pop: null,
    max_pop: null,
    resources_age: null,
    resources_source: null,
    free_specialist_credits: null,
    free_specialist_credits_age: null,
    free_building_credits: null,
    free_building_credits_age: null,
    hit_status: null,
    status_age: null,
    effects_age: null,
    good_spell_details: null,
    bad_spell_details: null,
    good_spell_count: null,
    bad_spell_count: null,
    ome: null,
    dme: null,
    som_age: null,
    throne_age: null,
    sciences_age: null,
    crime_effect: null,
    channeling_effect: null,
    siege_effect: null,
    shielding_effect: null,
    science_total_books: null,
    survey_age: null,
    watch_towers_effect: null,
    thieves_dens_effect: null,
    castles_effect: null,
    housing_effect: null,
    barren_land: null,
    homes_built: null,
    guilds_built: null,
    buildings_built: null,
    buildings_in_progress: null,
    armies_out_count: null,
    land_incoming: null,
    earliest_return: null,
    som_armies_json: null,
    throne_armies_json: null,
    armies_out_json: null,
  })) as ProvinceRow[];

  if (rows.length === 0) return rows;

  await hydrateKingdomProvinceRows(rows, keyHash);

  for (const row of rows) {
    row.armies_out_json = mergeArmiesJson(
      row.som_armies_json,
      row.throne_armies_json,
      row.som_age,
      row.throne_age,
    );
    const allArmiesHome = (row.armies_out_count ?? 0) === 0;
    const homeMilitaryNewer =
      !!row.home_mil_age &&
      (!row.military_age || row.home_mil_age > row.military_age);
    const homeMilitaryFromSoM =
      row.home_mil_source === "som" ||
      row.home_mil_source === "council_military";
    if (
      row.som_age &&
      allArmiesHome &&
      homeMilitaryNewer &&
      homeMilitaryFromSoM
    ) {
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

export async function getProvinceDetail(
  name: string,
  kingdom: string,
  keyHash: string,
): Promise<ProvinceDetail> {
  await ensureReady();
  const nullResult: ProvinceDetail = {
    province: null,
    overview: null,
    totalMilitary: null,
    homeMilitary: null,
    sot: null,
    resources: null,
    status: null,
    effects: [],
    militaryIntel: null,
    survey: null,
    sciences: null,
  };

  interface ProvRow extends RowDataPacket {
    id: number;
    name: string;
    kingdom: string;
  }
  interface AccessRow extends RowDataPacket {
    n: number;
  }

  const [[prov]] = await pool.execute<ProvRow[]>(
    "SELECT id, name, kingdom FROM provinces WHERE name = ? AND kingdom = ?",
    [name, kingdom],
  );
  if (!prov) return nullResult;

  const [[access]] = await pool.execute<AccessRow[]>(
    "SELECT COUNT(*) AS n FROM intel_partitions WHERE key_hash = ? AND province_id = ?",
    [keyHash, prov.id],
  );
  if (!access.n) return nullResult;

  const id = prov.id;

  const [slotSql, slotVals] = n(
    `WITH ${latestSlotCte("AND ki.location = :kingdom")} SELECT slot FROM latest_slot WHERE kingdom = :kingdom AND name = :name LIMIT 1`,
    { keyHash, kingdom, name },
  );

  const [
    slotRows,
    overviewRows,
    tmRows,
    hmRows,
    troopRows,
    resRows,
    totalPopRows,
    thievesRows,
    creditsRows,
    buildCreditsRows,
    statusRows,
    effectRows,
    miSomRows,
    miThroneRows,
    surveyRows,
    sosRows,
  ] = await Promise.all([
    pool
      .execute<any[]>(slotSql, slotVals as import("mysql2").ExecuteValues)
      .then(([r]) => r),
    pool
      .execute<any[]>(
        `SELECT land, networth, source, saved_by, received_at,
              (SELECT race        FROM province_overview WHERE province_id = ? AND key_hash = ? AND race        IS NOT NULL ORDER BY received_at DESC LIMIT 1) AS race,
              (SELECT personality FROM province_overview WHERE province_id = ? AND key_hash = ? AND personality IS NOT NULL ORDER BY received_at DESC LIMIT 1) AS personality,
              (SELECT honor_title FROM province_overview WHERE province_id = ? AND key_hash = ? AND honor_title IS NOT NULL ORDER BY received_at DESC LIMIT 1) AS honor_title,
              (SELECT ruler       FROM province_overview WHERE province_id = ? AND key_hash = ? AND ruler       IS NOT NULL ORDER BY received_at DESC LIMIT 1) AS ruler
       FROM province_overview WHERE province_id = ? AND key_hash = ? ORDER BY received_at DESC LIMIT 1`,
        [id, keyHash, id, keyHash, id, keyHash, id, keyHash, id, keyHash],
      )
      .then(([r]) => r),
    pool
      .execute<
        any[]
      >("SELECT off_points, def_points, source, received_at FROM total_military_points WHERE province_id = ? AND key_hash = ? ORDER BY received_at DESC LIMIT 1", [id, keyHash])
      .then(([r]) => r),
    pool
      .execute<
        any[]
      >("SELECT mod_off_at_home, mod_def_at_home, source, received_at FROM home_military_points WHERE province_id = ? AND key_hash = ? ORDER BY received_at DESC LIMIT 1", [id, keyHash])
      .then(([r]) => r),
    pool
      .execute<
        any[]
      >("SELECT soldiers, off_specs, def_specs, elites, war_horses, peasants, source, received_at FROM province_troops WHERE province_id = ? AND key_hash = ? AND source IN ('sot','throne') ORDER BY received_at DESC LIMIT 1", [id, keyHash])
      .then(([r]) => r),
    pool
      .execute<
        any[]
      >("SELECT money, food, runes, prisoners, trade_balance, building_efficiency, stealth, wizards, mana, received_at FROM province_resources WHERE province_id = ? AND key_hash = ? AND source IN ('sot','throne') ORDER BY received_at DESC LIMIT 1", [id, keyHash])
      .then(([r]) => r),
    pool
      .execute<
        any[]
      >("SELECT total_pop, max_pop FROM province_resources WHERE province_id = ? AND key_hash = ? AND total_pop IS NOT NULL ORDER BY received_at DESC LIMIT 1", [id, keyHash])
      .then(([r]) => r),
    pool
      .execute<
        any[]
      >("SELECT thieves, received_at FROM province_resources WHERE province_id = ? AND key_hash = ? AND thieves IS NOT NULL ORDER BY received_at DESC LIMIT 1", [id, keyHash])
      .then(([r]) => r),
    pool
      .execute<
        any[]
      >("SELECT free_specialist_credits, received_at FROM province_resources WHERE province_id = ? AND key_hash = ? AND free_specialist_credits IS NOT NULL ORDER BY received_at DESC LIMIT 1", [id, keyHash])
      .then(([r]) => r),
    pool
      .execute<
        any[]
      >("SELECT free_building_credits, received_at FROM province_resources WHERE province_id = ? AND key_hash = ? AND free_building_credits IS NOT NULL ORDER BY received_at DESC LIMIT 1", [id, keyHash])
      .then(([r]) => r),
    pool
      .execute<
        any[]
      >("SELECT plagued, overpopulated, overpop_deserters, dragon_type, dragon_name, hit_status, war, received_at FROM province_status WHERE province_id = ? AND key_hash = ? ORDER BY received_at DESC LIMIT 1", [id, keyHash])
      .then(([r]) => r),
    pool
      .execute<any[]>(
        `SELECT effect_name, effect_kind, duration_text, remaining_ticks, effectiveness_percent, received_at
       FROM (
         SELECT effect_name, effect_kind, duration_text, remaining_ticks, effectiveness_percent, received_at,
                ROW_NUMBER() OVER (PARTITION BY effect_name, effect_kind ORDER BY id DESC) AS rn
         FROM province_effects
         WHERE province_id = ? AND key_hash = ?
           AND received_at = (SELECT MAX(pe2.received_at) FROM province_effects pe2 WHERE pe2.province_id = ?)
       ) ranked WHERE rn = 1
       ORDER BY effect_kind ASC, effect_name ASC`,
        [id, keyHash, id],
      )
      .then(([r]) => r),
    pool
      .execute<
        any[]
      >("SELECT id, ome, dme, received_at FROM military_intel WHERE province_id = ? AND key_hash = ? AND source IN ('som','council_military') ORDER BY received_at DESC LIMIT 1", [id, keyHash])
      .then(([r]) => r),
    pool
      .execute<
        any[]
      >("SELECT id, received_at FROM military_intel WHERE province_id = ? AND key_hash = ? AND source = 'throne' ORDER BY received_at DESC LIMIT 1", [id, keyHash])
      .then(([r]) => r),
    pool
      .execute<
        any[]
      >("SELECT id, received_at FROM survey_intel WHERE province_id = ? AND key_hash = ? ORDER BY received_at DESC LIMIT 1", [id, keyHash])
      .then(([r]) => r),
    pool
      .execute<
        any[]
      >("SELECT id, received_at FROM sos_intel WHERE province_id = ? AND key_hash = ? ORDER BY received_at DESC LIMIT 1", [id, keyHash])
      .then(([r]) => r),
  ]);

  const slotRow = slotRows[0] ?? null;
  const ovRaw = overviewRows[0] ?? null;
  const tmRaw = tmRows[0] ?? null;
  const hmRaw = hmRows[0] ?? null;
  const troopRaw = troopRows[0] ?? null;
  const resRaw = resRows[0] ?? null;
  const totalPopRaw = totalPopRows[0] ?? null;
  const thievesRaw = thievesRows[0] ?? null;
  const creditsRaw = creditsRows[0] ?? null;
  const buildCreditsRaw = buildCreditsRows[0] ?? null;
  const statusRaw = statusRows[0] ?? null;
  const miSomRaw = miSomRows[0] ?? null;
  const miThroneRaw = miThroneRows[0] ?? null;
  const surveyRaw = surveyRows[0] ?? null;
  const sosRaw = sosRows[0] ?? null;

  const overview = ovRaw
    ? {
        race: ovRaw.race ?? null,
        personality: ovRaw.personality ?? null,
        honorTitle: ovRaw.honor_title ?? null,
        ruler: ovRaw.ruler ?? null,
        land: ovRaw.land,
        networth: ovRaw.networth,
        source: ovRaw.source,
        savedBy: ovRaw.saved_by,
        receivedAt: ovRaw.received_at,
      }
    : null;

  const armySnapshotRows = await pool
    .execute<any[]>(
      `SELECT chosen.id AS military_intel_id, COUNT(sa.id) AS armies_out_count
     FROM (
       SELECT CASE
         WHEN throne.id IS NOT NULL AND (som.id IS NULL OR throne.received_at > som.received_at) THEN throne.id
         ELSE som.id
       END AS id
       FROM (SELECT id, received_at FROM military_intel WHERE province_id = ? AND key_hash = ? AND source IN ('som','council_military') ORDER BY received_at DESC LIMIT 1) som
       LEFT JOIN (SELECT id, received_at FROM military_intel WHERE province_id = ? AND key_hash = ? AND source = 'throne' ORDER BY received_at DESC LIMIT 1) throne ON 1=1
     ) chosen
     LEFT JOIN som_armies sa ON sa.military_intel_id = chosen.id AND sa.return_days IS NOT NULL`,
      [id, keyHash, id, keyHash],
    )
    .then(([r]) => r);
  const armySnapshot = armySnapshotRows[0] ?? null;

  const allArmiesHome =
    armySnapshot?.military_intel_id != null &&
    (armySnapshot.armies_out_count ?? 0) === 0;
  const homeMilitaryNewer =
    !!hmRaw && (!tmRaw || hmRaw.received_at > tmRaw.received_at);
  const homeMilitaryFromSoM =
    hmRaw?.source === "som" || hmRaw?.source === "council_military";
  const totalMilitary =
    homeMilitaryFromSoM &&
    homeMilitaryNewer &&
    allArmiesHome &&
    (hmRaw.mod_off_at_home != null || hmRaw.mod_def_at_home != null)
      ? {
          offPoints: hmRaw.mod_off_at_home,
          defPoints: hmRaw.mod_def_at_home,
          source: hmRaw.source,
          receivedAt: hmRaw.received_at,
        }
      : tmRaw
        ? {
            offPoints: tmRaw.off_points,
            defPoints: tmRaw.def_points,
            source: tmRaw.source,
            receivedAt: tmRaw.received_at,
          }
        : null;

  const homeMilitary = hmRaw
    ? {
        modOffAtHome: hmRaw.mod_off_at_home,
        modDefAtHome: hmRaw.mod_def_at_home,
        source: hmRaw.source,
        receivedAt: hmRaw.received_at,
      }
    : null;

  const sot = troopRaw
    ? {
        soldiers: troopRaw.soldiers,
        offSpecs: troopRaw.off_specs,
        defSpecs: troopRaw.def_specs,
        elites: troopRaw.elites,
        warHorses: troopRaw.war_horses,
        peasants: troopRaw.peasants,
        source: troopRaw.source,
        receivedAt: troopRaw.received_at,
      }
    : null;

  const resources = resRaw
    ? {
        money: resRaw.money,
        food: resRaw.food,
        runes: resRaw.runes,
        prisoners: resRaw.prisoners,
        tradeBalance: resRaw.trade_balance,
        buildingEfficiency: resRaw.building_efficiency,
        thieves: thievesRaw?.thieves ?? null,
        thievesAge: thievesRaw?.received_at ?? null,
        stealth: resRaw.stealth,
        wizards: resRaw.wizards,
        mana: resRaw.mana,
        totalPop: totalPopRaw?.total_pop ?? null,
        maxPop: totalPopRaw?.max_pop ?? null,
        freeSpecialistCredits: creditsRaw?.free_specialist_credits ?? null,
        freeSpecialistCreditsAge: creditsRaw?.received_at ?? null,
        freeBuildingCredits: buildCreditsRaw?.free_building_credits ?? null,
        freeBuildingCreditsAge: buildCreditsRaw?.received_at ?? null,
        receivedAt: resRaw.received_at,
      }
    : null;

  const status = statusRaw
    ? {
        plagued: !!statusRaw.plagued,
        overpopulated: !!statusRaw.overpopulated,
        overpopDeserters: statusRaw.overpop_deserters ?? null,
        dragonType: statusRaw.dragon_type ?? null,
        dragonName: statusRaw.dragon_name ?? null,
        hitStatus: statusRaw.hit_status,
        war: !!statusRaw.war,
        receivedAt: statusRaw.received_at,
      }
    : null;

  const effects = effectRows.map((e: any) => ({
    name: e.effect_name,
    kind: e.effect_kind,
    durationText: e.duration_text,
    remainingTicks: e.remaining_ticks,
    effectivenessPercent: e.effectiveness_percent,
    receivedAt: e.received_at,
  }));

  let militaryIntel = null;
  if (miSomRaw || miThroneRaw) {
    const [somArmyRows, throneArmyRows] = await Promise.all([
      miSomRaw
        ? pool
            .execute<
              any[]
            >("SELECT army_type, generals, soldiers, off_specs, def_specs, elites, war_horses, thieves, land_gained, return_days FROM som_armies WHERE military_intel_id = ?", [miSomRaw.id])
            .then(([r]) => r)
        : Promise.resolve([] as any[]),
      miThroneRaw
        ? pool
            .execute<
              any[]
            >("SELECT army_type, land_gained, return_days FROM som_armies WHERE military_intel_id = ?", [miThroneRaw.id])
            .then(([r]) => r)
        : Promise.resolve([] as any[]),
    ]);
    const somArmies: SomArmy[] = somArmyRows.map((a: any) => ({
      type: a.army_type,
      generals: a.generals,
      soldiers: a.soldiers,
      offSpecs: a.off_specs,
      defSpecs: a.def_specs,
      elites: a.elites,
      warHorses: a.war_horses,
      thieves: a.thieves,
      land: a.land_gained,
      eta: a.return_days,
    }));
    const throneArmies: ThroneArmy[] = throneArmyRows.map((a: any) => ({
      type: a.army_type,
      land: a.land_gained,
      eta: a.return_days,
    }));
    const throneNewer = !!(
      miThroneRaw &&
      (!miSomRaw || miThroneRaw.received_at > miSomRaw.received_at)
    );
    militaryIntel = {
      ome: miSomRaw?.ome ?? null,
      dme: miSomRaw?.dme ?? null,
      receivedAt: miSomRaw?.received_at ?? miThroneRaw?.received_at,
      armies: mergeArmyArrays(somArmies, throneArmies, throneNewer),
    };
  }

  let survey = null;
  if (surveyRaw) {
    const [buildingRows] = await pool.execute<any[]>(
      "SELECT building, built, in_progress FROM survey_buildings WHERE survey_intel_id = ? ORDER BY built DESC",
      [surveyRaw.id],
    );
    survey = {
      receivedAt: surveyRaw.received_at,
      buildings: (buildingRows as any[]).map((b) => ({
        building: b.building,
        built: b.built,
        inProgress: b.in_progress,
      })),
    };
  }

  let sciences = null;
  if (sosRaw) {
    const [sciRows] = await pool.execute<any[]>(
      "SELECT science, books, effect FROM sos_sciences WHERE sos_intel_id = ? ORDER BY books DESC",
      [sosRaw.id],
    );
    sciences = {
      receivedAt: sosRaw.received_at,
      sciences: (sciRows as any[]).map((s) => ({
        science: s.science,
        books: s.books,
        effect: s.effect,
      })),
    };
  }

  return {
    province: { ...prov, slot: slotRow?.slot ?? null },
    overview,
    totalMilitary,
    homeMilitary,
    sot,
    resources,
    status,
    effects,
    militaryIntel,
    survey,
    sciences,
  };
}

export async function getProvinceNews(
  name: string,
  kingdom: string,
  keyHash: string,
  from?: string,
  to?: string,
  limit = 500,
): Promise<{ events: ProvinceNewsRow[]; effectiveFrom: string | null }> {
  await ensureReady();

  let fromOrd: number;
  let toOrd: number;
  let effectiveFrom: string | null = from ?? null;

  if (from || to) {
    fromOrd = from ? parseUtopiaDate(from) : 0;
    toOrd = to ? parseUtopiaDate(to) : 999999;
  } else {
    const [[maxRow]] = await pool.execute<any[]>(
      `SELECT MAX(pn.game_date_ord) AS m
       FROM province_news pn JOIN provinces p ON pn.province_id = p.id
       WHERE p.name = ? AND p.kingdom = ? AND pn.key_hash = ?`,
      [name, kingdom, keyHash],
    );
    const maxOrd = (maxRow as any)?.m ?? 0;
    fromOrd = maxOrd - 3 * UTOPIA_DAYS_PER_MONTH + 1;
    toOrd = 999999;
    effectiveFrom = fromOrd > 0 ? formatUtopiaDate(fromOrd) : null;
  }

  const [rows] = await pool.execute<any[]>(
    `SELECT pn.id, pn.game_date, pn.game_date_ord, pn.event_type, pn.raw_text,
            pn.actor_name, pn.actor_kingdom, pn.amount, NULLIF(pn.resource_type, '') AS resource_type,
            pn.received_at
     FROM province_news pn
     JOIN provinces p ON pn.province_id = p.id
     WHERE p.name = ? AND p.kingdom = ? AND pn.key_hash = ?
       AND pn.game_date_ord >= ? AND pn.game_date_ord <= ?
     ORDER BY pn.game_date_ord DESC, pn.id DESC
     LIMIT ?`,
    [name, kingdom, keyHash, fromOrd, toOrd, limit],
  );

  const events = (rows as any[]).map((r) => ({
    id: r.id,
    gameDate: r.game_date,
    gameDateOrd: r.game_date_ord,
    eventType: r.event_type,
    rawText: r.raw_text,
    actorName: r.actor_name,
    actorKingdom: r.actor_kingdom,
    amount: r.amount,
    resourceType: r.resource_type,
    receivedAt: r.received_at,
  }));

  return { events, effectiveFrom };
}

export async function getKingdomOpsStats(
  kingdom: string,
  keyHash: string,
  from?: string,
  to?: string,
  timeMode: TimeRangeMode = "utopia",
): Promise<KingdomOpsStats> {
  await ensureReady();

  interface MaxRow extends RowDataPacket {
    m: number | null;
  }
  let effectiveFrom: string | null = from ?? null;
  let fromOrd = 0;
  let toOrd = 999999;
  let robFromTime: string | null = null;
  let realFrom: string | null = null;
  let realTo: string | null = null;

  if (timeMode === "real") {
    realFrom = normalizeRealDateTime(from);
    realTo = normalizeRealDateTime(to);
  } else {
    const [[maxRow]] = await pool.execute<MaxRow[]>(
      "SELECT MAX(game_date_ord) AS m FROM province_news WHERE key_hash = ?",
      [keyHash],
    );
    const maxOrd = (maxRow as any)?.m ?? 0;

    if (from || to) {
      fromOrd = from ? parseUtopiaDate(from) : 0;
      toOrd = to ? parseUtopiaDate(to) : 999999;
    } else {
      fromOrd = maxOrd - 3 * UTOPIA_DAYS_PER_MONTH + 1;
      toOrd = 999999;
      effectiveFrom = fromOrd > 0 ? formatUtopiaDate(fromOrd) : null;
    }

    // Approximate wall-clock cutoff for rows that lack game_date_ord.
    // 1 Utopia tick = 1 real hour, so fromOrd ticks before maxOrd ≈
    // (maxOrd - fromOrd) hours ago. This keeps live ops without game dates
    // visible while province-log rows use their exact Utopia date.
    const ordDelta =
      maxOrd > 0 && fromOrd > 0 ? Math.max(0, maxOrd - fromOrd) : null;
    robFromTime =
      ordDelta !== null
        ? new Date(Date.now() - ordDelta * 3_600_000)
            .toISOString()
            .slice(0, 19)
            .replace("T", " ")
        : null;
  }

  const robDateClause =
    timeMode === "real"
      ? `${realFrom ? "AND r.received_at >= ?" : ""} ${realTo ? "AND r.received_at <= ?" : ""}`
      : `AND (
           (r.game_date_ord IS NOT NULL AND r.game_date_ord >= ? AND r.game_date_ord <= ?)
           OR (r.game_date_ord IS NULL${robFromTime ? " AND r.received_at >= ?" : ""})
         )`;

  // Outgoing: our provinces' activity against kingdom, grouped by (op, our_province)
  const outParams: (string | number)[] = [keyHash, kingdom];
  if (timeMode === "real") {
    if (realFrom) outParams.push(realFrom);
    if (realTo) outParams.push(realTo);
  } else {
    outParams.push(fromOrd, toOrd);
    if (robFromTime) outParams.push(robFromTime);
  }
  const [outRows] = await pool.execute<any[]>(
    `SELECT
       r.op,
       p.name AS province_name,
       COUNT(*) AS attempts,
       SUM(IF(r.outcome='success', 1, 0)) AS successes,
       SUM(CASE
         WHEN r.op IN ('vaults','granaries','towers') AND r.outcome='success' THEN COALESCE(r.amount_stolen, 0)
         WHEN r.op='night_strike'  AND r.outcome='success' THEN COALESCE(r.troops_assassinated, 0)
         WHEN r.op='kidnap'        AND r.outcome='success' THEN COALESCE(r.kidnapped, 0)
         WHEN r.op IN ('arson','greater_arson') AND r.outcome='success' THEN COALESCE(r.acres_burned, 0)
         WHEN r.op='propaganda'    AND r.outcome='success' THEN COALESCE(r.deserters, 0)
         WHEN r.op='assassinate_wizards' AND r.outcome='success' THEN COALESCE(r.wizards_assassinated, 0)
         WHEN r.op='free_prisoners' AND r.outcome='success' THEN COALESCE(r.prisoners_captured, 0)
         WHEN r.outcome='success' THEN 1
         ELSE 0
       END) AS amount,
       r.deserter_type AS unit_type,
       SUM(r.thieves_lost) AS thieves_lost,
       CASE WHEN r.op = 'greater_arson' THEN r.arson_building ELSE NULL END AS arson_building
     FROM rob_ops r
     JOIN provinces p ON p.id = r.province_id
     WHERE r.key_hash = ? AND r.target_kingdom = ?
       AND COALESCE(r.source, '') != 'province_logs'
       ${robDateClause}
     GROUP BY r.op, r.province_id, p.name, r.deserter_type,
              CASE WHEN r.op = 'greater_arson' THEN r.arson_building ELSE NULL END`,
    outParams,
  );

  // Incoming: province_news from this kingdom grouped by (event_type, resource_type, actor_name)
  const inParams: (string | number)[] = [keyHash, kingdom];
  const inDateClause =
    timeMode === "real"
      ? `${realFrom ? "AND pn.received_at >= ?" : ""} ${realTo ? "AND pn.received_at <= ?" : ""}`
      : "AND pn.game_date_ord >= ? AND pn.game_date_ord <= ?";
  if (timeMode === "real") {
    if (realFrom) inParams.push(realFrom);
    if (realTo) inParams.push(realTo);
  } else {
    inParams.push(fromOrd, toOrd);
  }
  const [inRows] = await pool.execute<any[]>(
    `SELECT
       pn.event_type,
       NULLIF(pn.resource_type, '') AS resource_type,
       pn.actor_name AS province_name,
       COUNT(*) AS cnt,
       SUM(COALESCE(pn.amount, 0)) AS amount
     FROM province_news pn
     WHERE pn.key_hash = ? AND pn.actor_kingdom = ?
       ${inDateClause}
     GROUP BY pn.event_type, pn.resource_type, pn.actor_name`,
    inParams,
  );

  // Slot lookup for enemy province names
  const [slotSql, slotVals] = n(
    `WITH ${latestSlotCte("AND ki.location = :kingdom")}
     SELECT name, slot FROM latest_slot WHERE kingdom = :kingdom`,
    { keyHash, kingdom },
  );
  const [slotRows] = await pool.execute<any[]>(
    slotSql,
    slotVals as import("mysql2").ExecuteValues,
  );
  const slotMap = new Map<string, number | null>();
  for (const r of slotRows as any[]) slotMap.set(r.name, r.slot ?? null);

  // Map province_news event_type + resource_type → op name
  function eventToOp(
    eventType: string,
    resourceType: string | null,
  ): string | null {
    if (eventType === "resource_stolen") {
      if (resourceType === "gold") return "vaults";
      if (resourceType === "food") return "granaries";
      if (resourceType === "runes") return "towers";
      return null;
    }
    const m: Record<string, string> = {
      troops_killed: "night_strike",
      peasants_kidnapped: "kidnap",
      rioting: "incite_riots",
      turncoat_general: "bribe_generals",
      turncoat_thieves: "bribe_thieves",
      thief_sabotage_wizards: "sabotage_wizards",
      arson: "arson",
      thief_propaganda: "propaganda",
      thief_detected: "detected",
      thief_detected_unknown: "detected",
      thief_foiled: "detected",
      thief_foiled_shadowlight: "detected",
    };
    return m[eventType] ?? null;
  }

  // Normalize plural → singular, title-case for propaganda unit types (handles existing DB data).
  function normUnit(raw: string | null): string | null {
    if (!raw) return null;
    const lower = raw.toLowerCase();
    if (lower === "thieves" || lower === "thieve") return "Thief";
    const singular =
      raw.length > 2 && raw.endsWith("s") ? raw.slice(0, -1) : raw;
    return singular.charAt(0).toUpperCase() + singular.slice(1);
  }

  // Build outgoing: Map<op, Map<key, OpProvEntry>>
  // Key is "province_name|unit_type" so propaganda entries split per unit type.
  const outByOp = new Map<string, Map<string, OpProvEntry>>();
  for (const r of outRows as any[]) {
    if (!r.province_name) continue;
    if (!outByOp.has(r.op)) outByOp.set(r.op, new Map());
    const unitType = normUnit((r.unit_type as string | null) ?? null);
    const arsonBuilding = (r.arson_building as string | null) ?? null;
    const key = `${r.province_name}|${unitType ?? ""}|${arsonBuilding ?? ""}`;
    outByOp.get(r.op)!.set(key, {
      provinceName: r.province_name,
      slot: null,
      attempts: Number(r.attempts),
      successes: Number(r.successes),
      amount: Number(r.amount),
      unitType,
      thievesLost: Number(r.thieves_lost ?? 0),
      arsonBuilding,
    });
  }

  // Build incoming: Map<op, Map<key, OpProvEntry>>
  // Key is "province_name|unit_type" so propaganda entries split per unit type.
  const inByOp = new Map<string, Map<string, OpProvEntry>>();
  for (const r of inRows as any[]) {
    if (!r.province_name) continue;
    const op = eventToOp(r.event_type, r.resource_type as string | null);
    if (!op) continue;
    if (!inByOp.has(op)) inByOp.set(op, new Map());
    const provMap = inByOp.get(op)!;
    const isDetection = op === "detected";
    const amt = Number(r.amount);
    const unitType =
      r.event_type === "thief_propaganda"
        ? normUnit((r.resource_type as string | null) ?? null)
        : null;
    const key = `${r.province_name}|${unitType ?? ""}`;
    const existing = provMap.get(key);
    if (existing) {
      existing.attempts += Number(r.cnt);
      existing.amount += amt;
    } else {
      provMap.set(key, {
        provinceName: r.province_name,
        slot: slotMap.get(r.province_name) ?? null,
        attempts: Number(r.cnt),
        successes: isDetection ? 0 : Number(r.cnt),
        amount: amt,
        unitType,
        thievesLost: 0,
        arsonBuilding: null,
      });
    }
  }

  // Merge op types and sort each list by amount desc, then successes desc
  const sortEntries = (entries: OpProvEntry[]) =>
    entries.sort((a, b) => b.amount - a.amount || b.successes - a.successes);

  const allOps = new Set([...outByOp.keys(), ...inByOp.keys()]);
  const breakdowns: OpTypeBreakdown[] = [];
  for (const op of allOps) {
    const outgoing = sortEntries([...(outByOp.get(op)?.values() ?? [])]);
    const incoming = sortEntries([...(inByOp.get(op)?.values() ?? [])]);
    breakdowns.push({ op, outgoing, incoming });
  }

  // Sort sections by total impact desc
  breakdowns.sort((a, b) => {
    const ta =
      a.outgoing.reduce((s, e) => s + e.amount, 0) +
      a.incoming.reduce((s, e) => s + e.amount, 0);
    const tb =
      b.outgoing.reduce((s, e) => s + e.amount, 0) +
      b.incoming.reduce((s, e) => s + e.amount, 0);
    return tb - ta;
  });

  return { breakdowns, effectiveFrom };
}

// Non-damage events — excluded from totalImpact used for province sort ordering
const NON_DAMAGE_EVENT_TYPES = new Set([
  // Positive
  "aid_received",
  "monthly_dedication",
  "war_victory_reward",
  "utopian_lords_reward",
  "new_scientist",
  "exploration",
  // Neutral/defensive/informational
  "thief_detected",
  "thief_detected_unknown",
  "thief_foiled",
  "thief_foiled_shadowlight",
  "attack_failed",
  "spell_detected",
  "war_ended",
  "war_loss_penalty",
  "starvation",
  "ritual_shortened",
  "plague_ended",
  "inactivity_penalty",
  "desertions",
  "other",
]);

export async function getIncomingDamageStats(
  keyHash: string,
  from?: string,
  to?: string,
): Promise<IncomingDamageStats> {
  await ensureReady();

  interface MaxRow extends RowDataPacket {
    m: number | null;
  }
  let fromOrd: number;
  let toOrd: number;
  let effectiveFrom: string | null = from ?? null;

  if (from || to) {
    fromOrd = from ? parseUtopiaDate(from) : 0;
    toOrd = to ? parseUtopiaDate(to) : 999999;
  } else {
    const [[maxRow]] = await pool.execute<MaxRow[]>(
      "SELECT MAX(game_date_ord) AS m FROM province_news WHERE key_hash = ?",
      [keyHash],
    );
    const maxOrd = (maxRow as any)?.m ?? 0;
    fromOrd = maxOrd - 3 * UTOPIA_DAYS_PER_MONTH + 1;
    toOrd = 999999;
    effectiveFrom = fromOrd > 0 ? formatUtopiaDate(fromOrd) : null;
  }

  const [rows] = await pool.execute<any[]>(
    `SELECT
       p.name AS province_name,
       pn.event_type,
       NULLIF(pn.resource_type, '') AS resource_type,
       COUNT(*) AS cnt,
       SUM(COALESCE(pn.amount, 0)) AS total_amount
     FROM province_news pn
     JOIN provinces p ON p.id = pn.province_id
     WHERE pn.key_hash = ?
       AND pn.game_date_ord >= ? AND pn.game_date_ord <= ?
     GROUP BY p.name, pn.event_type, pn.resource_type`,
    [keyHash, fromOrd, toOrd],
  );

  // Group by province, compute per-province totalImpact from damage events only
  const byProvince = new Map<string, IncomingDamageProvinceStat>();
  for (const r of rows as any[]) {
    const provinceName = r.province_name as string;
    const eventType = r.event_type as string;
    const resourceType = r.resource_type as string | null;
    const count = Number(r.cnt);
    const totalAmount = Number(r.total_amount);
    const isNonDamage = NON_DAMAGE_EVENT_TYPES.has(eventType);

    if (!byProvince.has(provinceName)) {
      byProvince.set(provinceName, {
        provinceName,
        totalImpact: 0,
        events: [],
      });
    }
    const stat = byProvince.get(provinceName)!;
    stat.events.push({ eventType, resourceType, count, totalAmount });
    if (!isNonDamage) stat.totalImpact += totalAmount || count;
  }

  // Within each province sort events: damage first by amount desc, then non-damage
  for (const stat of byProvince.values()) {
    stat.events.sort((a: IncomingProvinceEvent, b: IncomingProvinceEvent) => {
      const aIsNonDmg = NON_DAMAGE_EVENT_TYPES.has(a.eventType) ? 1 : 0;
      const bIsNonDmg = NON_DAMAGE_EVENT_TYPES.has(b.eventType) ? 1 : 0;
      if (aIsNonDmg !== bIsNonDmg) return aIsNonDmg - bIsNonDmg;
      return b.totalAmount - a.totalAmount || b.count - a.count;
    });
  }

  const provinces = [...byProvince.values()].sort(
    (a, b) => b.totalImpact - a.totalImpact,
  );

  return { provinces, effectiveFrom };
}
