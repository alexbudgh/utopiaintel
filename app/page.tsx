export const dynamic = "force-dynamic";

import Link from "next/link";
import { getKingdoms } from "@/lib/db";
import { freshnessColor, timeAgo } from "@/lib/ui";

export default function Home() {
  const kingdoms = getKingdoms();

  return (
    <main className="p-8 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold mb-6 text-gray-100">Utopia Intel</h1>

      {kingdoms.length === 0 ? (
        <p className="text-gray-500">
          No intel received yet. POST game data to{" "}
          <code className="text-gray-300">/api/intel</code>.
        </p>
      ) : (
        <ul className="space-y-2">
          {kingdoms.map((kd) => (
            <li key={kd.location}>
              <Link
                href={`/kingdom/${encodeURIComponent(kd.location)}`}
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
