export const dynamic = "force-dynamic";

import { cookies } from "next/headers";
import { createHash } from "crypto";
import { GainsTable } from "./GainsTable";
import { getGainsPageData } from "@/lib/gains-page";

export default async function GainsPage({
  params,
}: {
  params: Promise<{ loc: string }>;
}) {
  const { loc } = await params;
  const targetKingdom = decodeURIComponent(loc);
  const key = (await cookies()).get("auth")?.value ?? "";
  const keyHash = createHash("sha256").update(key).digest("hex");
  const initial = getGainsPageData(targetKingdom, keyHash);

  return <GainsTable initial={initial} />;
}
