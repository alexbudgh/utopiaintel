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
  ProvinceNewsRow,
  OpProvEntry,
  OpTypeBreakdown,
  KingdomOpsStats,
  IncomingProvinceEvent,
  IncomingDamageProvinceStat,
  IncomingDamageStats,
  HistoryEventMarker,
} from "./db-types";
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
import type { ProvinceNewsData } from "./parsers/province_news";
import {
  storeProvinceNews as mysqlStoreProvinceNews,
  getProvinceNews as mysqlGetProvinceNews,
  getKingdomOpsStats as mysqlGetKingdomOpsStats,
  getIncomingDamageStats as mysqlGetIncomingDamageStats,
} from "./db-mysql";
import {
  getBoundKingdom as mysqlGetBoundKingdom,
  getLatestKingdomSnapshot as mysqlGetLatestKingdomSnapshot,
  getKingdomSnapshotHistory as mysqlGetKingdomSnapshotHistory,
  getKingdomRitual as mysqlGetKingdomRitual,
  getKingdomDragon as mysqlGetKingdomDragon,
  getLatestWarDate as mysqlGetLatestWarDate,
  getWarEventMarkers as mysqlGetWarEventMarkers,
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
  ProvinceNewsRow,
  OpProvEntry,
  OpTypeBreakdown,
  KingdomOpsStats,
  IncomingProvinceEvent,
  IncomingDamageProvinceStat,
  IncomingDamageStats,
};

// ── Interface ────────────────────────────────────────────────────────────────
// All methods return Promise<T>. App code should import getDbApi() and use
// this interface — never call the sync DbApi or driver functions directly.

export interface AsyncDbApi {
  // Reads
  getBoundKingdom(keyHash: string): Promise<string | null>;
  getKingdoms(keyHash: string): Promise<KingdomRow[]>;
  getLatestKingdomSnapshot(
    location: string,
    keyHash: string,
  ): Promise<KingdomSnapshot | null>;
  getKingdomSnapshotHistory(
    location: string,
    keyHash: string,
  ): Promise<KingdomSnapshotHistoryPoint[]>;
  getRecentOps(
    keyHash: string,
    limit?: number,
    since?: string,
  ): Promise<RecentOp[]>;
  getKingdomProvinces(kingdom: string, keyHash: string): Promise<ProvinceRow[]>;
  getKingdomRitual(
    kingdom: string,
    keyHash: string,
  ): Promise<KingdomRitual | null>;
  getKingdomDragon(
    kingdom: string,
    keyHash: string,
  ): Promise<KingdomDragon | null>;
  getProvinceDetail(
    name: string,
    kingdom: string,
    keyHash: string,
  ): Promise<ProvinceDetail>;
  getKingdomNews(
    kingdom: string,
    keyHash: string,
    from?: string,
    to?: string,
  ): Promise<{ events: KingdomNewsRow[]; effectiveFrom: string | null }>;
  getLatestWarDate(kingdom: string, keyHash: string): Promise<string | null>;
  getWarEventMarkers(
    kingdom: string,
    keyHash: string,
  ): Promise<HistoryEventMarker[]>;
  getKingdomNewsSummary(
    kingdom: string,
    keyHash: string,
    from?: string,
    to?: string,
  ): Promise<KingdomNewsSummary>;
  getProvinceHistory(
    name: string,
    kingdom: string,
    keyHash: string,
  ): Promise<ProvinceHistoryPoint[]>;
  getProvinceNews(
    name: string,
    kingdom: string,
    keyHash: string,
    from?: string,
    to?: string,
  ): Promise<{ events: ProvinceNewsRow[]; effectiveFrom: string | null }>;
  getKingdomOpsStats(
    kingdom: string,
    keyHash: string,
    from?: string,
    to?: string,
    timeMode?: TimeRangeMode,
  ): Promise<KingdomOpsStats>;
  getIncomingDamageStats(
    keyHash: string,
    from?: string,
    to?: string,
  ): Promise<IncomingDamageStats>;
  cleanupExpired(): Promise<void>;
  // Writes
  storeSoT(
    data: SoTData,
    savedBy: string,
    keyHash: string,
    isSelfThrone?: boolean,
    receivedAt?: string,
  ): Promise<void>;
  storeSoD(
    data: SoDData,
    savedBy: string,
    keyHash: string,
    receivedAt?: string,
  ): Promise<void>;
  storeInfiltrate(
    data: InfiltrateData,
    savedBy: string,
    keyHash: string,
    receivedAt?: string,
  ): Promise<void>;
  storeSoM(
    data: SoMData,
    savedBy: string,
    keyHash: string,
    isSelf?: boolean,
    receivedAt?: string,
  ): Promise<void>;
  storeSoS(
    data: SoSData,
    savedBy: string,
    keyHash: string,
    isSelf?: boolean,
    receivedAt?: string,
  ): Promise<void>;
  storeSurvey(
    data: SurveyData,
    savedBy: string,
    keyHash: string,
    isSelf?: boolean,
    receivedAt?: string,
  ): Promise<void>;
  storeTrainArmy(
    data: TrainArmyData,
    savedBy: string,
    keyHash: string,
    receivedAt?: string,
  ): Promise<void>;
  storeBuild(
    data: BuildData,
    savedBy: string,
    keyHash: string,
    receivedAt?: string,
  ): Promise<void>;
  storeRob(
    data: RobData,
    savedBy: string,
    keyHash: string,
    receivedAt?: string,
    gameDate?: GameDateStamp,
  ): Promise<void>;
  storeIntelOp(
    data: IntelOpAttempt,
    savedBy: string,
    keyHash: string,
    receivedAt?: string,
    gameDate?: GameDateStamp,
  ): Promise<void>;
  storeSorcery(
    data: SorceryData,
    savedBy: string,
    keyHash: string,
    receivedAt?: string,
    gameDate?: GameDateStamp,
  ): Promise<void>;
  storeAttack(
    data: AttackData,
    savedBy: string,
    keyHash: string,
    receivedAt?: string,
    gameDate?: GameDateStamp,
  ): Promise<void>;
  storeKingdom(
    data: KingdomData,
    savedBy: string,
    keyHash: string,
    receivedAt?: string,
  ): Promise<void>;
  storeState(
    data: StateData,
    savedBy: string,
    keyHash: string,
    receivedAt?: string,
  ): Promise<void>;
  storeKingdomNews(
    data: KingdomNewsData,
    keyHash: string,
    isSnatched?: boolean,
    receivedAt?: string,
    urlKingdom?: string | null,
  ): Promise<void>;
  storeProvinceNews(
    data: ProvinceNewsData,
    savedBy: string,
    keyHash: string,
    receivedAt?: string,
  ): Promise<void>;
}

export interface GameDateStamp {
  gameDate: string;
  gameDateOrd: number;
}

export type TimeRangeMode = "real" | "utopia";

// ── MySQL implementation ─────────────────────────────────────────────────────

let _mysqlApi: AsyncDbApi | null = null;

function createMysqlDbApi(): AsyncDbApi {
  if (!_mysqlApi) {
    _mysqlApi = {
      getBoundKingdom: (kh) => mysqlGetBoundKingdom(kh),
      getLatestKingdomSnapshot: (loc, kh) =>
        mysqlGetLatestKingdomSnapshot(loc, kh),
      getKingdomSnapshotHistory: (loc, kh) =>
        mysqlGetKingdomSnapshotHistory(loc, kh),
      getKingdomRitual: (kd, kh) => mysqlGetKingdomRitual(kd, kh),
      getKingdomDragon: (kd, kh) => mysqlGetKingdomDragon(kd, kh),
      getLatestWarDate: (kd, kh) => mysqlGetLatestWarDate(kd, kh),
      getWarEventMarkers: (kd, kh) => mysqlGetWarEventMarkers(kd, kh),
      getKingdomNews: (kd, kh, f, t) => mysqlGetKingdomNews(kd, kh, f, t),
      getRecentOps: (kh, lim, s) => mysqlGetRecentOps(kh, lim, s),
      getKingdoms: (kh) => mysqlGetKingdoms(kh),
      getKingdomNewsSummary: (kd, kh, f, t) =>
        mysqlGetKingdomNewsSummary(kd, kh, f, t),
      getProvinceHistory: (nm, kd, kh) => mysqlGetProvinceHistory(nm, kd, kh),
      getProvinceNews: (nm, kd, kh, f, t) =>
        mysqlGetProvinceNews(nm, kd, kh, f, t),
      getKingdomOpsStats: (kd, kh, f, t, tm) =>
        mysqlGetKingdomOpsStats(kd, kh, f, t, tm),
      getIncomingDamageStats: (kh, f, t) =>
        mysqlGetIncomingDamageStats(kh, f, t),
      cleanupExpired: () => mysqlCleanupExpired(),
      getKingdomProvinces: (kd, kh) => mysqlGetKingdomProvinces(kd, kh),
      getProvinceDetail: (nm, kd, kh) => mysqlGetProvinceDetail(nm, kd, kh),
      storeSoT: (d, sb, kh, self, ra) => mysqlStoreSoT(d, sb, kh, self, ra),
      storeSoD: (d, sb, kh, ra) => mysqlStoreSoD(d, sb, kh, ra),
      storeInfiltrate: (d, sb, kh, ra) => mysqlStoreInfiltrate(d, sb, kh, ra),
      storeSoM: (d, sb, kh, self, ra) => mysqlStoreSoM(d, sb, kh, self, ra),
      storeSoS: (d, sb, kh, self, ra) => mysqlStoreSoS(d, sb, kh, self, ra),
      storeSurvey: (d, sb, kh, self, ra) =>
        mysqlStoreSurvey(d, sb, kh, self, ra),
      storeTrainArmy: (d, sb, kh, ra) => mysqlStoreTrainArmy(d, sb, kh, ra),
      storeBuild: (d, sb, kh, ra) => mysqlStoreBuild(d, sb, kh, ra),
      storeRob: (d, sb, kh, ra, gd) => mysqlStoreRob(d, sb, kh, ra, gd),
      storeIntelOp: (d, sb, kh, ra, gd) => mysqlStoreIntelOp(d, sb, kh, ra, gd),
      storeSorcery: (d, sb, kh, ra, gd) => mysqlStoreSorcery(d, sb, kh, ra, gd),
      storeAttack: (d, sb, kh, ra, gd) => mysqlStoreAttack(d, sb, kh, ra, gd),
      storeKingdom: (d, sb, kh, ra) => mysqlStoreKingdom(d, sb, kh, ra),
      storeState: (d, sb, kh, ra) => mysqlStoreState(d, sb, kh, ra),
      storeKingdomNews: (d, kh, sn, ra, uk) =>
        mysqlStoreKingdomNews(d, kh, sn, ra, uk),
      storeProvinceNews: (d, sb, kh, ra) =>
        mysqlStoreProvinceNews(d, sb, kh, ra),
    };
  }
  return _mysqlApi;
}

// ── Factory ──────────────────────────────────────────────────────────────────
// Runtime storage is MySQL-only.

export function getDbApi(): AsyncDbApi {
  if (process.env.DB_DRIVER && process.env.DB_DRIVER !== "mysql") {
    throw new Error("DB_DRIVER must be 'mysql'");
  }
  if (process.env.DB_DRIVER === "mysql") return createMysqlDbApi();
  return createMysqlDbApi();
}

// ── Driver-aware metrics cache utilities ─────────────────────────────────────
// Use these instead of importing directly from db.ts or db-mysql.ts so the
// active driver's queue is targeted.

export function setMetricsCacheRefreshEnabled(enabled: boolean): () => void {
  return mysqlSetMetricsCacheRefreshEnabled(enabled);
}

export async function flushMetricsCacheRefreshQueue(): Promise<void> {
  return mysqlFlushMetricsCacheRefreshQueue();
}
