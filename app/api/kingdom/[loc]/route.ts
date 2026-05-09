import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { withAxiomRouteHandler, AxiomRequest } from "next-axiom";
import { getDbApi } from "@/lib/db-api";
import { hashKey } from "@/lib/keys";
import { toRelationContext } from "@/lib/relation-context";

export const GET = withAxiomRouteHandler(async (
  _req: AxiomRequest,
  { params }: { params: Promise<{ loc: string }> }
) => {
  const { loc } = await params;
  const kingdom = decodeURIComponent(loc);
  const key = (await cookies()).get("auth")?.value ?? "";
  const keyHash = hashKey(key);
  const db = getDbApi();
  const [boundKingdom, kdSnapshot, provinces, dragon, ritual] = await Promise.all([
    db.getBoundKingdom(keyHash),
    db.getLatestKingdomSnapshot(kingdom, keyHash),
    db.getKingdomProvinces(kingdom, keyHash),
    db.getKingdomDragon(kingdom, keyHash),
    db.getKingdomRitual(kingdom, keyHash),
  ]);
  const relationContexts = boundKingdom && kingdom === boundKingdom
    ? await Promise.all(
        (kdSnapshot?.openRelations ?? []).map((relation) =>
          db.getLatestKingdomSnapshot(relation.location, keyHash)
        )
      ).then((snaps) => snaps.map(toRelationContext).filter((ctx) => ctx !== null))
    : [];
  return NextResponse.json({ provinces, kdSnapshot, relationContexts, dragon, ritual });
});
