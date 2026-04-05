export const dynamic = "force-dynamic";

import Link from "next/link";
import { cookies } from "next/headers";
import { createHash } from "crypto";
import { getProvinceDetail } from "@/lib/db";
import { freshnessColor, formatNum, timeAgo } from "@/lib/ui";
import type { ArmyRow, BuildingRow, ScienceRow } from "@/lib/db";
import AutoRefresh from "./AutoRefresh";

function Badge({ label }: { label: string }) {
  return <span className="text-xs text-gray-500 font-mono">{label}</span>;
}

function Age({ iso }: { iso: string }) {
  return <span className={`text-xs ${freshnessColor(iso)}`}>{timeAgo(iso)}</span>;
}

function Card({ title, age, children }: { title: string; age?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg bg-gray-800/60 p-4">
      <div className="flex items-center gap-2 mb-3">
        <h2 className="text-sm font-semibold text-gray-300">{title}</h2>
        {age && <Age iso={age} />}
      </div>
      {children}
    </div>
  );
}

function KV({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 py-0.5">
      <span className="text-gray-500 text-sm">{label}</span>
      <span className="text-gray-200 text-sm tabular-nums">{value}</span>
    </div>
  );
}

function NoData() {
  return <p className="text-gray-600 text-sm">No data</p>;
}

export default async function ProvincePage({
  params,
}: {
  params: Promise<{ loc: string; prov: string }>;
}) {
  const { loc, prov } = await params;
  const kingdom = decodeURIComponent(loc);
  const name = decodeURIComponent(prov);
  const key = (await cookies()).get("auth")?.value ?? "";
  const keyHash = createHash("sha256").update(key).digest("hex");
  const d = getProvinceDetail(name, kingdom, keyHash);

  if (!d.province) {
    return (
      <main className="p-6">
        <p className="text-gray-500">Province not found or access denied.</p>
      </main>
    );
  }

  return (
    <main className="p-6 max-w-5xl mx-auto">
      <AutoRefresh />
      {/* Header */}
      <div className="mb-6 flex items-center gap-4">
        <Link href={`/kingdom/${loc}`} className="text-gray-400 hover:text-gray-200 text-sm">
          ← {kingdom}
        </Link>
        <h1 className="text-xl font-bold text-gray-100 font-mono">{name}</h1>
        {d.overview && <Badge label={d.overview.source} />}
      </div>

      {/* Top row: Overview + Military */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <Card title="Overview" age={d.overview?.receivedAt}>
          {d.overview ? (
            <>
              <KV label="Race" value={d.overview.race ?? "—"} />
              <KV label="Personality" value={d.overview.personality ?? "—"} />
              <KV label="Honor" value={d.overview.honorTitle ?? "—"} />
              <KV label="Land" value={formatNum(d.overview.land)} />
              <KV label="Networth" value={formatNum(d.overview.networth)} />
            </>
          ) : <NoData />}
        </Card>

        <Card title="Military">
          {d.totalMilitary || d.homeMilitary || d.militaryIntel ? (
            <>
              {d.totalMilitary && (
                <>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs text-gray-600">Total (SoT)</span>
                    <Age iso={d.totalMilitary.receivedAt} />
                  </div>
                  <KV label="Off" value={formatNum(d.totalMilitary.offPoints)} />
                  <KV label="Def" value={formatNum(d.totalMilitary.defPoints)} />
                </>
              )}
              {d.homeMilitary && (
                <>
                  <div className="flex items-center gap-2 mt-2 mb-1">
                    <span className="text-xs text-gray-600">At home ({d.homeMilitary.source})</span>
                    <Age iso={d.homeMilitary.receivedAt} />
                  </div>
                  <KV label="Off at home" value={formatNum(d.homeMilitary.modOffAtHome)} />
                  <KV label="Def at home" value={formatNum(d.homeMilitary.modDefAtHome)} />
                </>
              )}
              {d.militaryIntel && (
                <>
                  <div className="flex items-center gap-2 mt-2 mb-1">
                    <span className="text-xs text-gray-600">Effectiveness (SoM)</span>
                    <Age iso={d.militaryIntel.receivedAt} />
                  </div>
                  <KV label="OME" value={d.militaryIntel.ome != null ? d.militaryIntel.ome.toFixed(1) + "%" : "—"} />
                  <KV label="DME" value={d.militaryIntel.dme != null ? d.militaryIntel.dme.toFixed(1) + "%" : "—"} />
                </>
              )}
            </>
          ) : <NoData />}
        </Card>
      </div>

      {/* Troops */}
      <div className="mb-4">
        <Card title="Troops" age={d.troops?.receivedAt}>
          {d.troops ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-gray-500 text-xs border-b border-gray-700">
                    <th className="pb-1 text-right pr-4 font-medium">Soldiers</th>
                    <th className="pb-1 text-right pr-4 font-medium">Off specs</th>
                    <th className="pb-1 text-right pr-4 font-medium">Def specs</th>
                    <th className="pb-1 text-right pr-4 font-medium">Elites</th>
                    <th className="pb-1 text-right pr-4 font-medium">War horses</th>
                    <th className="pb-1 text-right font-medium">Peasants</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="text-gray-200">
                    <td className="pt-1 text-right pr-4 tabular-nums">{formatNum(d.troops.soldiers)}</td>
                    <td className="pt-1 text-right pr-4 tabular-nums">{formatNum(d.troops.offSpecs)}</td>
                    <td className="pt-1 text-right pr-4 tabular-nums">{formatNum(d.troops.defSpecs)}</td>
                    <td className="pt-1 text-right pr-4 tabular-nums">{formatNum(d.troops.elites)}</td>
                    <td className="pt-1 text-right pr-4 tabular-nums">{formatNum(d.troops.warHorses)}</td>
                    <td className="pt-1 text-right tabular-nums">{formatNum(d.troops.peasants)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          ) : <NoData />}
        </Card>
      </div>

      {/* Armies */}
      {d.militaryIntel && d.militaryIntel.armies.length > 0 && (
        <div className="mb-4">
          <Card title="Armies" age={d.militaryIntel.receivedAt}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-gray-500 text-xs border-b border-gray-700">
                    <th className="pb-1 text-left pr-4 font-medium">Army</th>
                    <th className="pb-1 text-right pr-4 font-medium">Gen</th>
                    <th className="pb-1 text-right pr-4 font-medium">Soldiers</th>
                    <th className="pb-1 text-right pr-4 font-medium">Off</th>
                    <th className="pb-1 text-right pr-4 font-medium">Def</th>
                    <th className="pb-1 text-right pr-4 font-medium">Elites</th>
                    <th className="pb-1 text-right pr-4 font-medium">Horses</th>
                    <th className="pb-1 text-right pr-4 font-medium">Thieves</th>
                    <th className="pb-1 text-right pr-4 font-medium">Land</th>
                    <th className="pb-1 text-right font-medium">ETA</th>
                  </tr>
                </thead>
                <tbody>
                  {d.militaryIntel.armies.map((a: ArmyRow, i: number) => (
                    <tr key={i} className="border-b border-gray-700/50 text-gray-200">
                      <td className="py-1 pr-4 text-gray-400 font-mono text-xs">{a.armyType}</td>
                      <td className="py-1 pr-4 text-right tabular-nums">{formatNum(a.generals)}</td>
                      <td className="py-1 pr-4 text-right tabular-nums">{formatNum(a.soldiers)}</td>
                      <td className="py-1 pr-4 text-right tabular-nums">{formatNum(a.offSpecs)}</td>
                      <td className="py-1 pr-4 text-right tabular-nums">{formatNum(a.defSpecs)}</td>
                      <td className="py-1 pr-4 text-right tabular-nums">{formatNum(a.elites)}</td>
                      <td className="py-1 pr-4 text-right tabular-nums">{formatNum(a.warHorses)}</td>
                      <td className="py-1 pr-4 text-right tabular-nums">{formatNum(a.thieves)}</td>
                      <td className="py-1 pr-4 text-right tabular-nums">{a.landGained > 0 ? formatNum(a.landGained) : "—"}</td>
                      <td className="py-1 text-right tabular-nums">{a.returnDays != null ? a.returnDays.toFixed(1) + "d" : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {/* Resources */}
      <div className="mb-4">
        <Card title="Resources" age={d.resources?.receivedAt}>
          {d.resources ? (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-x-8">
              <KV label="Money" value={formatNum(d.resources.money)} />
              <KV label="Food" value={formatNum(d.resources.food)} />
              <KV label="Runes" value={formatNum(d.resources.runes)} />
              <KV label="Mana" value={formatNum(d.resources.mana)} />
              <KV label="Prisoners" value={formatNum(d.resources.prisoners)} />
              <KV label="Trade balance" value={d.resources.tradeBalance != null ? (d.resources.tradeBalance >= 0 ? "+" : "") + formatNum(d.resources.tradeBalance) : "—"} />
              <KV label="Efficiency" value={d.resources.buildingEfficiency != null ? d.resources.buildingEfficiency + "%" : "—"} />
              <KV label="Thieves" value={formatNum(d.resources.thieves)} />
              <KV label="Stealth" value={d.resources.stealth != null ? d.resources.stealth + "%" : "—"} />
              <KV label="Wizards" value={formatNum(d.resources.wizards)} />
            </div>
          ) : <NoData />}
        </Card>
      </div>

      {/* Status */}
      {d.status && (
        <div className="mb-4">
          <Card title="Status" age={d.status.receivedAt}>
            <div className="flex flex-wrap gap-3">
              {d.status.plagued      && <span className="text-sm text-red-400">Plagued</span>}
              {d.status.overpopulated && <span className="text-sm text-yellow-400">Overpopulated</span>}
              {d.status.war          && <span className="text-sm text-orange-400">At war</span>}
              {d.status.hitStatus    && <span className="text-sm text-gray-300">{d.status.hitStatus}</span>}
              {!d.status.plagued && !d.status.overpopulated && !d.status.war && !d.status.hitStatus && (
                <span className="text-sm text-gray-600">No flags</span>
              )}
            </div>
          </Card>
        </div>
      )}

      {/* Sciences + Buildings */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card title="Sciences" age={d.sciences?.receivedAt}>
          {d.sciences && d.sciences.sciences.length > 0 ? (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-gray-500 text-xs border-b border-gray-700">
                  <th className="pb-1 text-left font-medium">Science</th>
                  <th className="pb-1 text-right pr-2 font-medium">Books</th>
                  <th className="pb-1 text-right font-medium">Effect</th>
                </tr>
              </thead>
              <tbody>
                {d.sciences.sciences.map((s: ScienceRow) => (
                  <tr key={s.science} className="border-b border-gray-700/40">
                    <td className="py-0.5 text-gray-300">{s.science}</td>
                    <td className="py-0.5 text-right pr-2 tabular-nums text-gray-400">{formatNum(s.books)}</td>
                    <td className="py-0.5 text-right tabular-nums text-gray-400">{s.effect.toFixed(1)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <NoData />}
        </Card>

        <Card title="Buildings" age={d.survey?.receivedAt}>
          {d.survey && d.survey.buildings.length > 0 ? (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-gray-500 text-xs border-b border-gray-700">
                  <th className="pb-1 text-left font-medium">Building</th>
                  <th className="pb-1 text-right pr-2 font-medium">Built</th>
                  <th className="pb-1 text-right font-medium">In progress</th>
                </tr>
              </thead>
              <tbody>
                {d.survey.buildings.map((b: BuildingRow) => (
                  <tr key={b.building} className="border-b border-gray-700/40">
                    <td className="py-0.5 text-gray-300">{b.building}</td>
                    <td className="py-0.5 text-right pr-2 tabular-nums text-gray-400">{formatNum(b.built)}</td>
                    <td className="py-0.5 text-right tabular-nums text-gray-400">{b.inProgress > 0 ? formatNum(b.inProgress) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <NoData />}
        </Card>
      </div>
    </main>
  );
}
