import Link from "next/link";
import type { ReactNode } from "react";
import type { KingdomSnapshot } from "@/lib/db";

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
  relationSnapshot = snapshot,
}: {
  kingdom: string;
  boundKingdom: string | null;
  snapshot: KingdomSnapshot | null;
  relationSnapshot?: KingdomSnapshot | null;
}) {
  const primaryOpenRelation = snapshot?.openRelations[0] ?? null;
  const isWarWithBoundKingdom =
    !!relationSnapshot?.warTarget && !!boundKingdom && relationSnapshot.warTarget === boundKingdom;
  const isSelfWarPage = !!snapshot?.warTarget && !!boundKingdom && kingdom === boundKingdom;
  const relationTone = "border-gray-800 bg-gray-900/50 text-gray-300";
  const mutualCeasefire =
    isCeasefireLike(relationSnapshot?.theirAttitudeToUs ?? null) &&
    isCeasefireLike(relationSnapshot?.ourAttitudeToThem ?? null);
  const sections: Array<{ standalone: boolean; node: ReactNode }> = [];

  if (!(relationSnapshot?.theirAttitudeToUs || relationSnapshot?.ourAttitudeToThem || snapshot?.warTarget || primaryOpenRelation)) {
    return null;
  }

  if (isWarWithBoundKingdom || isSelfWarPage) {
    sections.push({
      standalone: true,
      node: (
        <span className="rounded border border-orange-500/40 bg-orange-950/30 px-2 py-0.5 font-semibold tracking-wide text-orange-200">
          War · {relationSnapshot?.warTarget ?? snapshot?.warTarget}
        </span>
      ),
    });
  }

  if (primaryOpenRelation) {
    sections.push({
      standalone: true,
      node: (
        <Link
          href={`/kingdom/${encodeURIComponent(primaryOpenRelation.location)}`}
          className={`rounded border px-2 py-0.5 text-[11px] font-medium hover:text-blue-100 ${relationBadgeClass(primaryOpenRelation.status)}`}
        >
          {primaryOpenRelation.status} · {primaryOpenRelation.location}
        </Link>
      ),
    });
  }

  if (mutualCeasefire) {
    sections.push({
      standalone: true,
      node: (
        <span className={`rounded border px-2 py-0.5 text-[11px] font-medium ${relationBadgeClass(relationSnapshot?.ourAttitudeToThem ?? relationSnapshot?.theirAttitudeToUs ?? null)}`}>
          Non-Aggression Pact
        </span>
      ),
    });
  } else if (relationSnapshot && (relationSnapshot.theirAttitudeToUs || relationSnapshot.ourAttitudeToThem)) {
    sections.push({
      standalone: false,
      node: (
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2 text-gray-300">
            <span className="w-20 text-gray-500">They → us</span>
            <span className={`rounded border px-2 py-0.5 text-[11px] font-medium ${relationBadgeClass(relationSnapshot.theirAttitudeToUs)}`}>
              {relationSnapshot.theirAttitudeToUs ?? "Unknown"}
            </span>
            <span className="text-gray-400">({formatRelationPoints(relationSnapshot.theirAttitudePoints)})</span>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-gray-300">
            <span className="w-20 text-gray-500">Us → them</span>
            <span className={`rounded border px-2 py-0.5 text-[11px] font-medium ${relationBadgeClass(relationSnapshot.ourAttitudeToThem)}`}>
              {relationSnapshot.ourAttitudeToThem ?? "Unknown"}
            </span>
            <span className="text-gray-400">({formatRelationPoints(relationSnapshot.ourAttitudePoints)})</span>
          </div>
        </div>
      ),
    });
  }

  if (snapshot && snapshot.warTarget && !(isWarWithBoundKingdom || isSelfWarPage)) {
    sections.push({
      standalone: true,
      node: (
        <span className="rounded border border-orange-500/40 bg-orange-950/30 px-2 py-0.5 font-medium text-orange-200">
          War · {snapshot.warTarget}
        </span>
      ),
    });
  }

  if (relationSnapshot?.hostilityMeterVisibleUntil || snapshot?.hostilityMeterVisibleUntil) {
    sections.push({
      standalone: false,
      node: (
        <div className="text-gray-300">
          Hostility meter visible until <span className="text-gray-200">{relationSnapshot?.hostilityMeterVisibleUntil ?? snapshot?.hostilityMeterVisibleUntil}</span>
        </div>
      ),
    });
  }

  if (sections.length === 1 && sections[0].standalone) {
    return <div className="mt-2 text-xs">{sections[0].node}</div>;
  }

  return (
    <div className={`mt-2 rounded-md border px-3 py-2 text-xs ${relationTone}`}>
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
