"use client";

import Link from "next/link";
import { useState } from "react";
import { KingdomViewShell } from "./KingdomTabs";
import { UtopiaDateRangeFilter } from "./UtopiaDateRangeFilter";
import type {
  KingdomOpsStats,
  OpProvEntry,
  OpTypeBreakdown,
} from "@/lib/db-api";

const OP_LABELS: Record<string, string> = {
  vaults: "Rob Vaults",
  granaries: "Rob Granaries",
  towers: "Rob Towers",
  night_strike: "Night Strike",
  kidnap: "Kidnap",
  incite_riots: "Incite Riots",
  bribe_generals: "Bribe Generals",
  bribe_thieves: "Bribe Thieves",
  sabotage_wizards: "Sabotage Wizards",
  destabilize_guilds: "Destabilize Guilds",
  arson: "Arson",
  greater_arson: "Greater Arson",
  propaganda: "Propaganda",
  assassinate_wizards: "Assassinate Wizards",
  free_prisoners: "Free Prisoners",
  detected: "Detected",
};

const OP_AMOUNT_LABEL: Record<string, string> = {
  vaults: "Gold",
  granaries: "Food",
  towers: "Runes",
  night_strike: "Troops",
  kidnap: "Peasants",
  arson: "Acres",
  greater_arson: "Buildings",
  propaganda: "Stolen",
  assassinate_wizards: "Wizards",
  free_prisoners: "Prisoners",
  detected: "Caught",
};

function formatBuildingLabel(b: string): string {
  return b.charAt(0) + b.slice(1).toLowerCase();
}

function amountLabel(op: string, arsonBuilding?: string | null): string {
  if (op === "greater_arson" && arsonBuilding)
    return formatBuildingLabel(arsonBuilding);
  return OP_AMOUNT_LABEL[op] ?? "Count";
}

function plural(value: number, singular: string, pluralForm = `${singular}s`) {
  return value === 1 ? singular : pluralForm;
}

function opSummary(
  op: string,
  value: number,
  successes: number,
  actor: string,
) {
  const n = value.toLocaleString();
  switch (op) {
    case "vaults":
      return `${n} gc stolen ${actor}`;
    case "granaries":
      return `${n} bushels stolen ${actor}`;
    case "towers":
      return `${n} runes stolen ${actor}`;
    case "night_strike":
      return `${n} ${plural(value, "troop")} killed ${actor}`;
    case "kidnap":
      return `${n} ${plural(value, "peasant")} kidnapped ${actor}`;
    case "arson":
      return `${n} ${plural(value, "acre")} burned ${actor}`;
    case "greater_arson":
      return `${n} ${plural(value, "building")} burned ${actor}`;
    case "propaganda":
      return `${n} ${plural(value, "unit")} converted ${actor}`;
    case "assassinate_wizards":
      return `${n} ${plural(value, "wizard")} killed ${actor}`;
    case "free_prisoners":
      return `${n} ${plural(value, "prisoner")} captured ${actor}`;
    case "detected":
      return `${n} caught ${actor}`;
    default: {
      const successCount = successes.toLocaleString();
      return `${successCount} ${plural(successes, "success", "successes")} ${actor}`;
    }
  }
}

function Num({ n, color }: { n: number; color?: string }) {
  if (!n) return <span className="text-gray-700">—</span>;
  return <span className={color ?? "text-gray-300"}>{n.toLocaleString()}</span>;
}

function ProvName({
  e,
  kingdom,
  linkable,
}: {
  e: OpProvEntry;
  kingdom: string;
  linkable: boolean;
}) {
  return (
    <>
      {e.slot != null && (
        <span className="text-gray-600 font-mono mr-1 text-[10px]">
          {e.slot}
        </span>
      )}
      {linkable ? (
        <Link
          href={`/kingdom/${encodeURIComponent(kingdom)}/${encodeURIComponent(e.provinceName)}`}
          className="text-gray-300 hover:text-blue-300 transition-colors"
        >
          {e.provinceName}
        </Link>
      ) : (
        <span className="text-gray-300">{e.provinceName}</span>
      )}
    </>
  );
}

function ProvTable({
  entries,
  kingdom,
  op,
  linkable,
  showUnitType,
}: {
  entries: OpProvEntry[];
  kingdom: string;
  op: string;
  linkable: boolean;
  showUnitType?: boolean;
}) {
  const arsonBuildings = new Set(
    entries.map((e) => e.arsonBuilding).filter(Boolean),
  );
  const arsonBuilding =
    arsonBuildings.size === 1 ? [...arsonBuildings][0]! : null;
  const showBuilding =
    op === "greater_arson" && arsonBuilding === null && arsonBuildings.size > 1;
  const amtLabel = amountLabel(op, arsonBuilding);
  const isEffect = !OP_AMOUNT_LABEL[op];
  const amtColor = linkable ? "text-red-300" : "text-green-300";
  const amtColorTotal = linkable ? "text-red-400" : "text-green-400";
  const totalThievesLost = entries.reduce((s, e) => s + e.thievesLost, 0);
  const showLost = totalThievesLost > 0;

  if (showUnitType) {
    // Propaganda layout: Province | Unit | Stolen, plus failures footer.
    const successRows = entries.filter((e) => e.unitType !== null);
    const totalStolen = successRows.reduce((s, e) => s + e.amount, 0);
    const totalFailures = entries.reduce(
      (s, e) => s + Math.max(0, e.attempts - e.successes),
      0,
    );
    const totalThievesLost = entries.reduce((s, e) => s + e.thievesLost, 0);
    const thievesWord = totalThievesLost === 1 ? "thief" : "thieves";

    return (
      <table className="w-full text-xs">
        <thead>
          <tr className="text-gray-600 border-b border-gray-800">
            <th className="text-left py-1 pr-2 font-normal">Province</th>
            <th className="text-left py-1 px-1 font-normal">Unit</th>
            <th className="text-right py-1 px-1 font-normal">Attempts</th>
            <th className="text-right py-1 pl-1 font-normal">{amtLabel}</th>
          </tr>
        </thead>
        <tbody>
          {successRows.map((e) => (
            <tr
              key={`${e.provinceName}|${e.unitType}`}
              className="border-b border-gray-800/30"
            >
              <td className="py-1 pr-2 whitespace-nowrap">
                <ProvName e={e} kingdom={kingdom} linkable={linkable} />
              </td>
              <td className="py-1 px-1 whitespace-nowrap text-yellow-600">
                {e.unitType}
              </td>
              <td className="text-right font-mono py-1 px-1 text-gray-500">
                <Num n={e.successes} />
              </td>
              <td className="text-right font-mono py-1 pl-1">
                <Num n={e.amount} color={amtColor} />
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          {successRows.length > 1 && (
            <tr className="border-t border-gray-700 text-gray-300 font-medium bg-gray-800/50">
              <td className="py-1 pr-2">Total</td>
              <td />
              <td className="text-right font-mono py-1 px-1">
                <Num n={successRows.reduce((s, e) => s + e.successes, 0)} />
              </td>
              <td className="text-right font-mono py-1 pl-1">
                <Num n={totalStolen} color={amtColorTotal} />
              </td>
            </tr>
          )}
          {totalFailures > 0 && (
            <tr className="border-t border-gray-800/40 text-red-400">
              <td className="py-1 pr-2">—</td>
              <td className="py-1 px-1">failed</td>
              <td className="text-right font-mono py-1 px-1">
                {totalFailures}
              </td>
              <td className="py-1 pl-1">
                {totalThievesLost > 0
                  ? `${totalThievesLost} ${thievesWord} lost`
                  : ""}
              </td>
            </tr>
          )}
        </tfoot>
      </table>
    );
  }

  const total = entries.reduce(
    (acc, e) => ({
      attempts: acc.attempts + e.attempts,
      successes: acc.successes + e.successes,
      amount: acc.amount + e.amount,
    }),
    { attempts: 0, successes: 0, amount: 0 },
  );

  return (
    <table className="w-full text-xs">
      <thead>
        <tr className="text-gray-600 border-b border-gray-800">
          <th className="text-left py-1 pr-2 font-normal">Province</th>
          {showBuilding && (
            <th className="text-left py-1 px-1 font-normal">Building</th>
          )}
          <th className="text-right py-1 px-1 font-normal">Attempts</th>
          <th className="text-right py-1 px-1 font-normal">Successes</th>
          {!isEffect && (
            <th className="text-right py-1 px-1 font-normal">{amtLabel}</th>
          )}
          {showLost && (
            <th className="text-right py-1 pl-1 font-normal text-red-700/70">
              Lost
            </th>
          )}
        </tr>
      </thead>
      <tbody>
        {entries.map((e) => (
          <tr
            key={`${e.provinceName}|${e.unitType ?? ""}|${e.arsonBuilding ?? ""}`}
            className="border-b border-gray-800/30"
          >
            <td className="py-1 pr-2 whitespace-nowrap">
              <ProvName e={e} kingdom={kingdom} linkable={linkable} />
            </td>
            {showBuilding && (
              <td className="py-1 px-1 whitespace-nowrap text-yellow-600">
                {e.arsonBuilding ? formatBuildingLabel(e.arsonBuilding) : "—"}
              </td>
            )}
            <td className="text-right font-mono py-1 px-1 text-gray-500">
              <Num n={e.attempts} />
            </td>
            <td className="text-right font-mono py-1 px-1">
              <Num n={e.successes} color="text-gray-300" />
            </td>
            {!isEffect && (
              <td className="text-right font-mono py-1 px-1">
                <Num n={e.amount} color={amtColor} />
              </td>
            )}
            {showLost && (
              <td className="text-right font-mono py-1 pl-1">
                <Num n={e.thievesLost} color="text-red-400/70" />
              </td>
            )}
          </tr>
        ))}
      </tbody>
      {entries.length > 1 && (
        <tfoot>
          <tr className="border-t border-gray-700 text-gray-300 font-medium bg-gray-800/50">
            <td className="py-1 pr-2">Total</td>
            {showBuilding && <td />}
            <td className="text-right font-mono py-1 px-1">
              <Num n={total.attempts} />
            </td>
            <td className="text-right font-mono py-1 px-1">
              <Num n={total.successes} color="text-gray-400" />
            </td>
            {!isEffect && (
              <td className="text-right font-mono py-1 px-1">
                <Num n={total.amount} color={amtColorTotal} />
              </td>
            )}
            {showLost && (
              <td className="text-right font-mono py-1 pl-1">
                <Num n={totalThievesLost} color="text-red-400" />
              </td>
            )}
          </tr>
        </tfoot>
      )}
    </table>
  );
}

function OpSection({ bd, kingdom }: { bd: OpTypeBreakdown; kingdom: string }) {
  const [open, setOpen] = useState(false);
  const label = OP_LABELS[bd.op] ?? bd.op;
  const totalOut = bd.outgoing.reduce((s, e) => s + e.amount, 0);
  const totalIn = bd.incoming.reduce((s, e) => s + e.amount, 0);
  const successesOut = bd.outgoing.reduce((s, e) => s + e.successes, 0);
  const successesIn = bd.incoming.reduce((s, e) => s + e.successes, 0);

  return (
    <div className="border border-gray-800 rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-2.5 bg-gray-900/50 hover:bg-gray-800/50 transition-colors text-left cursor-pointer"
      >
        <span className="text-sm text-gray-300">{label}</span>
        <span className="flex items-center gap-3 text-xs">
          {bd.outgoing.length > 0 && (
            <span className="text-green-500">
              {opSummary(bd.op, totalOut, successesOut, "by us")}
            </span>
          )}
          {bd.incoming.length > 0 && (
            <span
              className={
                bd.op === "detected" ? "text-orange-400" : "text-red-400"
              }
            >
              {opSummary(bd.op, totalIn, successesIn, "by them")}
            </span>
          )}
          <span className="text-gray-600">{open ? "▲" : "▼"}</span>
        </span>
      </button>
      {open && (
        <div className="px-4 py-3 border-t border-gray-800 grid grid-cols-1 md:grid-cols-2 gap-6">
          {bd.outgoing.length > 0 && (
            <div>
              <div className="text-[10px] uppercase tracking-wide text-green-700 font-medium mb-2">
                We did to them
              </div>
              <ProvTable
                entries={bd.outgoing}
                kingdom={kingdom}
                op={bd.op}
                linkable={false}
                showUnitType={bd.op === "propaganda"}
              />
            </div>
          )}
          {bd.incoming.length > 0 && (
            <div>
              <div
                className={`text-[10px] uppercase tracking-wide font-medium mb-2 ${bd.op === "detected" ? "text-orange-700" : "text-red-700"}`}
              >
                {bd.op === "detected"
                  ? "Their thieves caught"
                  : "They did to us"}
              </div>
              <ProvTable
                entries={bd.incoming}
                kingdom={kingdom}
                op={bd.op}
                linkable={true}
                showUnitType={bd.op === "propaganda"}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function KingdomOpsTable({
  stats,
  kingdom,
  boundKingdom,
  from,
  to,
  timeMode,
  latestWarDate,
}: {
  stats: KingdomOpsStats;
  kingdom: string;
  boundKingdom?: string | null;
  from?: string;
  to?: string;
  timeMode?: "real" | "utopia";
  latestWarDate?: string;
}) {
  return (
    <KingdomViewShell
      kingdom={kingdom}
      boundKingdom={boundKingdom}
      active="ops"
    >
      <UtopiaDateRangeFilter
        kingdom={kingdom}
        view="ops"
        from={from}
        to={to}
        timeMode={timeMode}
        allowTimeMode
        effectiveFrom={stats.effectiveFrom ?? undefined}
        latestWarDate={latestWarDate}
      />

      {stats.breakdowns.length === 0 ? (
        <p className="text-sm text-gray-500">No ops data in this range.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {stats.breakdowns.map((bd) => (
            <OpSection key={bd.op} bd={bd} kingdom={kingdom} />
          ))}
        </div>
      )}
    </KingdomViewShell>
  );
}
