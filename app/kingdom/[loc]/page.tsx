export const dynamic = "force-dynamic";

import Link from "next/link";
import { cookies, headers } from "next/headers";
import { createHash } from "crypto";
import { getBoundKingdom, getKingdomProvinces, getLatestKingdomSnapshot } from "@/lib/db";
import { KingdomRelations } from "@/app/components/KingdomRelations";
import { IntelSetupCard } from "@/app/components/IntelSetupCard";
import { ProvinceTable } from "./ProvinceTable";
import { GainsTable } from "./gains/GainsTable";
import { KingdomJump } from "./KingdomJump";
import { getGainsPageData } from "@/lib/gains-page";

export default async function KingdomPage({
  params,
  searchParams,
}: {
  params: Promise<{ loc: string }>;
  searchParams: Promise<{ view?: string }>;
}) {
  const { loc } = await params;
  const { view } = await searchParams;
  const kingdom = decodeURIComponent(loc);
  const hdrs = await headers();
  const host = hdrs.get("x-forwarded-host") ?? hdrs.get("host") ?? "";
  const proto = hdrs.get("x-forwarded-proto") ?? "https";
  const baseUrl = `${proto}://${host}`;
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
  const gainsInitial = view === "gains" ? getGainsPageData(kingdom, keyHash) : null;

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
        <div className="ml-auto">
          <KingdomJump />
        </div>
      </div>

      {view === "gains" ? (
        <GainsTable initial={gainsInitial!} embedded />
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
