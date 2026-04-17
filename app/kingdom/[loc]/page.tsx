export const dynamic = "force-dynamic";

import { cookies, headers } from "next/headers";
import { getBoundKingdom, getKingdomProvinces, getLatestKingdomSnapshot, getKingdomSnapshotHistory, getKingdomRitual, getKingdomDragon, getKingdomNews, getKingdomNewsSummary, getLatestWarDate } from "@/lib/db";
import { hashKey } from "@/lib/keys";
import { IntelSetupCard } from "@/app/components/IntelSetupCard";
import { KingdomHistoryView } from "./KingdomSnapshotChart";
import { KingdomProvinceView } from "./KingdomProvinceView";
import { GainsTable } from "./gains/GainsTable";
import { ThieveryTable } from "./thievery/ThieveryTable";
import { KingdomNewsTable } from "./KingdomNewsTable";
import { getGainsPageData } from "@/lib/gains-page";

export default async function KingdomPage({
  params,
  searchParams,
}: {
  params: Promise<{ loc: string }>;
  searchParams: Promise<{ view?: string; from?: string; to?: string; compare?: string }>;
}) {
  const { loc } = await params;
  const { view, from, to, compare } = await searchParams;
  const kingdom = decodeURIComponent(loc);
  const compareKingdom = compare?.trim() ? compare.trim() : null;
  const hdrs = await headers();
  const host = hdrs.get("x-forwarded-host") ?? hdrs.get("host") ?? "";
  const proto = hdrs.get("x-forwarded-proto") ?? "https";
  const baseUrl = `${proto}://${host}`;
  const key = (await cookies()).get("auth")?.value ?? "";
  const keyHash = hashKey(key);
  const boundKingdom = getBoundKingdom(keyHash);
  const provinces = getKingdomProvinces(kingdom, keyHash);
  const snapshot = getLatestKingdomSnapshot(kingdom, keyHash);
  const snapshotHistory = getKingdomSnapshotHistory(kingdom, keyHash);
  const compareHistory = view === "history" && compareKingdom && compareKingdom !== kingdom
    ? getKingdomSnapshotHistory(compareKingdom, keyHash)
    : [];
  const primaryOpenRelation = snapshot?.openRelations[0] ?? null;
  const initialRelationSnapshot = boundKingdom && kingdom === boundKingdom && primaryOpenRelation
    ? getLatestKingdomSnapshot(primaryOpenRelation.location, keyHash)
    : null;
  const hasAnyIntel = provinces.length > 0 || !!snapshot;
  const gainsInitial = view === "gains" ? getGainsPageData(kingdom, keyHash) : null;
  const thieveryInitial = view === "thievery" ? getGainsPageData(kingdom, keyHash) : null;
  const newsResult = view === "news" ? getKingdomNews(kingdom, keyHash, from, to) : null;
  const newsEvents = newsResult?.events ?? null;
  const newsEffectiveFrom = newsResult?.effectiveFrom ?? null;
  const newsSummary = view === "news" ? getKingdomNewsSummary(kingdom, keyHash, from, to) : null;
  const latestWarDate = view === "news" ? getLatestWarDate(kingdom, keyHash) : null;
  const ritual = getKingdomRitual(kingdom, keyHash);
  const dragon = getKingdomDragon(kingdom, keyHash);

  return (
    <main className="p-6">
      {!view && hasAnyIntel ? (
        <KingdomProvinceView
          kingdom={kingdom}
          boundKingdom={boundKingdom}
          endpointUrl={`${baseUrl}/api/intel`}
          initialProvinces={provinces}
          initialKdSnapshot={snapshot}
          initialRelationSnapshot={initialRelationSnapshot}
          initialDragon={dragon}
          initialRitual={ritual}
        />
      ) : view === "news" ? (
        <KingdomNewsTable events={newsEvents!} summary={newsSummary!} kingdom={kingdom} from={from} to={to} effectiveFrom={newsEffectiveFrom ?? undefined} latestWarDate={latestWarDate ?? undefined} warTarget={snapshot?.warTarget ?? undefined} />
      ) : view === "gains" ? (
        <GainsTable initial={gainsInitial!} embedded />
      ) : view === "thievery" ? (
        <ThieveryTable initial={thieveryInitial!} embedded />
      ) : view === "history" ? (
        <KingdomHistoryView
          primaryKingdom={kingdom}
          primaryHistory={snapshotHistory}
          compareKingdom={compareKingdom}
          compareHistory={compareHistory}
        />
      ) : (
        <div className="rounded-lg border border-gray-800 bg-gray-900/50 px-5 py-6 text-sm text-gray-300">
          <div className="font-medium text-gray-100">No intel available for {kingdom}</div>
          <div className="mt-2 text-gray-400">
            This kingdom has not been loaded yet for your current intel key, or no accessible kingdom intel has been stored for it.
          </div>
          <div className="mt-2 text-gray-500">
            Open the kingdom page in Utopia to submit fresh intel, then reload this page.
          </div>
          <div className="mt-5">
            <IntelSetupCard
              endpointUrl={`${baseUrl}/api/intel`}
              compact
              title="Need to configure intel submission?"
            />
          </div>
        </div>
      )}
    </main>
  );
}
