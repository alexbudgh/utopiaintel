import { cookies } from "next/headers";
import { createHash } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { getGainsPageData } from "@/lib/gains-page";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ loc: string }> }
) {
  const { loc } = await params;
  const kingdom = decodeURIComponent(loc);
  const key = (await cookies()).get("auth")?.value ?? "";
  const keyHash = createHash("sha256").update(key).digest("hex");
  return NextResponse.json(getGainsPageData(kingdom, keyHash));
}
