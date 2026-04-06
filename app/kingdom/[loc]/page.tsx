export const dynamic = "force-dynamic";

import Link from "next/link";
import { cookies } from "next/headers";
import { createHash } from "crypto";
import { getKingdomProvinces, getLatestKingdomSnapshot } from "@/lib/db";
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
  const provinces = getKingdomProvinces(kingdom, keyHash);
  const snapshot = getLatestKingdomSnapshot(kingdom, keyHash);

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
