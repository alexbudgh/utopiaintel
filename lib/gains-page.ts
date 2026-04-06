import {
  getBoundKingdom,
  getKingdomProvinces,
  getLatestKingdomSnapshot,
  type KingdomSnapshot,
  type ProvinceRow,
} from "@/lib/db";

export interface GainsPageData {
  targetKingdom: string;
  selfKingdom: string | null;
  selfProvinces: ProvinceRow[];
  targetLatest: ProvinceRow[];
  selfSnapshot: KingdomSnapshot | null;
  targetSnapshot: KingdomSnapshot | null;
}

export function getGainsPageData(targetKingdom: string, keyHash: string): GainsPageData {
  const selfKingdom = getBoundKingdom(keyHash);

  if (!selfKingdom) {
    return {
      targetKingdom,
      selfKingdom: null,
      selfProvinces: [],
      targetLatest: [],
      selfSnapshot: null,
      targetSnapshot: null,
    };
  }

  return {
    targetKingdom,
    selfKingdom,
    selfProvinces: getKingdomProvinces(selfKingdom, keyHash),
    targetLatest: getKingdomProvinces(targetKingdom, keyHash),
    selfSnapshot: getLatestKingdomSnapshot(selfKingdom, keyHash),
    targetSnapshot: getLatestKingdomSnapshot(targetKingdom, keyHash),
  };
}
