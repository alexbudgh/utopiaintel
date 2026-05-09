import { createDbApi, getDb } from "./db";
import type {
  KingdomRow,
  KingdomSnapshot,
  KingdomSnapshotHistoryPoint,
  RecentOp,
  ProvinceRow,
  ProvinceDetail,
  KingdomRitual,
  KingdomDragon,
  KingdomNewsRow,
  NewsProvinceSummary,
  NewsKingdomSummary,
  KingdomNewsSummary,
  ProvinceHistoryPoint,
} from "./db";
import {
  getBoundKingdom as mysqlGetBoundKingdom,
  getLatestKingdomSnapshot as mysqlGetLatestKingdomSnapshot,
  getKingdomSnapshotHistory as mysqlGetKingdomSnapshotHistory,
  getKingdomRitual as mysqlGetKingdomRitual,
  getKingdomDragon as mysqlGetKingdomDragon,
  getLatestWarDate as mysqlGetLatestWarDate,
  getKingdomNews as mysqlGetKingdomNews,
  getRecentOps as mysqlGetRecentOps,
  getKingdoms as mysqlGetKingdoms,
  getKingdomNewsSummary as mysqlGetKingdomNewsSummary,
  getProvinceHistory as mysqlGetProvinceHistory,
  cleanupExpired as mysqlCleanupExpired,
  getKingdomProvinces as mysqlGetKingdomProvinces,
  getProvinceDetail as mysqlGetProvinceDetail,
} from "./db-mysql";

// Re-export row types so callers don't have to import from both db and db-api.
export type {
  KingdomRow,
  KingdomSnapshot,
  KingdomSnapshotHistoryPoint,
  RecentOp,
  ProvinceRow,
  ProvinceDetail,
  KingdomRitual,
  KingdomDragon,
  KingdomNewsRow,
  NewsProvinceSummary,
  NewsKingdomSummary,
  KingdomNewsSummary,
  ProvinceHistoryPoint,
};

// ── Interface ────────────────────────────────────────────────────────────────
// Async mirror of the sync DbApi in lib/db.ts. All methods return Promise<T>.
// App code should import getDbApi() and use this interface — never call the
// sync DbApi or the MySQL functions directly.

export interface AsyncDbApi {
  getBoundKingdom(keyHash: string): Promise<string | null>;
  getKingdoms(keyHash: string): Promise<KingdomRow[]>;
  getLatestKingdomSnapshot(location: string, keyHash: string): Promise<KingdomSnapshot | null>;
  getKingdomSnapshotHistory(location: string, keyHash: string): Promise<KingdomSnapshotHistoryPoint[]>;
  getRecentOps(keyHash: string, limit?: number, since?: string): Promise<RecentOp[]>;
  getKingdomProvinces(kingdom: string, keyHash: string): Promise<ProvinceRow[]>;
  getKingdomRitual(kingdom: string, keyHash: string): Promise<KingdomRitual | null>;
  getKingdomDragon(kingdom: string, keyHash: string): Promise<KingdomDragon | null>;
  getProvinceDetail(name: string, kingdom: string, keyHash: string): Promise<ProvinceDetail>;
  getKingdomNews(kingdom: string, keyHash: string, from?: string, to?: string): Promise<{ events: KingdomNewsRow[]; effectiveFrom: string | null }>;
  getLatestWarDate(kingdom: string, keyHash: string): Promise<string | null>;
  getKingdomNewsSummary(kingdom: string, keyHash: string, from?: string, to?: string): Promise<KingdomNewsSummary>;
  getProvinceHistory(name: string, kingdom: string, keyHash: string): Promise<ProvinceHistoryPoint[]>;
  cleanupExpired(): Promise<void>;
}

// ── SQLite shim ──────────────────────────────────────────────────────────────
// Wraps the synchronous DbApi in Promise.resolve() so it satisfies AsyncDbApi.
// Lazily initialized — getDb() only opens the file when first called.

let _sqliteApi: AsyncDbApi | null = null;

function createSqliteDbApi(): AsyncDbApi {
  if (!_sqliteApi) {
    const sync = createDbApi(getDb());
    _sqliteApi = {
      getBoundKingdom:           (kh)         => Promise.resolve(sync.getBoundKingdom(kh)),
      getKingdoms:               (kh)         => Promise.resolve(sync.getKingdoms(kh)),
      getLatestKingdomSnapshot:  (loc, kh)    => Promise.resolve(sync.getLatestKingdomSnapshot(loc, kh)),
      getKingdomSnapshotHistory: (loc, kh)    => Promise.resolve(sync.getKingdomSnapshotHistory(loc, kh)),
      getRecentOps:              (kh, lim, s) => Promise.resolve(sync.getRecentOps(kh, lim, s)),
      getKingdomProvinces:       (kd, kh)     => Promise.resolve(sync.getKingdomProvinces(kd, kh)),
      getKingdomRitual:          (kd, kh)     => Promise.resolve(sync.getKingdomRitual(kd, kh)),
      getKingdomDragon:          (kd, kh)     => Promise.resolve(sync.getKingdomDragon(kd, kh)),
      getProvinceDetail:         (nm, kd, kh) => Promise.resolve(sync.getProvinceDetail(nm, kd, kh)),
      getKingdomNews:            (kd, kh, f, t) => Promise.resolve(sync.getKingdomNews(kd, kh, f, t)),
      getLatestWarDate:          (kd, kh)     => Promise.resolve(sync.getLatestWarDate(kd, kh)),
      getKingdomNewsSummary:     (kd, kh, f, t) => Promise.resolve(sync.getKingdomNewsSummary(kd, kh, f, t)),
      getProvinceHistory:        (nm, kd, kh) => Promise.resolve(sync.getProvinceHistory(nm, kd, kh)),
      cleanupExpired:            ()           => { sync.cleanupExpired(); return Promise.resolve(); },
    };
  }
  return _sqliteApi;
}

// ── MySQL implementation ─────────────────────────────────────────────────────
// Reads are implemented progressively. Unimplemented methods throw so failures
// are obvious rather than silently returning empty data.

let _mysqlApi: AsyncDbApi | null = null;

function createMysqlDbApi(): AsyncDbApi {
  if (!_mysqlApi) {
    const notYet = (name: string) => () => Promise.reject(new Error(`MySQL: ${name} not yet implemented`));
    _mysqlApi = {
      getBoundKingdom:           (kh)           => mysqlGetBoundKingdom(kh),
      getLatestKingdomSnapshot:  (loc, kh)      => mysqlGetLatestKingdomSnapshot(loc, kh),
      getKingdomSnapshotHistory: (loc, kh)      => mysqlGetKingdomSnapshotHistory(loc, kh),
      getKingdomRitual:          (kd, kh)       => mysqlGetKingdomRitual(kd, kh),
      getKingdomDragon:          (kd, kh)       => mysqlGetKingdomDragon(kd, kh),
      getLatestWarDate:          (kd, kh)       => mysqlGetLatestWarDate(kd, kh),
      getKingdomNews:            (kd, kh, f, t) => mysqlGetKingdomNews(kd, kh, f, t),
      getRecentOps:              (kh, lim, s)   => mysqlGetRecentOps(kh, lim, s),
      getKingdoms:               (kh)           => mysqlGetKingdoms(kh),
      getKingdomNewsSummary:     (kd, kh, f, t) => mysqlGetKingdomNewsSummary(kd, kh, f, t),
      getProvinceHistory:        (nm, kd, kh)   => mysqlGetProvinceHistory(nm, kd, kh),
      cleanupExpired:            ()             => mysqlCleanupExpired(),
      getKingdomProvinces:       (kd, kh)     => mysqlGetKingdomProvinces(kd, kh),
      getProvinceDetail:         (nm, kd, kh) => mysqlGetProvinceDetail(nm, kd, kh),
    };
  }
  return _mysqlApi;
}

// ── Factory ──────────────────────────────────────────────────────────────────
// Set DB_DRIVER=mysql to use MySQL. Defaults to SQLite.

export function getDbApi(): AsyncDbApi {
  return process.env.DB_DRIVER === "mysql" ? createMysqlDbApi() : createSqliteDbApi();
}
