"use client";

import Link from "next/link";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { KingdomTabs, btnBase, btnActive, btnInactive } from "../KingdomTabs";
import { Tooltip } from "@/app/components/Tooltip";
import type { ProvinceRow } from "@/lib/db";
import type { GainsPageData } from "@/lib/gains-page";
import { OPS, computeCell, type Op, type CellResult } from "@/lib/thievery";
import { formatExactNum, formatNum } from "@/lib/ui";

const ATTACKER_COL_WIDTH = "w-52 min-w-52";
const TARGET_COL_WIDTH = "w-36 min-w-36";

function cellTone(value: number | null, maxValue: number): { cell: string; text: string } {
  if (value == null) return { cell: "bg-gray-950/40", text: "text-gray-600" };
  if (maxValue === 0) return { cell: "bg-gray-950/40", text: "text-gray-400" };
  const pct = value / maxValue;
  if (pct > 0.7) return { cell: "bg-green-950/30", text: "text-green-200" };
  if (pct > 0.5) return { cell: "bg-lime-950/25", text: "text-lime-200" };
  if (pct > 0.3) return { cell: "bg-gray-950/40", text: "text-gray-200" };
  if (pct > 0.1) return { cell: "bg-amber-950/20", text: "text-amber-200" };
  return { cell: "bg-red-950/20", text: "text-red-300" };
}

function cellTooltip(
  attacker: ProvinceRow,
  defender: ProvinceRow,
  op: Op,
  isWar: boolean,
  result: CellResult,
): ReactNode {
  const exact = (value: number | null | undefined) => formatExactNum(value, 2);
  const whole = (value: number | null | undefined) =>
    value == null ? "—" : Math.round(value).toLocaleString();
  const nwLine =
    result.nwRatio != null
      ? `NW ratio: min(${exact(attacker.networth)}/${exact(defender.networth)}, ${exact(defender.networth)}/${exact(attacker.networth)}) = ${result.nwRatio.toFixed(3)}`
      : "NW ratio: unknown (missing NW) — assumed 1.0";
  const shieldingLine =
    defender.shielding_effect != null
      ? `Shielding: 1 − ${defender.shielding_effect.toFixed(1)}% = ${result.shieldingFactor.toFixed(3)}`
      : "Shielding: no SoS data — assumed 1.0";
  const watchtowersLine =
    defender.watch_towers_effect != null
      ? `Watchtowers: 1 − ${defender.watch_towers_effect.toFixed(1)}% = ${result.watchtowersFactor.toFixed(3)}`
      : "Watchtowers: no Survey data — assumed 1.0";

  if (result.kind === "night_strike") {
    const ns = result.nightStrike!;
    if (!ns.hasAnyTroopData) return "No troop data for this target province.";
    return (
      <div className="max-w-md space-y-2 text-xs">
        <div className="font-medium text-gray-100">
          {attacker.slot != null ? `#${attacker.slot} ` : ""}{attacker.name}
          <span className="mx-1 text-gray-500">→</span>
          {defender.slot != null ? `#${defender.slot} ` : ""}{defender.name}
        </div>

        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-gray-400">
          <div>Attacker thieves</div>
          <div className="text-right text-gray-200">{exact(ns.attackerThieves)}</div>
          <div>Displayed total</div>
          <div className="text-right text-gray-200">{whole(result.value)}</div>
          <div>Theoretical cap</div>
          <div className="text-right text-gray-200">{exact(ns.capValue)}</div>
        </div>

        <table className="w-full border-separate border-spacing-0 text-xs">
          <thead>
            <tr className="text-gray-500">
              <th className="border-b border-gray-800 pb-1 pr-3 text-left font-normal">Unit</th>
              <th className="border-b border-gray-800 pb-1 pr-3 text-right font-normal">Target</th>
              <th className="border-b border-gray-800 pb-1 pr-3 text-right font-normal">Cap</th>
              <th className="border-b border-gray-800 pb-1 text-right font-normal">Actual</th>
            </tr>
          </thead>
          <tbody>
            {ns.breakdown.map((unit) => (
              <tr key={unit.key}>
                <td className="py-1 pr-3 text-gray-200">{unit.label}</td>
                <td className="py-1 pr-3 text-right text-gray-400">{exact(unit.targetTotal)}</td>
                <td className="py-1 pr-3 text-right text-gray-300">{exact(unit.adjustedCap)}</td>
                <td className="py-1 text-right text-gray-200">{exact(unit.adjustedActual ?? unit.adjustedCap)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="space-y-1 text-gray-400">
          <div>{nwLine}</div>
          <div>{shieldingLine}</div>
          <div>{watchtowersLine}</div>
          <div>{ns.partial ? "Partial result: one or more defender troop counts are missing." : "All four Night Strike troop pools available."}</div>
          <div>{ns.attackerThieves == null ? "Actual-by-send unavailable: attacker thieves unknown, so the cell falls back to the cap total." : "Actual estimate assumes sending all currently available thieves."}</div>
          <div>{ns.usedFallback ? "Out-of-war specialist values are best-effort: missing guide values fall back to war cap/rate assumptions." : "Guide-derived values used directly for all displayed Night Strike units."}</div>
          <div>Night Strike affects total troops, including armies away from home.</div>
        </div>
      </div>
    );
  }

  if (result.rawCap == null || result.resource == null || result.capRate == null || result.unit == null) {
    return "No resource data for this target province.";
  }

  return [
    `${attacker.slot != null ? `#${attacker.slot} ` : ""}${attacker.name} → ${defender.slot != null ? `#${defender.slot} ` : ""}${defender.name}`,
    "",
    `Resource: ${formatNum(result.resource)} ${result.unit}`,
    `Cap (${isWar ? "war" : "non-war"}): ${formatNum(result.resource)} × ${(result.capRate * 100).toFixed(1)}% = ${formatNum(result.rawCap)}`,
    nwLine,
    shieldingLine,
    watchtowersLine,
    `Adjusted max: ${formatNum(result.value)}`,
    "",
    "No race/personality modifiers affect thievery gains as of age 114.",
  ].join("\n");
}

function sortBySlot(provinces: ProvinceRow[]): ProvinceRow[] {
  return [...provinces].sort((a, b) => {
    if (a.slot == null && b.slot == null) return 0;
    if (a.slot == null) return 1;
    if (b.slot == null) return -1;
    return a.slot - b.slot;
  });
}

function emptyState(message: string) {
  return (
    <div className="rounded-lg border border-gray-800 bg-gray-900/50 p-6 text-sm text-gray-400">
      {message}
    </div>
  );
}

function defenderNightStrikeTotal(defender: ProvinceRow): number | null {
  const values = [defender.soldiers, defender.off_specs, defender.def_specs, defender.elites];
  let hasValue = false;
  let total = 0;
  for (const value of values) {
    if (value == null) continue;
    hasValue = true;
    total += value;
  }
  return hasValue ? total : null;
}

function cellSubline(result: CellResult): string | null {
  if (result.kind === "night_strike") {
    const ns = result.nightStrike!;
    if (ns.partial) return "Partial";
    if (ns.actualValue == null) return "No thief data";
    if (ns.capValue != null && Math.abs(ns.actualValue - ns.capValue) < 0.01) return "Cap-limited";
    return "Thief-limited";
  }

  if (result.nwRatio != null && result.nwRatio < 0.95) {
    return `NW ${(result.nwRatio * 100).toFixed(0)}%`;
  }

  return null;
}

function displayCellValue(result: CellResult): string {
  if (result.value == null) return "—";
  if (result.kind === "night_strike") return Math.round(result.value).toLocaleString();
  return formatNum(result.value);
}

export function ThieveryTable({
  initial,
  embedded = false,
}: {
  initial: GainsPageData;
  embedded?: boolean;
}) {
  const [data, setData] = useState(initial);
  const [op, setOp] = useState<Op>("vaults");
  const [selectedRowId, setSelectedRowId] = useState<number | null>(null);
  const headerScrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const id = setInterval(async () => {
      const res = await fetch(`/api/kingdom/${encodeURIComponent(data.targetKingdom)}/thievery`);
      if (res.ok) setData(await res.json());
    }, 30_000);
    return () => clearInterval(id);
  }, [data.targetKingdom]);

  const { targetKingdom, selfKingdom, selfProvinces, targetLatest, selfSnapshot, targetSnapshot } = data;
  const isWar = !!(
    selfSnapshot?.warTarget === targetKingdom ||
    targetSnapshot?.warTarget === selfKingdom
  );
  const kingdomHref = `/kingdom/${encodeURIComponent(targetKingdom)}`;

  const selfSorted = sortBySlot(selfProvinces);
  const targetSorted = sortBySlot(targetLatest);

  const allValues = selfSorted
    .flatMap((att) => targetSorted.map((def) => computeCell(att, def, op, isWar).value))
    .filter((v): v is number => v != null);
  const maxValue = allValues.length > 0 ? Math.max(...allValues) : 0;

  const controls = (
    <KingdomTabs kingdomHref={kingdomHref} active="thievery">
      <div className="w-px h-4 bg-gray-700 mx-1" />
      {(Object.keys(OPS) as Op[]).map((o) => (
        <button
          key={o}
          onClick={() => setOp(o)}
          className={`${btnBase} ${op === o ? btnActive : btnInactive}`}
        >
          {OPS[o].label}
        </button>
      ))}
      <Tooltip
        content={[
          { text: "Resource ops show adjusted max steals. Night Strike shows adjusted troop kills.", tone: "strong" },
          { text: "Resource cells = resource × cap% × NW ratio × (1 − Shielding%) × (1 − Watchtowers%)." },
          { text: "Night Strike assumes sending all available thieves and shows actual total when thief count is known, otherwise the adjusted cap total." },
          { text: "Night Strike affects total troops, including armies away from home." },
          { text: "NW ratio: min(attackerNW/defenderNW, defenderNW/attackerNW). Defaults to 1.0 if NW unknown." },
          { text: "Shielding from latest SoS. Watchtowers from latest Survey. Both default to 1.0 if unavailable." },
          { text: "War rates apply when either kingdom has declared war on the other." },
          { text: "Out-of-war Night Strike specialist values are best-effort where the guide is incomplete.", tone: "warn" },
          { text: "Night Strike itself requires at least Unfriendly relations; the matrix is still shown for planning.", tone: "muted" },
          { text: "No race/personality modifiers affect thievery gains as of age 114.", tone: "muted" },
        ]}
      >
        <span className={`${btnBase} ${btnInactive}`}>Assumptions</span>
      </Tooltip>
      <div className="ml-auto text-xs">
        {isWar
          ? <span className="text-amber-400">War rates active</span>
          : <span className="text-gray-500">Non-war rates</span>}
      </div>
    </KingdomTabs>
  );

  const wrap = (content: React.ReactNode) =>
    embedded ? (
      <div>{controls}{content}</div>
    ) : (
      <main className="p-6">{controls}{content}</main>
    );

  if (!selfKingdom) {
    return wrap(emptyState("No bound kingdom yet. Submit a self /throne page first so the site can identify your kingdom."));
  }
  if (selfProvinces.length === 0) {
    return wrap(emptyState(`No visible provinces found for your bound kingdom ${selfKingdom}.`));
  }
  if (targetLatest.length === 0) {
    return wrap(emptyState(`No province intel available for ${targetKingdom} yet.`));
  }

  return wrap(
    <>
      <div
        ref={headerScrollRef}
        className="sticky top-0 z-40 overflow-hidden border-b border-gray-800 bg-gray-950"
      >
        <table className="border-separate border-spacing-0 text-xs">
          <thead>
            <tr>
              <th
                className={`${ATTACKER_COL_WIDTH} sticky left-0 z-30 border-r border-gray-800 bg-gray-950 px-3 py-2 text-left font-medium text-gray-300`}
              >
                {selfKingdom}
              </th>
              {targetSorted.map((defender) => {
                const resource = OPS[op].kind === "resource" ? OPS[op].resource(defender) : null;
                const nsTotal = defenderNightStrikeTotal(defender);
                return (
                  <th
                    key={defender.id}
                    className={`${TARGET_COL_WIDTH} border-r border-gray-800 bg-gray-950 px-3 py-2 text-right font-medium text-gray-300`}
                  >
                    <Tooltip
                      content={[
                        `${defender.slot != null ? `#${defender.slot} ` : ""}${defender.name}`,
                        `NW ${formatNum(defender.networth)}`,
                        `Land ${defender.land?.toLocaleString() ?? "—"}a`,
                        OPS[op].kind === "resource"
                          ? `${OPS[op].label}: ${formatNum(resource)} ${OPS[op].unit}`
                          : `Night Strike troops: ${formatNum(nsTotal)}`,
                        OPS[op].kind === "night_strike"
                          ? `Soldiers ${formatNum(defender.soldiers)} · Off ${formatNum(defender.off_specs)} · Def ${formatNum(defender.def_specs)} · Elites ${formatNum(defender.elites)}`
                          : "",
                      ].join("\n")}
                    >
                      <Link
                        href={`/kingdom/${encodeURIComponent(targetKingdom)}/${encodeURIComponent(defender.name)}`}
                        className="hover:text-blue-300 transition-colors"
                      >
                        <div>
                          {defender.slot != null && (
                            <span className="mr-1.5 text-[10px] tabular-nums text-gray-500">
                              #{defender.slot}
                            </span>
                          )}
                          {defender.name}
                        </div>
                        <div className="mt-1 text-[10px] font-normal text-gray-500">
                          {formatNum(defender.networth)} NW
                        </div>
                        <div className="mt-0.5 text-[10px] font-normal text-gray-600">
                          {OPS[op].kind === "resource"
                            ? `${formatNum(resource)} ${OPS[op].unit}`
                            : `${formatNum(nsTotal)} troops`}
                        </div>
                      </Link>
                    </Tooltip>
                  </th>
                );
              })}
            </tr>
          </thead>
        </table>
      </div>

      <div
        className="overflow-x-auto"
        onScroll={(event) => {
          if (headerScrollRef.current) {
            headerScrollRef.current.scrollLeft = event.currentTarget.scrollLeft;
          }
        }}
      >
        <table className="border-separate border-spacing-0 text-xs">
          <tbody>
            {selfSorted.map((attacker) => (
              <tr
                key={attacker.id}
                onClick={() => setSelectedRowId(attacker.id)}
                className={`cursor-pointer hover:bg-gray-900/40 ${
                  selectedRowId === attacker.id
                    ? "bg-blue-950/20 ring-1 ring-inset ring-blue-500/50"
                    : ""
                }`}
              >
                <th
                  className={`${ATTACKER_COL_WIDTH} sticky left-0 z-10 border-b border-r border-gray-800 px-3 py-2 text-left font-medium ${
                    selectedRowId === attacker.id
                      ? "bg-blue-950 text-blue-100"
                      : "bg-gray-950 text-gray-200"
                  }`}
                >
                  <Tooltip
                    content={[
                      `${attacker.slot != null ? `#${attacker.slot} ` : ""}${attacker.name}`,
                      `NW ${formatNum(attacker.networth)}`,
                      `Land ${attacker.land?.toLocaleString() ?? "—"}a`,
                    ].join("\n")}
                  >
                    <Link
                      href={`/kingdom/${encodeURIComponent(selfKingdom)}/${encodeURIComponent(attacker.name)}`}
                      className={
                        selectedRowId === attacker.id ? "text-blue-100" : "hover:text-blue-400"
                      }
                    >
                      {attacker.slot != null && (
                        <span className="mr-1.5 text-[10px] tabular-nums text-gray-500">
                          #{attacker.slot}
                        </span>
                      )}
                      {attacker.name}
                    </Link>
                    <div
                      className={`mt-1 text-[10px] font-normal ${
                        selectedRowId === attacker.id ? "text-blue-300/80" : "text-gray-500"
                      }`}
                    >
                      {formatNum(attacker.networth)} / {attacker.land?.toLocaleString() ?? "—"}a
                    </div>
                  </Tooltip>
                </th>

                {targetSorted.map((defender) => {
                  const result = computeCell(attacker, defender, op, isWar);
                  const tone = cellTone(result.value, maxValue);

                  return (
                    <td
                      key={`${attacker.id}:${defender.id}`}
                      className={`${TARGET_COL_WIDTH} border-b border-r border-gray-800 px-3 py-2 text-right tabular-nums transition-colors ${
                        selectedRowId === attacker.id
                          ? "shadow-[inset_0_1px_0_rgba(59,130,246,0.45),inset_0_-1px_0_rgba(59,130,246,0.45)]"
                          : ""
                      } ${tone.cell}`}
                    >
                      <Tooltip content={cellTooltip(attacker, defender, op, isWar, result)}>
                        <div className={tone.text}>{displayCellValue(result)}</div>
                        {cellSubline(result) && (
                          <div className={`mt-0.5 text-[10px] ${result.kind === "night_strike" ? "text-gray-500" : "text-amber-500"}`}>
                            {cellSubline(result)}
                          </div>
                        )}
                      </Tooltip>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
