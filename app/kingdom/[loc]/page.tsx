export const dynamic = "force-dynamic";

import Link from "next/link";
import { cookies } from "next/headers";
import { createHash } from "crypto";
import { getBoundKingdom, getKingdomProvinces, getLatestKingdomSnapshot } from "@/lib/db";
import { ProvinceTable } from "./ProvinceTable";
import { KingdomJump } from "./KingdomJump";

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

export default async function KingdomPage({
  params,
}: {
  params: Promise<{ loc: string }>;
}) {
  const { loc } = await params;
  const kingdom = decodeURIComponent(loc);
  const key = (await cookies()).get("auth")?.value ?? "";
  const keyHash = createHash("sha256").update(key).digest("hex");
  const boundKingdom = getBoundKingdom(keyHash);
  const provinces = getKingdomProvinces(kingdom, keyHash);
  const snapshot = getLatestKingdomSnapshot(kingdom, keyHash);
  const isWarWithBoundKingdom = !!snapshot?.warTarget && !!boundKingdom && snapshot.warTarget === boundKingdom;
  const isSelfWarPage = !!snapshot?.warTarget && !!boundKingdom && kingdom === boundKingdom;
  const primaryOpenRelation = snapshot?.openRelations[0] ?? null;
  const relationTone = isWarWithBoundKingdom || isSelfWarPage
    ? "border-orange-500/40 bg-orange-950/30 text-orange-100"
    : "border-gray-800 bg-gray-900/50 text-gray-300";

  return (
    <main className="p-6">
      <div className="mb-4 flex flex-wrap items-center gap-4">
        <Link href="/" className="text-gray-400 hover:text-gray-200 text-sm">
          ← kingdoms
        </Link>
        <div>
          <h1 className="text-xl font-bold text-gray-100 font-mono">{kingdom}</h1>
          {snapshot?.name && (
            <div className="text-sm text-gray-500">{snapshot.name}</div>
          )}
          {(snapshot?.theirAttitudeToUs || snapshot?.ourAttitudeToThem || snapshot?.warTarget || primaryOpenRelation) && (
            <div className={`mt-2 rounded-md border px-3 py-2 text-xs ${relationTone}`}>
              {(isWarWithBoundKingdom || isSelfWarPage) && (
                <div className="mb-1 font-semibold uppercase tracking-wide text-orange-200">
                  War
                  {snapshot.warTarget && ` · ${snapshot.warTarget}`}
                </div>
              )}
              {primaryOpenRelation && (
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <span className="text-[11px] uppercase tracking-wide text-gray-500">Open relation</span>
                  <Link
                    href={`/kingdom/${encodeURIComponent(primaryOpenRelation.location)}`}
                    className="text-gray-100 hover:text-blue-300"
                  >
                    {primaryOpenRelation.name} ({primaryOpenRelation.location})
                  </Link>
                  <span className={`rounded border px-2 py-0.5 text-[11px] font-medium ${relationBadgeClass(primaryOpenRelation.status)}`}>
                    {primaryOpenRelation.status}
                  </span>
                </div>
              )}
              {snapshot && (snapshot.theirAttitudeToUs || snapshot.ourAttitudeToThem) && (
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2 text-gray-300">
                    <span className="w-20 text-gray-500">They → us</span>
                    <span className={`rounded border px-2 py-0.5 text-[11px] font-medium ${relationBadgeClass(snapshot.theirAttitudeToUs)}`}>
                      {snapshot.theirAttitudeToUs ?? "Unknown"}
                    </span>
                    <span className="text-gray-400">({formatRelationPoints(snapshot.theirAttitudePoints)})</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-gray-300">
                    <span className="w-20 text-gray-500">Us → them</span>
                    <span className={`rounded border px-2 py-0.5 text-[11px] font-medium ${relationBadgeClass(snapshot.ourAttitudeToThem)}`}>
                      {snapshot.ourAttitudeToThem ?? "Unknown"}
                    </span>
                    <span className="text-gray-400">({formatRelationPoints(snapshot.ourAttitudePoints)})</span>
                  </div>
                </div>
              )}
              {snapshot && snapshot.warTarget && !(isWarWithBoundKingdom || isSelfWarPage) && (
                <div className="mt-1 text-gray-300">
                  War target: <span className="text-orange-300">{snapshot.warTarget}</span>
                </div>
              )}
              {snapshot && snapshot.hostilityMeterVisibleUntil && (
                <div className="mt-1 text-gray-300">
                  Hostility meter visible until <span className="text-gray-200">{snapshot.hostilityMeterVisibleUntil}</span>
                </div>
              )}
            </div>
          )}
        </div>
        <span className="text-sm text-gray-500">{provinces.length} provinces</span>
        <Link
          href={`/kingdom/${encodeURIComponent(kingdom)}/gains`}
          className="text-sm text-gray-400 hover:text-gray-200"
        >
          gains
        </Link>
        <div className="ml-auto">
          <KingdomJump />
        </div>
      </div>

      <ProvinceTable kingdom={kingdom} initial={provinces} />
    </main>
  );
}
