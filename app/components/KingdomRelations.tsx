import Link from "next/link";
import type { ReactNode } from "react";
import { Tooltip } from "@/app/components/Tooltip";
import type { KingdomSnapshot } from "@/lib/db";
import type { RelationContext } from "@/lib/relation-context";

function formatRelationPoints(points: number | null): string {
  return points == null ? "?" : points.toFixed(2);
}

function relationBadgeClass(status: string | null): string {
  const value = (status ?? "").toLowerCase();
  if (value.includes("hostile") || value.includes("war")) return "border-red-500/40 bg-red-950/40 text-red-200";
  if (value.includes("unfriendly")) return "border-amber-500/40 bg-amber-950/40 text-amber-200";
  if (value.includes("non aggression")) return "border-sky-500/40 bg-sky-950/40 text-sky-200";
  if (value.includes("normal")) return "border-gray-700 bg-gray-800/60 text-gray-200";
  return "border-violet-500/40 bg-violet-950/40 text-violet-200";
}

function isCeasefireLike(status: string | null): boolean {
  const value = (status ?? "").toLowerCase();
  return value.includes("non aggression") || value.includes("ceasefire");
}

export function KingdomRelations({
  kingdom,
  boundKingdom,
  snapshot,
  relationContexts = [],
}: {
  kingdom: string;
  boundKingdom: string | null;
  snapshot: KingdomSnapshot | null;
  relationContexts?: RelationContext[];
}) {
  const openRelations = snapshot?.openRelations ?? [];
  const isSelfWarPage = !!snapshot?.warTarget && !!boundKingdom && kingdom === boundKingdom;
  const relationTone = "border-gray-800 bg-gray-900/50 text-gray-300";
  const sections: Array<{ standalone: boolean; node: ReactNode }> = [];
  const contextsByLocation = new Map(relationContexts.map((context) => [context.location, context]));
  const snapshotMutualCeasefire =
    isCeasefireLike(snapshot?.theirAttitudeToUs ?? null) &&
    isCeasefireLike(snapshot?.ourAttitudeToThem ?? null);

  if (!(openRelations.length > 0 || snapshot?.warTarget || snapshot?.hostilityMeterVisibleUntil || snapshot?.theirAttitudeToUs || snapshot?.ourAttitudeToThem)) {
    return null;
  }

  if (isSelfWarPage && snapshot?.warTarget) {
    sections.push({
      standalone: true,
      node: (
        <Link href={`/kingdom/${encodeURIComponent(snapshot.warTarget)}`} className="rounded border border-orange-500/40 bg-orange-950/30 px-2 py-0.5 font-semibold tracking-wide text-orange-200 hover:border-orange-400/60 transition-colors">
          War · {snapshot.warTarget}
        </Link>
      ),
    });
  }

  if (openRelations.length > 0) {
    sections.push({
      standalone: true,
      node: (
        <div className="flex flex-wrap gap-1.5">
          {openRelations.map((relation) => (
            <Link
              key={relation.location}
              href={`/kingdom/${encodeURIComponent(relation.location)}`}
              className={`rounded border px-2 py-0.5 text-[11px] font-medium hover:text-blue-100 ${relationBadgeClass(relation.status)}`}
            >
              {relation.status} · {relation.location}
            </Link>
          ))}
        </div>
      ),
    });
  }

  if (snapshot && (snapshot.theirAttitudeToUs || snapshot.ourAttitudeToThem)) {
    sections.push({
      standalone: false,
      node: snapshotMutualCeasefire ? (
        <div className="flex flex-wrap items-center gap-2 text-gray-300">
          <Tooltip content="Hostile actions are blocked while a Non-Aggression Pact or ceasefire is active.">
            <span className={`rounded border px-2 py-0.5 text-[11px] font-medium ${relationBadgeClass(snapshot.ourAttitudeToThem ?? snapshot.theirAttitudeToUs ?? null)}`}>
              Non-Aggression Pact
            </span>
          </Tooltip>
        </div>
      ) : (
        <div className="space-y-1">
          {snapshot.theirAttitudeToUs && (
            <div className="flex flex-wrap items-center gap-2 text-gray-300">
              <span className="w-20 text-gray-500">They → us</span>
              <span className={`rounded border px-2 py-0.5 text-[11px] font-medium ${relationBadgeClass(snapshot.theirAttitudeToUs)}`}>
                {snapshot.theirAttitudeToUs}
              </span>
              <span className="text-gray-400">({formatRelationPoints(snapshot.theirAttitudePoints)})</span>
            </div>
          )}
          {snapshot.ourAttitudeToThem && (
            <div className="flex flex-wrap items-center gap-2 text-gray-300">
              <span className="w-20 text-gray-500">Us → them</span>
              <span className={`rounded border px-2 py-0.5 text-[11px] font-medium ${relationBadgeClass(snapshot.ourAttitudeToThem)}`}>
                {snapshot.ourAttitudeToThem}
              </span>
              <span className="text-gray-400">({formatRelationPoints(snapshot.ourAttitudePoints)})</span>
            </div>
          )}
        </div>
      ),
    });
  }

  if (relationContexts.length > 0) {
    sections.push({
      standalone: false,
      node: (
        <div className="space-y-2">
          {openRelations.map((relation) => {
            const context = contextsByLocation.get(relation.location) ?? null;
            const mutualCeasefire =
              isCeasefireLike(context?.theirAttitudeToUs ?? null) &&
              isCeasefireLike(context?.ourAttitudeToThem ?? null);

            if (!context) return null;

            return (
              <div key={relation.location} className="space-y-1">
                <div className="text-gray-500">
                  <Link href={`/kingdom/${encodeURIComponent(relation.location)}`} className="hover:text-gray-300 transition-colors">
                    {context.name} <span className="font-mono">({relation.location})</span>
                  </Link>
                </div>
                {mutualCeasefire ? (
                  <div className="flex flex-wrap items-center gap-2 text-gray-300">
                    <Tooltip content="Hostile actions are blocked while a Non-Aggression Pact or ceasefire is active.">
                      <Link href={`/kingdom/${encodeURIComponent(relation.location)}`} className={`rounded border px-2 py-0.5 text-[11px] font-medium hover:opacity-80 transition-opacity ${relationBadgeClass(context.ourAttitudeToThem ?? context.theirAttitudeToUs ?? null)}`}>
                        Non-Aggression Pact
                      </Link>
                    </Tooltip>
                  </div>
                ) : (
                  <>
                    <div className="flex flex-wrap items-center gap-2 text-gray-300">
                      <span className="w-20 text-gray-500">They → us</span>
                      <Link href={`/kingdom/${encodeURIComponent(relation.location)}`} className={`rounded border px-2 py-0.5 text-[11px] font-medium hover:opacity-80 transition-opacity ${relationBadgeClass(context.theirAttitudeToUs)}`}>
                        {context.theirAttitudeToUs ?? "Unknown"}
                      </Link>
                      <span className="text-gray-400">({formatRelationPoints(context.theirAttitudePoints)})</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-gray-300">
                      <span className="w-20 text-gray-500">Us → them</span>
                      <Link href={`/kingdom/${encodeURIComponent(relation.location)}`} className={`rounded border px-2 py-0.5 text-[11px] font-medium hover:opacity-80 transition-opacity ${relationBadgeClass(context.ourAttitudeToThem)}`}>
                        {context.ourAttitudeToThem ?? "Unknown"}
                      </Link>
                      <span className="text-gray-400">({formatRelationPoints(context.ourAttitudePoints)})</span>
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      ),
    });
  }

  if (snapshot?.warTarget && !isSelfWarPage) {
    sections.push({
      standalone: true,
      node: (
        <Link href={`/kingdom/${encodeURIComponent(snapshot.warTarget)}`} className="rounded border border-orange-500/40 bg-orange-950/30 px-2 py-0.5 font-medium text-orange-200 hover:border-orange-400/60 transition-colors">
          War · {snapshot.warTarget}
        </Link>
      ),
    });
  }

  if (snapshot?.hostilityMeterVisibleUntil) {
    sections.push({
      standalone: false,
      node: (
        <div className="text-gray-300">
          Hostility meter visible until <span className="text-gray-200">{snapshot.hostilityMeterVisibleUntil}</span>
        </div>
      ),
    });
  }

  if (sections.length === 1 && sections[0].standalone) {
    return <div className="mt-2 text-xs">{sections[0].node}</div>;
  }

  return (
    <div className={`mt-2 max-w-sm rounded-md border px-3 py-2 text-xs ${relationTone}`}>
      <div className="flex flex-wrap gap-1.5">
        {sections.map((section, i) => (
          <div key={i} className={section.standalone ? "" : "w-full"}>
            {section.node}
          </div>
        ))}
      </div>
    </div>
  );
}
