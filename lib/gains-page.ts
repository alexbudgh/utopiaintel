import {
  type DbApi,
  getBoundKingdom,
  getKingdomProvinces,
  getKingdomRitual,
  getLatestKingdomSnapshot,
  type KingdomSnapshot,
  type KingdomRitual,
  type ProvinceRow,
} from "@/lib/db";

export interface GainsPageData {
  targetKingdom: string;
  selfKingdom: string | null;
  selfProvinces: ProvinceRow[];
  targetLatest: ProvinceRow[];
  selfSnapshot: KingdomSnapshot | null;
  targetSnapshot: KingdomSnapshot | null;
  targetRitual: KingdomRitual | null;
}

type GainsPageDeps = Pick<DbApi, "getBoundKingdom" | "getKingdomProvinces" | "getLatestKingdomSnapshot" | "getKingdomRitual">;

const defaultDeps: GainsPageDeps = {
  getBoundKingdom,
  getKingdomProvinces,
  getLatestKingdomSnapshot,
  getKingdomRitual,
};

export function getGainsPageData(targetKingdom: string, keyHash: string, deps: GainsPageDeps = defaultDeps): GainsPageData {
  const selfKingdom = deps.getBoundKingdom(keyHash);

  if (!selfKingdom) {
    return {
      targetKingdom,
      selfKingdom: null,
      selfProvinces: [],
      targetLatest: [],
      selfSnapshot: null,
      targetSnapshot: null,
      targetRitual: null,
    };
  }

  return {
    targetKingdom,
    selfKingdom,
    selfProvinces: deps.getKingdomProvinces(selfKingdom, keyHash),
    targetLatest: deps.getKingdomProvinces(targetKingdom, keyHash),
    selfSnapshot: deps.getLatestKingdomSnapshot(selfKingdom, keyHash),
    targetSnapshot: deps.getLatestKingdomSnapshot(targetKingdom, keyHash),
    targetRitual: deps.getKingdomRitual(targetKingdom, keyHash),
  };
}
