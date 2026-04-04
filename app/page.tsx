export const dynamic = "force-dynamic";

import Link from "next/link";
import { cookies, headers } from "next/headers";
import { createHash } from "crypto";
import { getKingdoms } from "@/lib/db";
import { freshnessColor, timeAgo } from "@/lib/ui";
import { logout } from "@/app/logout/action";

export default async function Home() {
  const hdrs = await headers();
  const host = hdrs.get("x-forwarded-host") ?? hdrs.get("host") ?? "";
  const proto = hdrs.get("x-forwarded-proto") ?? "https";
  const baseUrl = `${proto}://${host}`;
  const key = (await cookies()).get("auth")?.value ?? "";
  const keyHash = createHash("sha256").update(key).digest("hex");
  const kingdoms = getKingdoms(keyHash);

  return (
    <main className="p-8 max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-100">Utopia Intel</h1>
        <form action={logout}>
          <button type="submit" className="text-sm text-gray-500 hover:text-gray-300 transition-colors">
            Sign out
          </button>
        </form>
      </div>

      {kingdoms.length === 0 ? (
        <div className="rounded-lg bg-gray-800/60 p-6 space-y-4 text-sm">
          <p className="text-gray-300 font-medium">No intel received yet.</p>
          <p className="text-gray-400">
            To start receiving data, configure your Utopia client to send intel to this site:
          </p>
          <ol className="list-decimal list-inside space-y-2 text-gray-400">
            <li>In-game, go to <span className="text-gray-200">Preferences</span>.</li>
            <li>
              Find <span className="text-gray-200">Send intel to your own Intel site</span> and
              set the URL to <code className="text-gray-100 bg-gray-700 px-1 rounded">{baseUrl}/api/intel</code>.
            </li>
            <li>
              Set the <span className="text-gray-200">key</span> to the same value you used to log
              in here. This is how the site knows which intel belongs to your kingdom — everyone on
              your team should use the same key.{" "}
              <span className="text-yellow-400">This key is a secret: do not share it outside your kingdom.</span>{" "}
              If you don{"'"}t have it yet, ask your kingdom mates.
            </li>
            <li>
              Make sure <span className="text-gray-200">Ajax mode</span> is <span className="text-red-400">disabled</span> in
              Bot Prefs, otherwise requests may not send reliably.
            </li>
          </ol>
          <p className="text-gray-500">
            Once configured, intel will appear here automatically as your kingdom members browse the game.
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {kingdoms.map((kd) => (
            <li key={kd.location}>
              <Link
                href={`/kingdom/${kd.location}`}
                className="flex items-center justify-between px-4 py-3 rounded-lg bg-gray-800 hover:bg-gray-700 transition-colors"
              >
                <span className="font-mono font-semibold text-gray-100">
                  {kd.location}
                </span>
                <span className="text-sm text-gray-400">
                  {kd.province_count} province{kd.province_count !== 1 ? "s" : ""}
                </span>
                <span className={`text-sm ${freshnessColor(kd.last_seen)}`}>
                  {timeAgo(kd.last_seen)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
