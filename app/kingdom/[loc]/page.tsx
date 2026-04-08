export const dynamic = "force-dynamic";

import Link from "next/link";
import { cookies } from "next/headers";
import { createHash } from "crypto";
import { getBoundKingdom, getKingdomProvinces, getLatestKingdomSnapshot } from "@/lib/db";
import { KingdomRelations } from "@/app/components/KingdomRelations";
import { ProvinceTable } from "./ProvinceTable";
import { KingdomJump } from "./KingdomJump";

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
  const primaryOpenRelation = snapshot?.openRelations[0] ?? null;
  const relatedSnapshot = boundKingdom && kingdom === boundKingdom && primaryOpenRelation
    ? getLatestKingdomSnapshot(primaryOpenRelation.location, keyHash)
    : null;
  const hasAnyIntel = provinces.length > 0 || !!snapshot;

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
          <h1 className="text-xl font-bold text-gray-100 font-mono">{kingdom}</h1>
          {snapshot?.name && (
            <div className="text-sm text-gray-500">{snapshot.name}</div>
          )}
          <KingdomRelations
            kingdom={kingdom}
            boundKingdom={boundKingdom}
            snapshot={snapshot}
            relationSnapshot={relatedSnapshot ?? snapshot}
          />
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

      {hasAnyIntel ? (
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
        </div>
      )}
    </main>
  );
}
