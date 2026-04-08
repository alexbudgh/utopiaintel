export const dynamic = "force-dynamic";

import Link from "next/link";
import { cookies, headers } from "next/headers";
import { createHash } from "crypto";
import { getBoundKingdom, getKingdoms, getLatestKingdomSnapshot, type KingdomSnapshot } from "@/lib/db";
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
          <span className="text-gray-500">Relation</span>
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
        <form action={logout}>
          <button type="submit" className="text-sm text-gray-500 hover:text-gray-300 transition-colors">
            Sign out
          </button>
        </form>
      </div>

      {kingdoms.length === 0 ? (
        <div className="rounded-lg bg-gray-800/60 p-6 space-y-4 text-sm">
          <p className="text-gray-300 font-medium">No intel received yet.</p>
          <p className="text-gray-400">
            To start receiving data, configure your Utopia client to send intel to this site:
          </p>
          <ol className="list-decimal list-inside space-y-2 text-gray-400">
            <li>In-game, go to <span className="text-gray-200">Preferences</span>.</li>
            <li>
              Find <span className="text-gray-200">Send intel to your own Intel site</span> and
              set the URL to <code className="text-gray-100 bg-gray-700 px-1 rounded">{baseUrl}/api/intel</code>.
            </li>
            <li>
              Set the <span className="text-gray-200">key</span> to the same value you used to log
              in here. This is how the site knows which intel belongs to your kingdom — everyone on
              your team should use the same key.{" "}
              <span className="text-yellow-400">This key is a secret: do not share it outside your kingdom.</span>{" "}
              If you don{"'"}t have it yet, ask your kingdom mates.
            </li>
            <li>
              Make sure <span className="text-gray-200">Ajax mode</span> is <span className="text-red-400">disabled</span> in
              Bot Prefs, otherwise requests may not send reliably.
            </li>
          </ol>
          <p className="text-gray-500">
            Once configured, intel will appear here automatically as your kingdom members browse the game.
          </p>
        </div>
      ) : (
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
      )}
    </main>
  );
}
