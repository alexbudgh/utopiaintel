import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { getKingdomProvinces } from "@/lib/db";
import { hashKey } from "@/lib/keys";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ loc: string }> }
) {
  const { loc } = await params;
  const kingdom = decodeURIComponent(loc);
  const key = (await cookies()).get("auth")?.value ?? "";
  const keyHash = hashKey(key);
  return NextResponse.json(getKingdomProvinces(kingdom, keyHash));
}
