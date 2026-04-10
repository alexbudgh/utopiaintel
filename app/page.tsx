export const dynamic = "force-dynamic";

import Link from "next/link";
import { cookies, headers } from "next/headers";
import { createHash } from "crypto";
import { getBoundKingdom, getKingdoms, getLatestKingdomSnapshot, type KingdomSnapshot } from "@/lib/db";
import { IntelSetupCard } from "@/app/components/IntelSetupCard";
import { IntelSetupButton } from "@/app/components/IntelSetupButton";
import { freshnessColor, timeAgo } from "@/lib/ui";
import { logout } from "@/app/logout/action";

function relationBadgeClass(status: string | null): string {
  const value = (status ?? "").toLowerCase();
  if (value.includes("hostile") || value.includes("war")) return "border-red-500/40 bg-red-950/40 text-red-200";
  if (value.includes("unfriendly")) return "border-amber-500/40 bg-amber-950/40 text-amber-200";
  if (value.includes("non aggression") || value.includes("ceasefire")) return "border-sky-500/40 bg-sky-950/40 text-sky-200";
  if (value.includes("normal")) return "border-gray-700 bg-gray-800/60 text-gray-200";
  return "border-violet-500/40 bg-violet-950/40 text-violet-200";
}

function isCeasefireLike(status: string | null): boolean {
  const value = (status ?? "").toLowerCase();
  return value.includes("non aggression") || value.includes("ceasefire");
}

function formatRelationPoints(points: number | null): string {
  return points == null ? "?" : points.toFixed(2);
}

function relationSummary(
  kingdom: string,
  boundKingdom: string | null,
  snapshot: KingdomSnapshot | null,
  relationSnapshot: KingdomSnapshot | null,
) {
  const openRelation = snapshot?.openRelations[0] ?? null;
  const warTarget = relationSnapshot?.warTarget ?? snapshot?.warTarget ?? null;
  const mutualCeasefire =
    isCeasefireLike(relationSnapshot?.theirAttitudeToUs ?? null) &&
    isCeasefireLike(relationSnapshot?.ourAttitudeToThem ?? null);

  if (!relationSnapshot && !openRelation && !warTarget) return null;

  return (
    <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px]">
      {warTarget && (
        <span className="rounded border border-orange-500/40 bg-orange-950/30 px-2 py-0.5 font-medium text-orange-200">
          War · {warTarget}
        </span>
      )}
      {openRelation && (
        <span className={`rounded border px-2 py-0.5 font-medium ${relationBadgeClass(openRelation.status)}`}>
          {openRelation.status} · {openRelation.location}
        </span>
      )}
      {mutualCeasefire ? (
        <>
          <span className={`rounded border px-2 py-0.5 font-medium ${relationBadgeClass(relationSnapshot?.ourAttitudeToThem ?? relationSnapshot?.theirAttitudeToUs ?? null)}`}>
            Non-Aggression Pact
          </span>
        </>
      ) : relationSnapshot?.theirAttitudeToUs && (
        <>
          <span className="text-gray-500">They → us</span>
          <span className={`rounded border px-2 py-0.5 font-medium ${relationBadgeClass(relationSnapshot.theirAttitudeToUs)}`}>
            {relationSnapshot.theirAttitudeToUs}
          </span>
          <span className="text-gray-500">({formatRelationPoints(relationSnapshot.theirAttitudePoints)})</span>
        </>
      )}
      {!mutualCeasefire && relationSnapshot?.ourAttitudeToThem && (
        <>
          <span className="text-gray-500">Us → them</span>
          <span className={`rounded border px-2 py-0.5 font-medium ${relationBadgeClass(relationSnapshot.ourAttitudeToThem)}`}>
            {relationSnapshot.ourAttitudeToThem}
          </span>
          <span className="text-gray-500">({formatRelationPoints(relationSnapshot.ourAttitudePoints)})</span>
        </>
      )}
    </div>
  );
}

export default async function Home() {
  const hdrs = await headers();
  const host = hdrs.get("x-forwarded-host") ?? hdrs.get("host") ?? "";
  const proto = hdrs.get("x-forwarded-proto") ?? "https";
  const baseUrl = `${proto}://${host}`;
  const key = (await cookies()).get("auth")?.value ?? "";
  const keyHash = createHash("sha256").update(key).digest("hex");
  const boundKingdom = getBoundKingdom(keyHash);
  const kingdoms = getKingdoms(keyHash);
  const kingdomRows = kingdoms.map((kd) => {
    const snapshot = getLatestKingdomSnapshot(kd.location, keyHash);
    const openRelation = snapshot?.openRelations[0] ?? null;
    const relationSnapshot =
      boundKingdom && kd.location === boundKingdom && openRelation
        ? getLatestKingdomSnapshot(openRelation.location, keyHash) ?? snapshot
        : snapshot;
    return { kd, snapshot, relationSnapshot };
  });

  return (
    <main className="p-8 max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <h1 className="text-2xl font-bold text-gray-100">Utopia Intel</h1>
          {boundKingdom && (
            <Link
              href={`/kingdom/${encodeURIComponent(boundKingdom)}`}
              className="text-sm rounded border border-gray-700 px-3 py-1.5 text-gray-300 hover:border-gray-500 hover:text-gray-100 transition-colors"
            >
              My Kingdom: <span className="font-mono">{boundKingdom}</span>
            </Link>
          )}
        </div>
        <div className="flex items-center gap-3">
          <IntelSetupButton endpointUrl={`${baseUrl}/api/intel`} />
          <form action={logout}>
            <button type="submit" className="text-sm text-gray-500 hover:text-gray-300 transition-colors">
              Sign out
            </button>
          </form>
        </div>
      </div>

      {kingdoms.length === 0 ? (
        <IntelSetupCard endpointUrl={`${baseUrl}/api/intel`} title="No intel received yet." />
      ) : (
        <div className="space-y-4">
          <ul className="space-y-2">
            {kingdomRows.map(({ kd, snapshot, relationSnapshot }) => (
              <li key={kd.location}>
                <Link
                  href={`/kingdom/${kd.location}`}
                  className="block rounded-lg bg-gray-800 px-4 py-3 hover:bg-gray-700 transition-colors"
                >
                  <div className="flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <span className="font-mono font-semibold text-gray-100">
                        {kd.location}
                      </span>
                      {snapshot?.name && (
                        <div className="text-xs text-gray-500">{snapshot.name}</div>
                      )}
                    </div>
                    <span className="text-sm text-gray-400">
                      {kd.province_count} province{kd.province_count !== 1 ? "s" : ""}
                    </span>
                    <span className={`text-sm ${freshnessColor(kd.last_seen)}`}>
                      {timeAgo(kd.last_seen)}
                    </span>
                  </div>
                  {relationSummary(kd.location, boundKingdom, snapshot, relationSnapshot)}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </main>
  );
}
