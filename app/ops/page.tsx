import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { getDbApi } from "@/lib/db-api";
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
  const db = getDbApi();
  const [boundKingdom, initialOps] = await Promise.all([
    db.getBoundKingdom(keyHash),
    db.getRecentOps(keyHash, 200),
  ]);
  const selfWarTarget = boundKingdom
    ? ((await db.getLatestKingdomSnapshot(boundKingdom, keyHash))?.warTarget ??
      null)
    : null;

  return (
    <main className="p-8 max-w-6xl mx-auto">
      <AppHeader
        endpointUrl={`${baseUrl}/api/intel`}
        boundKingdom={boundKingdom}
        selfWarTarget={selfWarTarget}
      />
      <h1 className="text-xl font-semibold tracking-tight text-gray-100 mb-4">
        Recent Ops
      </h1>
      <RecentOpsView initialOps={initialOps} />
    </main>
  );
}
