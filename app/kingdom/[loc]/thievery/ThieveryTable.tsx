"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Tooltip } from "@/app/components/Tooltip";
import type { ProvinceRow } from "@/lib/db";
import type { GainsPageData } from "@/lib/gains-page";
import { formatNum } from "@/lib/ui";

const ATTACKER_COL_WIDTH = "w-52 min-w-52";
const TARGET_COL_WIDTH = "w-36 min-w-36";

type Op = "vaults" | "granaries" | "towers";

interface OpConfig {
  label: string;
  resource: (p: ProvinceRow) => number | null;
  capOow: number;
  capWar: number;
  unit: string;
}

const OPS: Record<Op, OpConfig> = {
  vaults:    { label: "Vaults",    resource: (p) => p.money, capOow: 0.052, capWar: 0.14,  unit: "gc" },
  granaries: { label: "Granaries", resource: (p) => p.food,  capOow: 0.315, capWar: 0.46,  unit: "bu" },
  towers:    { label: "Towers",    resource: (p) => p.runes, capOow: 0.245, capWar: 0.35,  unit: "ru" },
};

interface CellResult {
  value: number | null;
  rawCap: number | null;
  nwRatio: number | null;
  shieldingFactor: number;
  watchtowersFactor: number;
}

function computeCell(attacker: ProvinceRow, defender: ProvinceRow, op: Op, isWar: boolean): CellResult {
  const config = OPS[op];
  const resource = config.resource(defender);
  if (resource == null) {
    return { value: null, rawCap: null, nwRatio: null, shieldingFactor: 1, watchtowersFactor: 1 };
  }

  const capRate = isWar ? config.capWar : config.capOow;
  const rawCap = resource * capRate;

  const nwRatio =
    attacker.networth && defender.networth
      ? Math.min(attacker.networth / defender.networth, defender.networth / attacker.networth)
      : null;

  const shieldingFactor =
    defender.shielding_effect != null ? 1 - defender.shielding_effect / 100 : 1;
  const watchtowersFactor =
    defender.watch_towers_effect != null ? 1 - defender.watch_towers_effect / 100 : 1;

  const value = rawCap * (nwRatio ?? 1) * shieldingFactor * watchtowersFactor;

  return { value, rawCap, nwRatio, shieldingFactor, watchtowersFactor };
}

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
): string {
  const config = OPS[op];
  if (result.rawCap == null) return "No resource data for this target province.";

  const capRate = isWar ? config.capWar : config.capOow;
  const resource = config.resource(defender)!;

  const nwLine =
    result.nwRatio != null
      ? `NW ratio: min(${formatNum(attacker.networth)}/${formatNum(defender.networth)}, ${formatNum(defender.networth)}/${formatNum(attacker.networth)}) = ${result.nwRatio.toFixed(3)}`
      : "NW ratio: unknown (missing NW) — assumed 1.0";
  const shieldingLine =
    defender.shielding_effect != null
      ? `Shielding: 1 − ${defender.shielding_effect.toFixed(1)}% = ${result.shieldingFactor.toFixed(3)}`
      : "Shielding: no SoS data — assumed 1.0";
  const watchtowersLine =
    defender.watch_towers_effect != null
      ? `Watchtowers: 1 − ${defender.watch_towers_effect.toFixed(1)}% = ${result.watchtowersFactor.toFixed(3)}`
      : "Watchtowers: no Survey data — assumed 1.0";

  return [
    `${attacker.slot != null ? `#${attacker.slot} ` : ""}${attacker.name} → ${defender.slot != null ? `#${defender.slot} ` : ""}${defender.name}`,
    "",
    `Resource: ${formatNum(resource)} ${config.unit}`,
    `Cap (${isWar ? "war" : "non-war"}): ${formatNum(resource)} × ${(capRate * 100).toFixed(1)}% = ${formatNum(result.rawCap)}`,
    nwLine,
    shieldingLine,
    watchtowersLine,
    `Adjusted max: ${formatNum(result.value)}`,
    "",
    "Attacker race/personality/guile/cunning not factored in.",
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

  const btnBase = "px-2.5 py-1 rounded text-xs border transition-colors";
  const btnActive = "border-blue-500 text-blue-300 bg-blue-950/40";
  const btnInactive = "border-gray-700 text-gray-500 hover:border-gray-500 hover:text-gray-300";

  const selfSorted = sortBySlot(selfProvinces);
  const targetSorted = sortBySlot(targetLatest);

  const allValues = selfSorted
    .flatMap((att) => targetSorted.map((def) => computeCell(att, def, op, isWar).value))
    .filter((v): v is number => v != null);
  const maxValue = allValues.length > 0 ? Math.max(...allValues) : 0;

  const controls = (
    <div className="mb-4 flex items-center gap-1.5 flex-wrap">
      <Link href={kingdomHref} className={`${btnBase} ${btnInactive}`}>
        Province Table
      </Link>
      <Link href={`${kingdomHref}?view=gains`} className={`${btnBase} ${btnInactive}`}>
        Gains
      </Link>
      <Link href={`${kingdomHref}?view=news`} className={`${btnBase} ${btnInactive}`}>
        News
      </Link>
      <Link href={`${kingdomHref}?view=history`} className={`${btnBase} ${btnInactive}`}>
        History
      </Link>
      <span className={`${btnBase} ${btnActive}`}>Thievery</span>
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
          { text: "Rob Vaults / Rob Granaries / Rob Towers only.", tone: "strong" },
          { text: "Cell = resource × cap% × NW ratio × (1 − Shielding%) × (1 − Watchtowers%)." },
          { text: "NW ratio: min(attackerNW/defenderNW, defenderNW/attackerNW). Defaults to 1.0 if NW unknown." },
          { text: "Shielding from latest SoS. Watchtowers from latest Survey. Both default to 1.0 if unavailable." },
          { text: "War rates apply when either kingdom has declared war on the other." },
          { text: "Attacker race/personality, guile, cunning not factored in.", tone: "muted" },
          { text: "Target race/personality modifiers not documented in the guide — not included.", tone: "muted" },
        ]}
      >
        <span className={`${btnBase} ${btnInactive}`}>Assumptions</span>
      </Tooltip>
      <div className="ml-auto text-xs">
        {isWar
          ? <span className="text-amber-400">War rates active</span>
          : <span className="text-gray-500">Non-war rates</span>}
      </div>
    </div>
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
                const resource = OPS[op].resource(defender);
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
                        `${OPS[op].label}: ${formatNum(resource)} ${OPS[op].unit}`,
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
                          {formatNum(resource)} {OPS[op].unit}
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
                        <div className={tone.text}>
                          {result.value != null ? formatNum(result.value) : "—"}
                        </div>
                        {result.nwRatio != null && result.nwRatio < 0.95 && (
                          <div className="mt-0.5 text-[10px] text-amber-500">
                            NW {(result.nwRatio * 100).toFixed(0)}%
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
