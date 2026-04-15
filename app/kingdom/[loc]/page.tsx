export const dynamic = "force-dynamic";

import Link from "next/link";
import { cookies, headers } from "next/headers";
import { getBoundKingdom, getKingdomProvinces, getLatestKingdomSnapshot, getKingdomSnapshotHistory, getKingdomRitual, getKingdomDragon, getKingdomNews, getKingdomNewsSummary, getLatestWarDate } from "@/lib/db";
import { hashKey } from "@/lib/keys";
import { timeAgo } from "@/lib/ui";
import { KingdomRelations } from "@/app/components/KingdomRelations";
import { IntelSetupCard } from "@/app/components/IntelSetupCard";
import { IntelSetupButton } from "@/app/components/IntelSetupButton";
import { Tooltip, type TooltipLine } from "@/app/components/Tooltip";
import { KingdomHistoryView } from "./KingdomSnapshotChart";
import { ProvinceTable } from "./ProvinceTable";
import { GainsTable } from "./gains/GainsTable";
import { ThieveryTable } from "./thievery/ThieveryTable";
import { KingdomNewsTable } from "./KingdomNewsTable";
import { KingdomJump } from "./KingdomJump";
import { getGainsPageData } from "@/lib/gains-page";
import { getKingdomTitleDetails } from "@/lib/kingdom-recognition";

function statValue(value: number | null, suffix = ""): string {
  return value == null ? "—" : `${value.toLocaleString()}${suffix}`;
}

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
  const relatedSnapshot = boundKingdom && kingdom === boundKingdom && primaryOpenRelation
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
  const kingdomTitle = getKingdomTitleDetails(snapshot?.kingdomTitle ?? null);
  const kingdomTitleTooltip: TooltipLine[] | null = kingdomTitle ? [
    { text: `${kingdomTitle.title} kingdom title` },
    ...(kingdomTitle.unlockedAtAcres != null ? [{ text: `Unlocked at ${kingdomTitle.unlockedAtAcres.toLocaleString()} acres`, tone: "muted" as const }] : []),
    ...(kingdomTitle.bonuses.length > 0
      ? [
          { text: "Cumulative land-title bonuses:", tone: "muted" as const },
          ...kingdomTitle.bonuses.map((bonus) => ({ text: `• ${bonus}`, tone: "good" as const })),
        ]
      : [{ text: "No land-growth bonus mapped for this title.", tone: "muted" as const }]),
  ] : null;

  return (
    <main className="p-6">
      <div className="mb-4 flex flex-wrap items-center gap-4">
        <div className="flex flex-col gap-2">
          <Link
            href="/"
            className="inline-flex items-center rounded border border-gray-800 bg-gray-900/70 px-2.5 py-1 text-sm text-gray-400 transition-colors hover:border-gray-600 hover:text-gray-200"
          >
            ← kingdoms
          </Link>
          {boundKingdom && kingdom !== boundKingdom && (
            <Link
              href={`/kingdom/${encodeURIComponent(boundKingdom)}`}
              className="inline-flex items-center rounded border border-blue-900/60 bg-blue-950/40 px-2.5 py-1 text-sm text-blue-200 transition-colors hover:border-blue-700 hover:text-blue-100"
            >
              My Kingdom
            </Link>
          )}
        </div>
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-bold text-gray-100">
              {snapshot?.name ? `${snapshot.name} (${kingdom})` : <span className="font-mono">{kingdom}</span>}
            </h1>
            {kingdomTitle && kingdomTitleTooltip && (
              <Tooltip content={kingdomTitleTooltip}>
                <a
                  href="https://utopiaguide.chaos-intel.com/misc/Kingdom_Recognition/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex cursor-help items-center rounded border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-200 transition-colors hover:border-amber-400/60 hover:text-amber-100"
                >
                  {kingdomTitle.title}
                </a>
              </Tooltip>
            )}
          </div>
          {snapshot && (
            <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-400">
              <span>NW <span className="text-gray-200 tabular-nums">{statValue(snapshot.totalNetworth)}</span>{snapshot.networthRank != null && <span className="text-gray-500"> · rank #{snapshot.networthRank}</span>}</span>
              <span>Land <span className="text-gray-200 tabular-nums">{statValue(snapshot.totalLand, "a")}</span>{snapshot.landRank != null && <span className="text-gray-500"> · rank #{snapshot.landRank}</span>}</span>
              <span>Honor <span className="text-gray-200 tabular-nums">{statValue(snapshot.totalHonor)}</span></span>
              <span>War Wins <span className="text-gray-200 tabular-nums">{statValue(snapshot.warsWon)}</span></span>
            </div>
          )}
          <KingdomRelations
            kingdom={kingdom}
            boundKingdom={boundKingdom}
            snapshot={snapshot}
            relationSnapshot={relatedSnapshot ?? snapshot}
          />
        </div>
        <span className="text-sm text-gray-500">{provinces.length} provinces</span>
        <div className="ml-auto flex items-center gap-2">
          <IntelSetupButton endpointUrl={`${baseUrl}/api/intel`} />
          <KingdomJump />
        </div>
      </div>

      {(dragon || ritual) && (
        <div className="mb-4 flex flex-wrap gap-2">
          {dragon && (
            <a href="https://utopiaguide.chaos-intel.com/main/Dragons/" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded border border-rose-500/40 bg-rose-500/10 px-3 py-1.5 text-sm text-rose-300 hover:border-rose-400/60 transition-colors">
              <span className="font-medium">{dragon.dragonType} Dragon</span>
              <span className="text-rose-400">{dragon.dragonName}</span>
              <span className="text-rose-600 text-xs">{timeAgo(dragon.receivedAt)}</span>
            </a>
          )}
          {ritual && (
            <a href="https://utopiaguide.chaos-intel.com/misc/Ritual/" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded border border-purple-500/40 bg-purple-500/10 px-3 py-1.5 text-sm text-purple-300 hover:border-purple-400/60 transition-colors">
              <span className="font-medium">{ritual.name}</span>
              {ritual.effectivenessPercent != null && (
                <span className="text-purple-400">{ritual.effectivenessPercent.toFixed(1)}%</span>
              )}
              {ritual.remainingTicks != null && (
                <span className="text-purple-500">{ritual.remainingTicks} ticks left</span>
              )}
              <span className="text-purple-600 text-xs">{timeAgo(ritual.receivedAt)}</span>
            </a>
          )}
        </div>
      )}

      {view === "news" ? (
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
      ) : hasAnyIntel ? (
        <ProvinceTable kingdom={kingdom} initial={provinces} />
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
