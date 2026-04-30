import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { getBoundKingdom, getLatestKingdomSnapshot, getRecentOps } from "@/lib/db";
import { hashKey } from "@/lib/keys";
import { AppHeader } from "@/app/components/AppHeader";
import { RecentOpsView } from "./RecentOpsView";

export default async function OpsPage() {
  const hdrs = await headers();
  const host = hdrs.get("x-forwarded-host") ?? hdrs.get("host") ?? "";
  const proto = hdrs.get("x-forwarded-proto") ?? "https";
  const baseUrl = `${proto}://${host}`;

  const key = (await cookies()).get("auth")?.value ?? "";
  if (!key) redirect("/");

  const keyHash = hashKey(key);
  const boundKingdom = getBoundKingdom(keyHash);
  const selfWarTarget = boundKingdom
    ? (getLatestKingdomSnapshot(boundKingdom, keyHash)?.warTarget ?? null)
    : null;
  const initialOps = getRecentOps(keyHash);

  return (
    <main className="p-8 max-w-3xl mx-auto">
      <AppHeader
        endpointUrl={`${baseUrl}/api/intel`}
        boundKingdom={boundKingdom}
        selfWarTarget={selfWarTarget}
      />
      <h1 className="text-xl font-semibold tracking-tight text-gray-100 mb-4">Recent Ops</h1>
      <RecentOpsView initialOps={initialOps} />
    </main>
  );
}
