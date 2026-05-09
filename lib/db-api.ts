import { createDbApi, getDb, flushMetricsCacheRefreshQueue as sqliteFlushMetricsCacheRefreshQueue, setMetricsCacheRefreshEnabled as sqliteSetMetricsCacheRefreshEnabled } from "./db";
import {
  storeSoT as sqliteStoreSoT,
  storeSoD as sqliteStoreSoD,
  storeInfiltrate as sqliteStoreInfiltrate,
  storeSoM as sqliteStoreSoM,
  storeSoS as sqliteStoreSoS,
  storeSurvey as sqliteStoreSurvey,
  storeTrainArmy as sqliteStoreTrainArmy,
  storeBuild as sqliteStoreBuild,
  storeRob as sqliteStoreRob,
  storeIntelOp as sqliteStoreIntelOp,
  storeSorcery as sqliteStoreSorcery,
  storeAttack as sqliteStoreAttack,
  storeKingdom as sqliteStoreKingdom,
  storeState as sqliteStoreState,
  storeKingdomNews as sqliteStoreKingdomNews,
} from "./db";
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
import type { IntelOpAttempt } from "./intel-ops";
import type { KingdomNewsData } from "./parsers/kingdom_news";
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
  storeSoT as mysqlStoreSoT,
  storeSoD as mysqlStoreSoD,
  storeInfiltrate as mysqlStoreInfiltrate,
  storeSoM as mysqlStoreSoM,
  storeSoS as mysqlStoreSoS,
  storeSurvey as mysqlStoreSurvey,
  storeTrainArmy as mysqlStoreTrainArmy,
  storeBuild as mysqlStoreBuild,
  storeRob as mysqlStoreRob,
  storeIntelOp as mysqlStoreIntelOp,
  storeSorcery as mysqlStoreSorcery,
  storeAttack as mysqlStoreAttack,
  storeKingdom as mysqlStoreKingdom,
  storeState as mysqlStoreState,
  storeKingdomNews as mysqlStoreKingdomNews,
  flushMetricsCacheRefreshQueue as mysqlFlushMetricsCacheRefreshQueue,
  setMetricsCacheRefreshEnabled as mysqlSetMetricsCacheRefreshEnabled,
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
// All methods return Promise<T>. App code should import getDbApi() and use
// this interface — never call the sync DbApi or driver functions directly.

export interface AsyncDbApi {
  // Reads
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
  // Writes
  storeSoT(data: SoTData, savedBy: string, keyHash: string, isSelfThrone?: boolean, receivedAt?: string): Promise<void>;
  storeSoD(data: SoDData, savedBy: string, keyHash: string, receivedAt?: string): Promise<void>;
  storeInfiltrate(data: InfiltrateData, savedBy: string, keyHash: string, receivedAt?: string): Promise<void>;
  storeSoM(data: SoMData, savedBy: string, keyHash: string, isSelf?: boolean, receivedAt?: string): Promise<void>;
  storeSoS(data: SoSData, savedBy: string, keyHash: string, isSelf?: boolean, receivedAt?: string): Promise<void>;
  storeSurvey(data: SurveyData, savedBy: string, keyHash: string, isSelf?: boolean, receivedAt?: string): Promise<void>;
  storeTrainArmy(data: TrainArmyData, savedBy: string, keyHash: string, receivedAt?: string): Promise<void>;
  storeBuild(data: BuildData, savedBy: string, keyHash: string, receivedAt?: string): Promise<void>;
  storeRob(data: RobData, savedBy: string, keyHash: string, receivedAt?: string): Promise<void>;
  storeIntelOp(data: IntelOpAttempt, savedBy: string, keyHash: string, receivedAt?: string): Promise<void>;
  storeSorcery(data: SorceryData, savedBy: string, keyHash: string, receivedAt?: string): Promise<void>;
  storeAttack(data: AttackData, savedBy: string, keyHash: string, receivedAt?: string): Promise<void>;
  storeKingdom(data: KingdomData, savedBy: string, keyHash: string, receivedAt?: string): Promise<void>;
  storeState(data: StateData, savedBy: string, keyHash: string, receivedAt?: string): Promise<void>;
  storeKingdomNews(data: KingdomNewsData, keyHash: string, isSnatched?: boolean, receivedAt?: string, urlKingdom?: string | null): Promise<void>;
}

// ── SQLite shim ──────────────────────────────────────────────────────────────

let _sqliteApi: AsyncDbApi | null = null;

function createSqliteDbApi(): AsyncDbApi {
  if (!_sqliteApi) {
    const sync = createDbApi(getDb());
    const r = <T>(v: T) => Promise.resolve(v);
    const w = (fn: () => void) => { fn(); return Promise.resolve(); };
    _sqliteApi = {
      getBoundKingdom:           (kh)           => r(sync.getBoundKingdom(kh)),
      getKingdoms:               (kh)           => r(sync.getKingdoms(kh)),
      getLatestKingdomSnapshot:  (loc, kh)      => r(sync.getLatestKingdomSnapshot(loc, kh)),
      getKingdomSnapshotHistory: (loc, kh)      => r(sync.getKingdomSnapshotHistory(loc, kh)),
      getRecentOps:              (kh, lim, s)   => r(sync.getRecentOps(kh, lim, s)),
      getKingdomProvinces:       (kd, kh)       => r(sync.getKingdomProvinces(kd, kh)),
      getKingdomRitual:          (kd, kh)       => r(sync.getKingdomRitual(kd, kh)),
      getKingdomDragon:          (kd, kh)       => r(sync.getKingdomDragon(kd, kh)),
      getProvinceDetail:         (nm, kd, kh)   => r(sync.getProvinceDetail(nm, kd, kh)),
      getKingdomNews:            (kd, kh, f, t) => r(sync.getKingdomNews(kd, kh, f, t)),
      getLatestWarDate:          (kd, kh)       => r(sync.getLatestWarDate(kd, kh)),
      getKingdomNewsSummary:     (kd, kh, f, t) => r(sync.getKingdomNewsSummary(kd, kh, f, t)),
      getProvinceHistory:        (nm, kd, kh)   => r(sync.getProvinceHistory(nm, kd, kh)),
      cleanupExpired:            ()             => w(() => sync.cleanupExpired()),
      storeSoT:        (d, sb, kh, self, ra)  => w(() => sqliteStoreSoT(d, sb, kh, self, ra)),
      storeSoD:        (d, sb, kh, ra)        => w(() => sqliteStoreSoD(d, sb, kh, ra)),
      storeInfiltrate: (d, sb, kh, ra)        => w(() => sqliteStoreInfiltrate(d, sb, kh, ra)),
      storeSoM:        (d, sb, kh, self, ra)  => w(() => sqliteStoreSoM(d, sb, kh, self, ra)),
      storeSoS:        (d, sb, kh, self, ra)  => w(() => sqliteStoreSoS(d, sb, kh, self, ra)),
      storeSurvey:     (d, sb, kh, self, ra)  => w(() => sqliteStoreSurvey(d, sb, kh, self, ra)),
      storeTrainArmy:  (d, sb, kh, ra)        => w(() => sqliteStoreTrainArmy(d, sb, kh, ra)),
      storeBuild:      (d, sb, kh, ra)        => w(() => sqliteStoreBuild(d, sb, kh, ra)),
      storeRob:        (d, sb, kh, ra)        => w(() => sqliteStoreRob(d, sb, kh, ra)),
      storeIntelOp:    (d, sb, kh, ra)        => w(() => sqliteStoreIntelOp(d, sb, kh, ra)),
      storeSorcery:    (d, sb, kh, ra)        => w(() => sqliteStoreSorcery(d, sb, kh, ra)),
      storeAttack:     (d, sb, kh, ra)        => w(() => sqliteStoreAttack(d, sb, kh, ra)),
      storeKingdom:    (d, sb, kh, ra)        => w(() => sqliteStoreKingdom(d, sb, kh, ra)),
      storeState:      (d, sb, kh, ra)        => w(() => sqliteStoreState(d, sb, kh, ra)),
      storeKingdomNews:(d, kh, sn, ra, uk)    => w(() => sqliteStoreKingdomNews(d, kh, sn, ra, uk)),
    };
  }
  return _sqliteApi;
}

// ── MySQL implementation ─────────────────────────────────────────────────────

let _mysqlApi: AsyncDbApi | null = null;

function createMysqlDbApi(): AsyncDbApi {
  if (!_mysqlApi) {
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
      getKingdomProvinces:       (kd, kh)       => mysqlGetKingdomProvinces(kd, kh),
      getProvinceDetail:         (nm, kd, kh)   => mysqlGetProvinceDetail(nm, kd, kh),
      storeSoT:        (d, sb, kh, self, ra)  => mysqlStoreSoT(d, sb, kh, self, ra),
      storeSoD:        (d, sb, kh, ra)        => mysqlStoreSoD(d, sb, kh, ra),
      storeInfiltrate: (d, sb, kh, ra)        => mysqlStoreInfiltrate(d, sb, kh, ra),
      storeSoM:        (d, sb, kh, self, ra)  => mysqlStoreSoM(d, sb, kh, self, ra),
      storeSoS:        (d, sb, kh, self, ra)  => mysqlStoreSoS(d, sb, kh, self, ra),
      storeSurvey:     (d, sb, kh, self, ra)  => mysqlStoreSurvey(d, sb, kh, self, ra),
      storeTrainArmy:  (d, sb, kh, ra)        => mysqlStoreTrainArmy(d, sb, kh, ra),
      storeBuild:      (d, sb, kh, ra)        => mysqlStoreBuild(d, sb, kh, ra),
      storeRob:        (d, sb, kh, ra)        => mysqlStoreRob(d, sb, kh, ra),
      storeIntelOp:    (d, sb, kh, ra)        => mysqlStoreIntelOp(d, sb, kh, ra),
      storeSorcery:    (d, sb, kh, ra)        => mysqlStoreSorcery(d, sb, kh, ra),
      storeAttack:     (d, sb, kh, ra)        => mysqlStoreAttack(d, sb, kh, ra),
      storeKingdom:    (d, sb, kh, ra)        => mysqlStoreKingdom(d, sb, kh, ra),
      storeState:      (d, sb, kh, ra)        => mysqlStoreState(d, sb, kh, ra),
      storeKingdomNews:(d, kh, sn, ra, uk)    => mysqlStoreKingdomNews(d, kh, sn, ra, uk),
    };
  }
  return _mysqlApi;
}

// ── Factory ──────────────────────────────────────────────────────────────────
// Set DB_DRIVER=mysql to use MySQL. Defaults to SQLite.

export function getDbApi(): AsyncDbApi {
  return process.env.DB_DRIVER === "mysql" ? createMysqlDbApi() : createSqliteDbApi();
}

// ── Driver-aware metrics cache utilities ─────────────────────────────────────
// Use these instead of importing directly from db.ts or db-mysql.ts so the
// active driver's queue is targeted.

export function setMetricsCacheRefreshEnabled(enabled: boolean): () => void {
  return process.env.DB_DRIVER === "mysql"
    ? mysqlSetMetricsCacheRefreshEnabled(enabled)
    : sqliteSetMetricsCacheRefreshEnabled(enabled);
}

export async function flushMetricsCacheRefreshQueue(): Promise<void> {
  return process.env.DB_DRIVER === "mysql"
    ? mysqlFlushMetricsCacheRefreshQueue()
    : sqliteFlushMetricsCacheRefreshQueue();
}
