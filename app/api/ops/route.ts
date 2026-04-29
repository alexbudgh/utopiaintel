import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { getRecentOps } from "@/lib/db";
import { hashKey } from "@/lib/keys";

export async function GET(req: NextRequest) {
  const key = (await cookies()).get("auth")?.value ?? "";
  if (!key) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const keyHash = hashKey(key);
  const since = req.nextUrl.searchParams.get("since") ?? undefined;
  return NextResponse.json(getRecentOps(keyHash, 50, since));
}
