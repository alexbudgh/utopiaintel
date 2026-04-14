export const dynamic = "force-dynamic";

import Link from "next/link";
import { cookies } from "next/headers";
import { createHash } from "crypto";
import { Tooltip, type TooltipLine } from "@/app/components/Tooltip";
import { getProvinceDetail } from "@/lib/db";
import { freshnessColor, timeAgo, fullValueTooltip } from "@/lib/ui";
import { BAD_SPELL_NAMES } from "@/lib/effects";
import { computeAmbushRawOff } from "@/lib/ambush";
import { estimatePop } from "@/lib/population";
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

function effectBucket(effect: { name: string; kind: string }): "ritual" | "thievery" | "bad" | "good" {
  if (effect.kind === "ritual") return "ritual";
  if (effect.kind === "thievery") return "thievery";
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
  // Use direct council_state values when available (self-intel); otherwise estimate from unit counts + survey
  const directPop = d.resources?.totalPop != null || d.resources?.maxPop != null
    ? { currentPop: d.resources.totalPop, maxPop: d.resources.maxPop, wizardsEstimated: false, needsForMax: [], needsForCurrent: [] }
    : null;
  const pop = d.province ? (directPop ?? estimatePop({
    race: d.overview?.race ?? null,
    honor_title: d.overview?.honorTitle ?? null,
    personality: d.overview?.personality ?? null,
    networth: d.overview?.networth ?? null,
    land: d.overview?.land ?? null,
    barren_land: d.survey?.buildings.find(b => b.building === "Barren Land")?.built ?? null,
    homes_built: d.survey?.buildings.find(b => b.building === "Homes")?.built ?? null,
    buildings_built: d.survey ? d.survey.buildings.filter(b => b.building !== "Barren Land").reduce((s, b) => s + b.built, 0) : null,
    buildings_in_progress: d.survey?.buildings.reduce((s, b) => s + (b.inProgress ?? 0), 0) ?? null,
    survey_age: d.survey?.receivedAt ?? null,
    housing_effect: d.sciences?.sciences.find(s => s.science === "Housing")?.effect ?? null,
    science_total_books: d.sciences?.sciences.reduce((s, sc) => s + sc.books, 0) ?? null,
    sciences_age: d.sciences?.receivedAt ?? null,
    peasants: d.troops?.peasants ?? null,
    soldiers: d.troops?.soldiers ?? null,
    off_specs: d.troops?.offSpecs ?? null,
    def_specs: d.troops?.defSpecs ?? null,
    elites: d.troops?.elites ?? null,
    war_horses: d.troops?.warHorses ?? null,
    money: d.resources?.money ?? null,
    thieves: d.resources?.thieves ?? null,
    thieves_age: d.resources?.thievesAge ?? null,
    wizards: d.resources?.wizards ?? null,
    prisoners: d.resources?.prisoners ?? null,
    troops_age: d.troops?.receivedAt ?? null,
    resources_age: d.resources?.receivedAt ?? null,
    training_off_specs: d.militaryIntel?.armies.find(a => a.armyType === "training")?.offSpecs ?? null,
    training_def_specs: d.militaryIntel?.armies.find(a => a.armyType === "training")?.defSpecs ?? null,
    training_elites: d.militaryIntel?.armies.find(a => a.armyType === "training")?.elites ?? null,
    training_thieves: d.militaryIntel?.armies.find(a => a.armyType === "training")?.thieves ?? null,
    som_age: d.militaryIntel?.receivedAt ?? null,
  })) : null;
  const goodEffects = d.effects.filter((effect) => effectBucket(effect) === "good");
  const badEffects = d.effects.filter((effect) => effectBucket(effect) === "bad");
  const thiefEffects = d.effects.filter((effect) => effectBucket(effect) === "thievery");
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
              <KV label="Networth" value={d.overview.networth != null ? d.overview.networth.toLocaleString() : "—"} />
              {pop && (() => {
                const cur = pop.currentPop;
                const max = pop.maxPop;
                const pct = cur != null && max != null && max > 0 ? cur / max : null;
                const barPct = pct != null ? Math.min(100, pct * 100) : null;
                const barColor = pct == null ? "bg-gray-600"
                  : pct >= 1    ? "bg-red-500"
                  : pct >= 0.95 ? "bg-red-400"
                  : pct >= 0.80 ? "bg-yellow-400"
                  : "bg-green-500";
                const pctColor = pct == null ? "text-gray-400"
                  : pct >= 0.95 ? "text-red-300"
                  : pct >= 0.80 ? "text-yellow-300"
                  : "text-green-300";
                const needs = [...new Set([...pop.needsForMax, ...pop.needsForCurrent])];
                const tooltipLines: TooltipLine[] = [
                  { text: "Max pop = (barren×15 + homes×35 + other×25) × race × (1 + housing%)" },
                  { text: "  Requires same-tick Survey + SoS.", tone: "muted" },
                  { text: "Current pop = peasants + troops (SoT) + training (SoM) + thieves (Infiltrate)" },
                  { text: "  + wizards (direct if self, else NW residual — shown as ~)", tone: "muted" },
                  ...(needs.length > 0 ? [
                    { text: "" },
                    { text: "Missing:", tone: "bad" as const },
                    ...needs.map(n => ({ text: `• ${n}`, tone: "bad" as const })),
                  ] : []),
                ];
                const approx = pop.wizardsEstimated;
                return (
                  <div className="flex justify-between gap-4 py-0.5">
                    <span className="text-gray-500 text-sm">Population</span>
                    <span className="text-sm tabular-nums">
                      {cur != null || max != null ? (
                        <Tooltip content={tooltipLines}>
                          <span className="flex items-center gap-2">
                            <span className="text-gray-300">
                              {approx && cur != null ? "~" : ""}{cur != null ? cur.toLocaleString() : "—"}
                              {" / "}
                              {max != null ? max.toLocaleString() : "—"}
                            </span>
                            {pct != null && <span className={`text-xs ${pctColor}`}>{Math.round(pct * 100)}%</span>}
                            {barPct != null && (
                              <span className="inline-block w-16 h-1.5 bg-gray-700 rounded-full overflow-hidden">
                                <span className={`block h-full rounded-full ${barColor}`} style={{ width: `${barPct}%` }} />
                              </span>
                            )}
                          </span>
                        </Tooltip>
                      ) : (
                        <Tooltip content={tooltipLines}>
                          <span className="text-red-500 text-xs">needs: {needs[0] ?? "data"}</span>
                        </Tooltip>
                      )}
                    </span>
                  </div>
                );
              })()}
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
                  <KV label="Off" value={d.totalMilitary.offPoints != null ? d.totalMilitary.offPoints.toLocaleString() : "—"} />
                  <KV label="Def" value={d.totalMilitary.defPoints != null ? d.totalMilitary.defPoints.toLocaleString() : "—"} />
                </>
              )}
              {d.homeMilitary && (
                <>
                  <div className="flex items-center gap-2 mt-2 mb-1">
                    <span className="text-xs text-gray-600">At home ({d.homeMilitary.source})</span>
                    <Age iso={d.homeMilitary.receivedAt} />
                  </div>
                  <KV label="Off at home" value={d.homeMilitary.modOffAtHome != null ? d.homeMilitary.modOffAtHome.toLocaleString() : "—"} />
                  <KV label="Def at home" value={d.homeMilitary.modDefAtHome != null ? d.homeMilitary.modDefAtHome.toLocaleString() : "—"} />
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
                    <td className="pt-1 text-right pr-4 tabular-nums">{d.troops.soldiers != null ? d.troops.soldiers.toLocaleString() : "—"}</td>
                    <td className="pt-1 text-right pr-4 tabular-nums">{d.troops.offSpecs != null ? d.troops.offSpecs.toLocaleString() : "—"}</td>
                    <td className="pt-1 text-right pr-4 tabular-nums">{d.troops.defSpecs != null ? d.troops.defSpecs.toLocaleString() : "—"}</td>
                    <td className="pt-1 text-right pr-4 tabular-nums">{d.troops.elites != null ? d.troops.elites.toLocaleString() : "—"}</td>
                    <td className="pt-1 text-right pr-4 tabular-nums">{d.troops.warHorses != null ? d.troops.warHorses.toLocaleString() : "—"}</td>
                    <td className="pt-1 text-right tabular-nums">{d.troops.peasants != null ? d.troops.peasants.toLocaleString() : "—"}</td>
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
                    <th className="pb-1 text-right pr-4 font-medium">ETA</th>
                    <th className="pb-1 text-right font-medium">Ambush</th>
                  </tr>
                </thead>
                <tbody>
                  {d.militaryIntel.armies.map((a: ArmyRow, i: number) => (
                    <tr key={i} className="border-b border-gray-700/50 text-gray-200">
                      <td className="py-1 pr-4 text-gray-400 font-mono text-xs">{a.armyType}</td>
                      <td className="py-1 pr-4 text-right tabular-nums">{a.generals != null ? a.generals.toLocaleString() : "—"}</td>
                      <td className="py-1 pr-4 text-right tabular-nums">{a.soldiers != null ? a.soldiers.toLocaleString() : "—"}</td>
                      <td className="py-1 pr-4 text-right tabular-nums">{a.offSpecs != null ? a.offSpecs.toLocaleString() : "—"}</td>
                      <td className="py-1 pr-4 text-right tabular-nums">{a.defSpecs != null ? a.defSpecs.toLocaleString() : "—"}</td>
                      <td className="py-1 pr-4 text-right tabular-nums">{a.elites != null ? a.elites.toLocaleString() : "—"}</td>
                      <td className="py-1 pr-4 text-right tabular-nums">{a.warHorses != null ? a.warHorses.toLocaleString() : "—"}</td>
                      <td className="py-1 pr-4 text-right tabular-nums">{a.thieves != null ? a.thieves.toLocaleString() : "—"}</td>
                      <td className="py-1 pr-4 text-right tabular-nums">{a.landGained != null && a.landGained > 0 ? a.landGained.toLocaleString() : "—"}</td>
                      <td className="py-1 pr-4 text-right tabular-nums">{a.returnDays != null ? maybeRoundedValue(a.returnDays.toFixed(1) + "d", a.returnDays, { suffix: "d" }) : "—"}</td>
                      <td className="py-1 text-right tabular-nums text-yellow-300/80">{(() => { const v = a.returnDays != null && a.elites != null && a.offSpecs != null && a.soldiers != null ? computeAmbushRawOff(d.overview?.race, a as { elites: number; offSpecs: number; soldiers: number }) : null; return v != null ? Math.ceil(v).toLocaleString() : "—"; })()}</td>
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
              <KV label="Money" value={d.resources.money != null ? d.resources.money.toLocaleString() : "—"} />
              <KV label="Food" value={d.resources.food != null ? d.resources.food.toLocaleString() : "—"} />
              <KV label="Runes" value={d.resources.runes != null ? d.resources.runes.toLocaleString() : "—"} />
              <KV label="Mana" value={d.resources.mana != null ? d.resources.mana.toLocaleString() : "—"} />
              <KV label="Prisoners" value={d.resources.prisoners != null ? d.resources.prisoners.toLocaleString() : "—"} />
              <KV label="Trade balance" value={d.resources.tradeBalance != null ? `${d.resources.tradeBalance >= 0 ? "+" : ""}${d.resources.tradeBalance.toLocaleString()}` : "—"} />
              <KV label="Efficiency" value={d.resources.buildingEfficiency != null ? d.resources.buildingEfficiency + "%" : "—"} />
              <KV label="Thieves" value={d.resources.thieves != null ? d.resources.thieves.toLocaleString() : "—"} />
              <KV label="Stealth" value={d.resources.stealth != null ? d.resources.stealth + "%" : "—"} />
              <KV label="Wizards" value={d.resources.wizards != null ? d.resources.wizards.toLocaleString() : "—"} />
              {d.resources.freeSpecialistCredits != null && (
                <KV label="Spec credits" value={d.resources.freeSpecialistCredits.toLocaleString()} />
              )}
              {d.resources.freeBuildingCredits != null && (
                <KV label="Build credits" value={d.resources.freeBuildingCredits.toLocaleString()} />
              )}
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
              {d.status.overpopulated && (
                <span className="text-sm text-yellow-400">
                  Overpopulated{d.status.overpopDeserters != null ? ` · ${d.status.overpopDeserters.toLocaleString()} deserters` : ""}
                </span>
              )}
              {d.status.war          && <span className="text-sm text-orange-400">At war</span>}
              {d.status.dragonType   && <span className="text-sm text-rose-400">{d.status.dragonType} Dragon · {d.status.dragonName}</span>}
              {d.status.hitStatus    && <span className="text-sm text-gray-300">MAP: hit {d.status.hitStatus}</span>}
              {!d.status.plagued && !d.status.overpopulated && !d.status.war && !d.status.hitStatus && d.effects.length === 0 && (
                <span className="text-sm text-gray-600">No flags</span>
              )}
              </div>
              <EffectGroup label="Good Spells" tone="text-green-300" effects={goodEffects} />
              <EffectGroup label="Bad Spells" tone="text-red-300" effects={badEffects} />
              <EffectGroup label="Thief Ops" tone="text-amber-300" effects={thiefEffects} />
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
                    <td className="py-0.5 text-right pr-2 tabular-nums text-gray-400">{s.books.toLocaleString()}</td>
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
                      <td className="py-0.5 text-right pr-2 tabular-nums text-gray-400">{b.built.toLocaleString()}</td>
                      <td className="py-0.5 text-right pr-2 tabular-nums text-gray-400">{builtPct != null ? maybeRoundedValue(`${builtPct.toFixed(1)}%`, builtPct, { suffix: "%" }) : "—"}</td>
                      <td className="py-0.5 text-right tabular-nums text-gray-400">{b.inProgress > 0 ? b.inProgress.toLocaleString() : "—"}</td>
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
