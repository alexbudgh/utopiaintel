export const dynamic = "force-dynamic";

import Link from "next/link";
import { getKingdomProvinces } from "@/lib/db";
import { freshnessColor, formatNum, timeAgo } from "@/lib/ui";

export default async function KingdomPage({
  params,
}: {
  params: Promise<{ loc: string }>;
}) {
  const { loc } = await params;
  const kingdom = decodeURIComponent(loc);
  const provinces = getKingdomProvinces(kingdom);

  return (
    <main className="p-6">
      <div className="mb-4 flex items-center gap-4">
        <Link href="/" className="text-gray-400 hover:text-gray-200 text-sm">
          ← kingdoms
        </Link>
        <h1 className="text-xl font-bold text-gray-100 font-mono">{kingdom}</h1>
        <span className="text-sm text-gray-500">{provinces.length} provinces</span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-gray-400 border-b border-gray-700">
              <th className="py-2 pr-4 font-medium">Province</th>
              <th className="py-2 pr-4 font-medium">Race</th>
              <th className="py-2 pr-4 font-medium text-right">Land</th>
              <th className="py-2 pr-4 font-medium text-right">NW</th>
              <th className="py-2 pr-4 font-medium text-right">Off</th>
              <th className="py-2 pr-4 font-medium text-right">Def</th>
              <th className="py-2 font-medium text-right">Age</th>
            </tr>
          </thead>
          <tbody>
            {provinces.map((p) => {
              const ageCol = p.overview_age ?? p.military_age;
              const fc = freshnessColor(ageCol);
              return (
                <tr key={p.id} className="border-b border-gray-800 hover:bg-gray-800/40">
                  <td className="py-2 pr-4">
                    <span className={`mr-1.5 ${fc}`}>●</span>
                    {p.name}
                  </td>
                  <td className="py-2 pr-4 font-mono text-gray-400">{p.race ?? "—"}</td>
                  <td className="py-2 pr-4 text-right tabular-nums">{formatNum(p.land)}</td>
                  <td className="py-2 pr-4 text-right tabular-nums">{formatNum(p.networth)}</td>
                  <td className="py-2 pr-4 text-right tabular-nums">{formatNum(p.off_points)}</td>
                  <td className="py-2 pr-4 text-right tabular-nums">{formatNum(p.def_points)}</td>
                  <td className={`py-2 text-right tabular-nums ${fc}`}>{timeAgo(ageCol)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </main>
  );
}
