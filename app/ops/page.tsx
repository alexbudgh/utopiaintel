import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getRecentOps } from "@/lib/db";
import { hashKey } from "@/lib/keys";
import { RecentOpsView } from "./RecentOpsView";

export default async function OpsPage() {
  const key = (await cookies()).get("auth")?.value ?? "";
  if (!key) redirect("/");

  const keyHash = hashKey(key);
  const ops = getRecentOps(keyHash);

  return (
    <main className="p-8 max-w-3xl mx-auto">
      <div className="flex items-center gap-4 mb-6">
        <Link href="/" className="text-sm text-gray-500 hover:text-gray-300 transition-colors">
          ← Kingdoms
        </Link>
        <h1 className="text-2xl font-bold tracking-tight text-gray-100">Recent Ops</h1>
      </div>
      <RecentOpsView ops={ops} />
    </main>
  );
}
