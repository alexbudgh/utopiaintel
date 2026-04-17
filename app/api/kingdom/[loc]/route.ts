import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { getBoundKingdom, getKingdomDragon, getKingdomProvinces, getKingdomRitual, getLatestKingdomSnapshot } from "@/lib/db";
import { hashKey } from "@/lib/keys";
import { toRelationContext } from "@/lib/relation-context";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ loc: string }> }
) {
  const { loc } = await params;
  const kingdom = decodeURIComponent(loc);
  const key = (await cookies()).get("auth")?.value ?? "";
  const keyHash = hashKey(key);
  const boundKingdom = getBoundKingdom(keyHash);
  const kdSnapshot = getLatestKingdomSnapshot(kingdom, keyHash);
  const relationContexts = boundKingdom && kingdom === boundKingdom
    ? (kdSnapshot?.openRelations ?? [])
        .map((relation) => toRelationContext(getLatestKingdomSnapshot(relation.location, keyHash)))
        .filter((context) => context !== null)
    : [];
  return NextResponse.json({
    provinces: getKingdomProvinces(kingdom, keyHash),
    kdSnapshot,
    relationContexts,
    dragon: getKingdomDragon(kingdom, keyHash),
    ritual: getKingdomRitual(kingdom, keyHash),
  });
}
