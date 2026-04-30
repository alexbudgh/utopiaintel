import Link from "next/link";
import { IntelSetupButton } from "./IntelSetupButton";
import { KingdomJump } from "@/app/kingdom/[loc]/KingdomJump";
import { logout } from "@/app/logout/action";

export function AppHeader({
  endpointUrl,
  boundKingdom,
  selfWarTarget,
}: {
  endpointUrl: string;
  boundKingdom?: string | null;
  selfWarTarget?: string | null;
}) {
  return (
    <div className="mb-6 space-y-3">
      <div className="flex items-center justify-between">
        <Link href="/" className="text-2xl font-bold tracking-tight text-gray-100 hover:text-gray-200 transition-colors">
          Chaos Intel
        </Link>
        <div className="flex items-center gap-3">
          <Link href="/ops" className="text-sm text-gray-500 hover:text-gray-300 transition-colors">
            Recent Ops
          </Link>
          <IntelSetupButton endpointUrl={endpointUrl} />
          <form action={logout}>
            <button type="submit" className="text-sm text-gray-500 hover:text-gray-300 transition-colors">
              Sign out
            </button>
          </form>
        </div>
      </div>
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          {boundKingdom && (
            <Link
              href={`/kingdom/${encodeURIComponent(boundKingdom)}`}
              className="text-sm rounded border border-gray-700 px-3 py-1.5 text-gray-300 hover:border-gray-500 hover:text-gray-100 transition-colors"
            >
              My Kingdom: <span className="font-mono">{boundKingdom}</span>
            </Link>
          )}
          {selfWarTarget && (
            <Link
              href={`/kingdom/${encodeURIComponent(selfWarTarget)}`}
              className="text-sm rounded border border-orange-500/60 bg-orange-950/30 px-3 py-1.5 font-medium text-orange-200 hover:border-orange-400 hover:text-orange-100 transition-colors"
            >
              ⚔ War · {selfWarTarget}
            </Link>
          )}
        </div>
        <KingdomJump />
      </div>
    </div>
  );
}
