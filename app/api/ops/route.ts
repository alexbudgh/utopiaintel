import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { withAxiom, AxiomRequest } from "next-axiom";
import { getRecentOps } from "@/lib/db";
import { hashKey } from "@/lib/keys";

export const GET = withAxiom(async (req: AxiomRequest) => {
  const key = (await cookies()).get("auth")?.value ?? "";
  if (!key) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const keyHash = hashKey(key);
  const since = req.nextUrl.searchParams.get("since") ?? undefined;
  return NextResponse.json(getRecentOps(keyHash, 200, since));
});
