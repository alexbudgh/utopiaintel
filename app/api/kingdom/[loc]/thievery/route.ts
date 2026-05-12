import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { withAxiomRouteHandler, AxiomRequest } from "next-axiom";
import { getGainsPageData } from "@/lib/gains-page";
import { hashKey } from "@/lib/keys";

export const GET = withAxiomRouteHandler(
  async (
    _req: AxiomRequest,
    { params }: { params: Promise<{ loc: string }> },
  ) => {
    const { loc } = await params;
    const kingdom = decodeURIComponent(loc);
    const key = (await cookies()).get("auth")?.value ?? "";
    const keyHash = hashKey(key);
    return NextResponse.json(getGainsPageData(kingdom, keyHash));
  },
);
