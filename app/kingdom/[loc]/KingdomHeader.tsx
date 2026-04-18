import Link from "next/link";
import { IntelSetupButton } from "@/app/components/IntelSetupButton";
import { KingdomRelations } from "@/app/components/KingdomRelations";
import { Tooltip, type TooltipLine } from "@/app/components/Tooltip";
import type { KingdomDragon, KingdomRitual, KingdomSnapshot } from "@/lib/db";
import type { RelationContext } from "@/lib/relation-context";
import { getKingdomTitleDetails } from "@/lib/kingdom-recognition";
import { timeAgo } from "@/lib/ui";
import { KingdomJump } from "./KingdomJump";

function statValue(value: number | null, suffix = ""): string {
  return value == null ? "—" : `${value.toLocaleString()}${suffix}`;
}

export function KingdomHeader({
  kingdom,
  boundKingdom,
  endpointUrl,
  kdSnapshot,
  relationContexts,
  dragon,
  ritual,
  provinceCount,
}: {
  kingdom: string;
  boundKingdom: string | null;
  endpointUrl: string;
  kdSnapshot: KingdomSnapshot | null;
  relationContexts: RelationContext[];
  dragon: KingdomDragon | null;
  ritual: KingdomRitual | null;
  provinceCount: number;
}) {
  const kdTitle = getKingdomTitleDetails(kdSnapshot?.kingdomTitle ?? null);
  const kdTitleTooltip: TooltipLine[] | null = kdTitle ? [
    { text: `${kdTitle.title} kingdom title` },
    ...(kdTitle.unlockedAtAcres != null ? [{ text: `Unlocked at ${kdTitle.unlockedAtAcres.toLocaleString()} acres`, tone: "muted" as const }] : []),
    ...(kdTitle.bonuses.length > 0
      ? [
          { text: "Cumulative land-title bonuses:", tone: "muted" as const },
          ...kdTitle.bonuses.map((bonus) => ({ text: `• ${bonus}`, tone: "good" as const })),
        ]
      : [{ text: "No land-growth bonus mapped for this title.", tone: "muted" as const }]),
  ] : null;

  return (
    <>
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
              {kdSnapshot?.name ? `${kdSnapshot.name} (${kingdom})` : <span className="font-mono">{kingdom}</span>}
            </h1>
            {kdTitle && kdTitleTooltip && (
              <Tooltip content={kdTitleTooltip}>
                <a
                  href="https://utopiaguide.chaos-intel.com/misc/Kingdom_Recognition/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex cursor-help items-center rounded border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-200 transition-colors hover:border-amber-400/60 hover:text-amber-100"
                >
                  {kdTitle.title}
                </a>
              </Tooltip>
            )}
          </div>
          {kdSnapshot && (
            <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-400">
              <span>NW <span className="text-gray-200 tabular-nums">{statValue(kdSnapshot.totalNetworth)}</span>{kdSnapshot.networthRank != null && <span className="text-gray-500"> · rank #{kdSnapshot.networthRank}</span>}</span>
              <span>Land <span className="text-gray-200 tabular-nums">{statValue(kdSnapshot.totalLand, "a")}</span>{kdSnapshot.landRank != null && <span className="text-gray-500"> · rank #{kdSnapshot.landRank}</span>}</span>
              <span>Honor <span className="text-gray-200 tabular-nums">{statValue(kdSnapshot.totalHonor)}</span>{kdSnapshot.honorRank != null && <span className="text-gray-500"> · rank #{kdSnapshot.honorRank}</span>}</span>
              <span>War Wins <span className="text-gray-200 tabular-nums">{statValue(kdSnapshot.warsWon)}</span></span>
              <span>War Losses <span className="text-gray-200 tabular-nums">{statValue(kdSnapshot.warLosses)}</span></span>
            </div>
          )}
          <KingdomRelations
            kingdom={kingdom}
            boundKingdom={boundKingdom}
            snapshot={kdSnapshot}
            relationContexts={relationContexts}
          />
        </div>
        <span className="text-sm text-gray-500">{provinceCount} provinces</span>
        <div className="ml-auto flex items-center gap-2">
          <IntelSetupButton endpointUrl={endpointUrl} />
          <KingdomJump />
        </div>
      </div>

      {(dragon || ritual || (kdSnapshot && kdSnapshot.warDoctrines.length > 0)) && (
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
          {kdSnapshot && kdSnapshot.warDoctrines.length > 0 && (
            <Tooltip content={
              <table className="border-separate border-spacing-0 text-xs">
                <thead>
                  <tr className="text-gray-500">
                    <th className="pb-1 pr-4 text-left font-normal">Race</th>
                    <th className="pb-1 pr-4 text-center font-normal">Provs</th>
                    <th className="pb-1 pr-4 text-left font-normal">Effect</th>
                    <th className="pb-1 text-right font-normal">Bonus</th>
                  </tr>
                </thead>
                <tbody>
                  {kdSnapshot.warDoctrines.map((d) => (
                    <tr key={d.race}>
                      <td className="py-0.5 pr-4 text-gray-200">{d.race}</td>
                      <td className="py-0.5 pr-4 text-center tabular-nums text-gray-400">{d.provinces}</td>
                      <td className="py-0.5 pr-4 text-gray-400">{d.effect}</td>
                      <td className="py-0.5 text-right tabular-nums text-gray-200">
                        {d.bonusPercent > 0 ? "+" : ""}{d.bonusPercent.toFixed(1)}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            }>
              <span className="inline-flex cursor-default items-center gap-1.5 rounded border border-blue-500/30 bg-blue-500/10 px-3 py-1.5 text-sm text-blue-300">
                War Doctrines
              </span>
            </Tooltip>
          )}
        </div>
      )}
    </>
  );
}
