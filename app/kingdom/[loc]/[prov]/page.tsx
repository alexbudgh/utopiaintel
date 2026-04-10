export const dynamic = "force-dynamic";

import Link from "next/link";
import { cookies } from "next/headers";
import { createHash } from "crypto";
import { Tooltip } from "@/app/components/Tooltip";
import { getProvinceDetail } from "@/lib/db";
import { freshnessColor, formatNum, timeAgo, fullValueTooltip } from "@/lib/ui";
import { BAD_SPELL_NAMES } from "@/lib/effects";
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

function maybeRoundedValue(
  displayed: string,
  value: number | null | undefined,
  options?: { suffix?: string; maximumFractionDigits?: number },
): React.ReactNode {
  const tip = fullValueTooltip(displayed, value, options);
  return tip ? <Tooltip content={tip}>{displayed}</Tooltip> : displayed;
}

function formatEffectLabel(effect: { name: string; durationText: string | null; remainingTicks: number | null; effectivenessPercent: number | null }): string {
  const parts: string[] = [];
  if (effect.effectivenessPercent != null) parts.push(`${effect.effectivenessPercent.toFixed(1)}%`);
  if (effect.remainingTicks != null) parts.push(`${effect.remainingTicks} ticks left`);
  else if (effect.durationText) parts.push(effect.durationText);
  return parts.length ? `${effect.name} (${parts.join(", ")})` : effect.name;
}

const BAD_SPELLS: Set<string> = new Set(BAD_SPELL_NAMES);

function effectBucket(effect: { name: string; kind: string }): "ritual" | "bad" | "good" {
  if (effect.kind === "ritual") return "ritual";
  return BAD_SPELLS.has(effect.name) ? "bad" : "good";
}

function EffectGroup({
  label,
  tone,
  effects,
}: {
  label: string;
  tone: string;
  effects: Array<{ name: string; durationText: string | null; remainingTicks: number | null; effectivenessPercent: number | null }>;
}) {
  if (effects.length === 0) return null;
  return (
    <div className="flex items-start gap-2">
      <span className="text-sm text-gray-500">{label}</span>
      <div className="flex flex-wrap gap-2">
        {effects.map((effect) => (
          <span key={`${effect.name}:${effect.durationText ?? ""}`} className={`text-sm ${tone}`}>
            {formatEffectLabel(effect)}
          </span>
        ))}
      </div>
    </div>
  );
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
  const goodEffects = d.effects.filter((effect) => effectBucket(effect) === "good");
  const badEffects = d.effects.filter((effect) => effectBucket(effect) === "bad");
  const ritualEffects = d.effects.filter((effect) => effectBucket(effect) === "ritual");

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
              <KV label="Land" value={d.overview.land != null ? d.overview.land.toLocaleString() : "—"} />
              <KV label="Networth" value={maybeRoundedValue(formatNum(d.overview.networth), d.overview.networth)} />
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
                  <KV label="Off" value={maybeRoundedValue(formatNum(d.totalMilitary.offPoints), d.totalMilitary.offPoints)} />
                  <KV label="Def" value={maybeRoundedValue(formatNum(d.totalMilitary.defPoints), d.totalMilitary.defPoints)} />
                </>
              )}
              {d.homeMilitary && (
                <>
                  <div className="flex items-center gap-2 mt-2 mb-1">
                    <span className="text-xs text-gray-600">At home ({d.homeMilitary.source})</span>
                    <Age iso={d.homeMilitary.receivedAt} />
                  </div>
                  <KV label="Off at home" value={maybeRoundedValue(formatNum(d.homeMilitary.modOffAtHome), d.homeMilitary.modOffAtHome)} />
                  <KV label="Def at home" value={maybeRoundedValue(formatNum(d.homeMilitary.modDefAtHome), d.homeMilitary.modDefAtHome)} />
                </>
              )}
              {d.militaryIntel && (
                <>
                  <div className="flex items-center gap-2 mt-2 mb-1">
                    <span className="text-xs text-gray-600">Effectiveness (SoM)</span>
                    <Age iso={d.militaryIntel.receivedAt} />
                  </div>
                  <KV label="OME" value={d.militaryIntel.ome != null ? maybeRoundedValue(d.militaryIntel.ome.toFixed(1) + "%", d.militaryIntel.ome, { suffix: "%" }) : "—"} />
                  <KV label="DME" value={d.militaryIntel.dme != null ? maybeRoundedValue(d.militaryIntel.dme.toFixed(1) + "%", d.militaryIntel.dme, { suffix: "%" }) : "—"} />
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
                    <td className="pt-1 text-right pr-4 tabular-nums">{maybeRoundedValue(formatNum(d.troops.soldiers), d.troops.soldiers)}</td>
                    <td className="pt-1 text-right pr-4 tabular-nums">{maybeRoundedValue(formatNum(d.troops.offSpecs), d.troops.offSpecs)}</td>
                    <td className="pt-1 text-right pr-4 tabular-nums">{maybeRoundedValue(formatNum(d.troops.defSpecs), d.troops.defSpecs)}</td>
                    <td className="pt-1 text-right pr-4 tabular-nums">{maybeRoundedValue(formatNum(d.troops.elites), d.troops.elites)}</td>
                    <td className="pt-1 text-right pr-4 tabular-nums">{maybeRoundedValue(formatNum(d.troops.warHorses), d.troops.warHorses)}</td>
                    <td className="pt-1 text-right tabular-nums">{maybeRoundedValue(formatNum(d.troops.peasants), d.troops.peasants)}</td>
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
                      <td className="py-1 pr-4 text-right tabular-nums">{a.generals.toLocaleString()}</td>
                      <td className="py-1 pr-4 text-right tabular-nums">{a.soldiers.toLocaleString()}</td>
                      <td className="py-1 pr-4 text-right tabular-nums">{a.offSpecs.toLocaleString()}</td>
                      <td className="py-1 pr-4 text-right tabular-nums">{a.defSpecs.toLocaleString()}</td>
                      <td className="py-1 pr-4 text-right tabular-nums">{a.elites.toLocaleString()}</td>
                      <td className="py-1 pr-4 text-right tabular-nums">{a.warHorses.toLocaleString()}</td>
                      <td className="py-1 pr-4 text-right tabular-nums">{a.thieves.toLocaleString()}</td>
                      <td className="py-1 pr-4 text-right tabular-nums">{a.landGained > 0 ? a.landGained.toLocaleString() : "—"}</td>
                      <td className="py-1 text-right tabular-nums">{a.returnDays != null ? maybeRoundedValue(a.returnDays.toFixed(1) + "d", a.returnDays, { suffix: "d" }) : "—"}</td>
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
              <KV label="Money" value={maybeRoundedValue(formatNum(d.resources.money), d.resources.money)} />
              <KV label="Food" value={maybeRoundedValue(formatNum(d.resources.food), d.resources.food)} />
              <KV label="Runes" value={maybeRoundedValue(formatNum(d.resources.runes), d.resources.runes)} />
              <KV label="Mana" value={maybeRoundedValue(formatNum(d.resources.mana), d.resources.mana)} />
              <KV label="Prisoners" value={maybeRoundedValue(formatNum(d.resources.prisoners), d.resources.prisoners)} />
              <KV label="Trade balance" value={d.resources.tradeBalance != null ? maybeRoundedValue(`${d.resources.tradeBalance >= 0 ? "+" : ""}${formatNum(d.resources.tradeBalance)}`, d.resources.tradeBalance) : "—"} />
              <KV label="Efficiency" value={d.resources.buildingEfficiency != null ? d.resources.buildingEfficiency + "%" : "—"} />
              <KV label="Thieves" value={maybeRoundedValue(formatNum(d.resources.thieves), d.resources.thieves)} />
              <KV label="Stealth" value={d.resources.stealth != null ? d.resources.stealth + "%" : "—"} />
              <KV label="Wizards" value={maybeRoundedValue(formatNum(d.resources.wizards), d.resources.wizards)} />
            </div>
          ) : <NoData />}
        </Card>
      </div>

      {/* Status */}
      {d.status && (
        <div className="mb-4">
          <Card title="Status" age={d.status.receivedAt}>
            <div className="space-y-2">
              <div className="flex flex-wrap gap-3">
              {d.status.plagued      && <span className="text-sm text-red-400">Plagued</span>}
              {d.status.overpopulated && <span className="text-sm text-yellow-400">Overpopulated</span>}
              {d.status.war          && <span className="text-sm text-orange-400">At war</span>}
              {d.status.hitStatus    && <span className="text-sm text-gray-300">{d.status.hitStatus}</span>}
              {!d.status.plagued && !d.status.overpopulated && !d.status.war && !d.status.hitStatus && d.effects.length === 0 && (
                <span className="text-sm text-gray-600">No flags</span>
              )}
              </div>
              <EffectGroup label="Good Spells" tone="text-blue-300" effects={goodEffects} />
              <EffectGroup label="Bad Spells" tone="text-red-300" effects={badEffects} />
              <EffectGroup label="Ritual" tone="text-purple-300" effects={ritualEffects} />
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
                    <td className="py-0.5 text-right pr-2 tabular-nums text-gray-400">{maybeRoundedValue(formatNum(s.books), s.books)}</td>
                    <td className="py-0.5 text-right tabular-nums text-gray-400">{maybeRoundedValue(s.effect.toFixed(1) + "%", s.effect, { suffix: "%" })}</td>
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
                  <th className="pb-1 text-right pr-2 font-medium">%</th>
                  <th className="pb-1 text-right font-medium">In progress</th>
                </tr>
              </thead>
              <tbody>
                {d.survey.buildings.map((b: BuildingRow) => {
                  const builtPct = d.overview?.land ? (b.built / d.overview.land) * 100 : null;
                  return (
                    <tr key={b.building} className="border-b border-gray-700/40">
                      <td className="py-0.5 text-gray-300">{b.building}</td>
                      <td className="py-0.5 text-right pr-2 tabular-nums text-gray-400">{maybeRoundedValue(formatNum(b.built), b.built)}</td>
                      <td className="py-0.5 text-right pr-2 tabular-nums text-gray-400">{builtPct != null ? maybeRoundedValue(`${builtPct.toFixed(1)}%`, builtPct, { suffix: "%" }) : "—"}</td>
                      <td className="py-0.5 text-right tabular-nums text-gray-400">{b.inProgress > 0 ? maybeRoundedValue(formatNum(b.inProgress), b.inProgress) : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : <NoData />}
        </Card>
      </div>
    </main>
  );
}
