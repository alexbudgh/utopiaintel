import { getDbApi, type AsyncDbApi } from "@/lib/db-api";
import type { KingdomSnapshot, KingdomRitual, ProvinceRow } from "@/lib/db-api";

export interface GainsPageData {
  targetKingdom: string;
  selfKingdom: string | null;
  selfProvinces: ProvinceRow[];
  targetLatest: ProvinceRow[];
  selfSnapshot: KingdomSnapshot | null;
  targetSnapshot: KingdomSnapshot | null;
  targetRitual: KingdomRitual | null;
}

type GainsPageDeps = Pick<AsyncDbApi, "getBoundKingdom" | "getKingdomProvinces" | "getLatestKingdomSnapshot" | "getKingdomRitual">;

export async function getGainsPageData(targetKingdom: string, keyHash: string, deps: GainsPageDeps = getDbApi()): Promise<GainsPageData> {
  const selfKingdom = await deps.getBoundKingdom(keyHash);

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

  const [selfProvinces, targetLatest, selfSnapshot, targetSnapshot, targetRitual] = await Promise.all([
    deps.getKingdomProvinces(selfKingdom, keyHash),
    deps.getKingdomProvinces(targetKingdom, keyHash),
    deps.getLatestKingdomSnapshot(selfKingdom, keyHash),
    deps.getLatestKingdomSnapshot(targetKingdom, keyHash),
    deps.getKingdomRitual(targetKingdom, keyHash),
  ]);

  return { targetKingdom, selfKingdom, selfProvinces, targetLatest, selfSnapshot, targetSnapshot, targetRitual };
}
