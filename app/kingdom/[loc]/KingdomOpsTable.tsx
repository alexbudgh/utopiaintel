"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { KingdomViewShell } from "./KingdomTabs";
import type { KingdomOpsStats, OpProvEntry, OpTypeBreakdown } from "@/lib/db-api";

const OP_LABELS: Record<string, string> = {
  vaults:             "Rob Vaults",
  granaries:          "Rob Granaries",
  towers:             "Rob Towers",
  night_strike:       "Night Strike",
  kidnap:             "Kidnap",
  incite_riots:       "Incite Riots",
  bribe_generals:     "Bribe Generals",
  bribe_thieves:      "Bribe Thieves",
  sabotage_wizards:   "Sabotage Wizards",
  destabilize_guilds: "Destabilize Guilds",
  arson:              "Arson",
  greater_arson:      "Greater Arson",
  propaganda:         "Propaganda",
  detected:           "Detected",
};

const OP_AMOUNT_LABEL: Record<string, string> = {
  vaults:             "Gold",
  granaries:          "Food",
  towers:             "Runes",
  night_strike:       "Troops",
  kidnap:             "Peasants",
  arson:              "Acres",
  greater_arson:      "Acres",
  propaganda:         "Deserters",
  detected:           "Caught",
};

function amountLabel(op: string): string {
  return OP_AMOUNT_LABEL[op] ?? "Count";
}

function Num({ n, color }: { n: number; color?: string }) {
  if (!n) return <span className="text-gray-700">—</span>;
  return <span className={color ?? "text-gray-300"}>{n.toLocaleString()}</span>;
}

function ProvTable({
  entries,
  kingdom,
  op,
  linkable,
}: {
  entries: OpProvEntry[];
  kingdom: string;
  op: string;
  linkable: boolean;
}) {
  const amtLabel = amountLabel(op);
  const isEffect = !OP_AMOUNT_LABEL[op];
  const total = entries.reduce(
    (acc, e) => ({ attempts: acc.attempts + e.attempts, successes: acc.successes + e.successes, amount: acc.amount + e.amount }),
    { attempts: 0, successes: 0, amount: 0 },
  );

  return (
    <table className="w-full text-xs">
      <thead>
        <tr className="text-gray-600 border-b border-gray-800">
          <th className="text-left py-1 pr-2 font-normal">Province</th>
          <th className="text-right py-1 px-1 font-normal">Att.</th>
          <th className="text-right py-1 px-1 font-normal">Succ.</th>
          {!isEffect && <th className="text-right py-1 pl-1 font-normal">{amtLabel}</th>}
        </tr>
      </thead>
      <tbody>
        {entries.map((e) => (
          <tr key={e.provinceName} className="border-b border-gray-800/30">
            <td className="py-1 pr-2 whitespace-nowrap">
              {e.slot != null && (
                <span className="text-gray-600 font-mono mr-1 text-[10px]">{e.slot}</span>
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
            </td>
            <td className="text-right font-mono py-1 px-1 text-gray-500">
              <Num n={e.attempts} />
            </td>
            <td className="text-right font-mono py-1 px-1">
              <Num n={e.successes} color="text-gray-300" />
            </td>
            {!isEffect && (
              <td className="text-right font-mono py-1 pl-1">
                <Num n={e.amount} color={linkable ? "text-red-300" : "text-green-300"} />
              </td>
            )}
          </tr>
        ))}
      </tbody>
      {entries.length > 1 && (
        <tfoot>
          <tr className="border-t border-gray-700 text-gray-500">
            <td className="py-1 pr-2 text-[10px]">Total</td>
            <td className="text-right font-mono py-1 px-1"><Num n={total.attempts} /></td>
            <td className="text-right font-mono py-1 px-1"><Num n={total.successes} color="text-gray-400" /></td>
            {!isEffect && (
              <td className="text-right font-mono py-1 pl-1">
                <Num n={total.amount} color={linkable ? "text-red-400" : "text-green-400"} />
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
  const totalIn  = bd.incoming.reduce((s, e) => s + e.amount, 0);
  const isEffect = !OP_AMOUNT_LABEL[bd.op];
  const amtLbl = amountLabel(bd.op);

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
              {isEffect
                ? `${bd.outgoing.reduce((s, e) => s + e.successes, 0)} out`
                : `${totalOut.toLocaleString()} ${amtLbl.toLowerCase()} out`}
            </span>
          )}
          {bd.incoming.length > 0 && (
            <span className={bd.op === "detected" ? "text-orange-400" : "text-red-400"}>
              {isEffect
                ? `${bd.incoming.reduce((s, e) => s + e.successes, 0)} in`
                : `${totalIn.toLocaleString()} ${amtLbl.toLowerCase()} in`}
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
              <ProvTable entries={bd.outgoing} kingdom={kingdom} op={bd.op} linkable={false} />
            </div>
          )}
          {bd.incoming.length > 0 && (
            <div>
              <div className={`text-[10px] uppercase tracking-wide font-medium mb-2 ${bd.op === "detected" ? "text-orange-700" : "text-red-700"}`}>
                {bd.op === "detected" ? "Their thieves caught" : "They did to us"}
              </div>
              <ProvTable entries={bd.incoming} kingdom={kingdom} op={bd.op} linkable={true} />
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
  from,
}: {
  stats: KingdomOpsStats;
  kingdom: string;
  from?: string;
  to?: string;
}) {
  const router = useRouter();
  const kingdomHref = `/kingdom/${encodeURIComponent(kingdom)}`;

  return (
    <KingdomViewShell kingdom={kingdom} active="ops">
      {stats.effectiveFrom && (
        <p className="text-xs text-gray-500 mb-3">
          Showing from <span className="text-gray-400">{stats.effectiveFrom}</span>
          {from && (
            <>
              {" · "}
              <button
                type="button"
                onClick={() => router.push(kingdomHref + "?view=ops")}
                className="underline hover:text-gray-300"
              >
                clear filter
              </button>
            </>
          )}
        </p>
      )}

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
