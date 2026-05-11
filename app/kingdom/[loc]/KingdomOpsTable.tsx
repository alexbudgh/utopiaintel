"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { KingdomViewShell } from "./KingdomTabs";
import type { KingdomOpsStats, OpsProvinceStat, OurProvinceStat } from "@/lib/db-api";

type SortCol =
  | "name"
  | "goldOut" | "foodOut" | "runesOut" | "troopsOut" | "kidnappedOut" | "riotsOut" | "turncoatOut" | "sabwizOut"
  | "goldIn"  | "foodIn"  | "runesIn"  | "troopsIn"  | "kidnappedIn"  | "riotsIn"  | "turncoatIn"  | "sabwizIn" | "arsonIn" | "detectedIn";

type OurSortCol =
  | "name" | "goldOut" | "foodOut" | "runesOut" | "troopsOut" | "kidnappedOut" | "riotsOut" | "turncoatOut" | "sabwizOut";

function Num({ n, color }: { n: number; color: string }) {
  if (!n) return <span className="text-gray-700">—</span>;
  return <span className={color}>{n.toLocaleString()}</span>;
}

function SortTh({
  col, children, className, title, rowSpan, sortCol, sortAsc, onSort,
}: {
  col: SortCol; children?: React.ReactNode; className?: string; title?: string;
  rowSpan?: number; sortCol: SortCol; sortAsc: boolean;
  onSort: (c: SortCol) => void;
}) {
  const active = sortCol === col;
  return (
    <th
      className={`px-2 py-1 font-normal cursor-pointer select-none whitespace-nowrap ${active ? "text-gray-300" : "hover:text-gray-400"} ${className ?? ""}`}
      title={title}
      rowSpan={rowSpan}
      onClick={() => onSort(col)}
    >
      {children}{active ? (sortAsc ? " ▲" : " ▼") : ""}
    </th>
  );
}

function OurSortTh({
  col, children, className, title, sortCol, sortAsc, onSort,
}: {
  col: OurSortCol; children?: React.ReactNode; className?: string; title?: string;
  sortCol: OurSortCol; sortAsc: boolean;
  onSort: (c: OurSortCol) => void;
}) {
  const active = sortCol === col;
  return (
    <th
      className={`px-2 py-1 font-normal cursor-pointer select-none whitespace-nowrap ${active ? "text-gray-300" : "hover:text-gray-400"} ${className ?? ""}`}
      title={title}
      onClick={() => onSort(col)}
    >
      {children}{active ? (sortAsc ? " ▲" : " ▼") : ""}
    </th>
  );
}

function sortedProvs(provs: OpsProvinceStat[], col: SortCol, asc: boolean): OpsProvinceStat[] {
  return [...provs].sort((a, b) => {
    let av: number | string, bv: number | string;
    if (col === "name") { av = a.slot ?? 999; bv = b.slot ?? 999; }
    else { av = a[col]; bv = b[col]; }
    if (av === bv) return 0;
    const cmp = av < bv ? -1 : 1;
    return asc ? cmp : -cmp;
  });
}

function sortedOurProvs(provs: OurProvinceStat[], col: OurSortCol, asc: boolean): OurProvinceStat[] {
  return [...provs].sort((a, b) => {
    const av = col === "name" ? a.provinceName : a[col];
    const bv = col === "name" ? b.provinceName : b[col];
    if (av === bv) return 0;
    const cmp = av < bv ? -1 : 1;
    return asc ? cmp : -cmp;
  });
}

const OC = "text-green-300"; // outgoing color
const IC = "text-red-300";   // incoming color

export function KingdomOpsTable({
  stats,
  kingdom,
  from,
  to,
}: {
  stats: KingdomOpsStats;
  kingdom: string;
  from?: string;
  to?: string;
}) {
  const router = useRouter();
  const [sortCol, setSortCol] = useState<SortCol>("name");
  const [sortAsc, setSortAsc] = useState(true);
  const [ourSortCol, setOurSortCol] = useState<OurSortCol>("goldOut");
  const [ourSortAsc, setOurSortAsc] = useState(false);
  const kingdomHref = `/kingdom/${encodeURIComponent(kingdom)}`;

  function handleSort(col: SortCol) {
    if (sortCol === col) setSortAsc((v) => !v);
    else { setSortCol(col); setSortAsc(false); }
  }

  function handleOurSort(col: OurSortCol) {
    if (ourSortCol === col) setOurSortAsc((v) => !v);
    else { setOurSortCol(col); setOurSortAsc(false); }
  }

  const ThS = (props: Omit<Parameters<typeof SortTh>[0], "sortCol" | "sortAsc" | "onSort">) => (
    <SortTh {...props} sortCol={sortCol} sortAsc={sortAsc} onSort={handleSort} />
  );

  const OurThS = (props: Omit<Parameters<typeof OurSortTh>[0], "sortCol" | "sortAsc" | "onSort">) => (
    <OurSortTh {...props} sortCol={ourSortCol} sortAsc={ourSortAsc} onSort={handleOurSort} />
  );

  const provs = sortedProvs(stats.byProvince, sortCol, sortAsc);
  const ourProvs = sortedOurProvs(stats.byOurProvince, ourSortCol, ourSortAsc);

  const totals = stats.byProvince.reduce(
    (acc, p) => ({
      goldOut: acc.goldOut + p.goldOut, foodOut: acc.foodOut + p.foodOut, runesOut: acc.runesOut + p.runesOut,
      troopsOut: acc.troopsOut + p.troopsOut, kidnappedOut: acc.kidnappedOut + p.kidnappedOut,
      riotsOut: acc.riotsOut + p.riotsOut, turncoatOut: acc.turncoatOut + p.turncoatOut,
      sabwizOut: acc.sabwizOut + p.sabwizOut,
      goldIn: acc.goldIn + p.goldIn, foodIn: acc.foodIn + p.foodIn, runesIn: acc.runesIn + p.runesIn,
      troopsIn: acc.troopsIn + p.troopsIn, kidnappedIn: acc.kidnappedIn + p.kidnappedIn,
      riotsIn: acc.riotsIn + p.riotsIn, turncoatIn: acc.turncoatIn + p.turncoatIn,
      sabwizIn: acc.sabwizIn + p.sabwizIn, arsonIn: acc.arsonIn + p.arsonIn,
      detectedIn: acc.detectedIn + p.detectedIn,
    }),
    { goldOut: 0, foodOut: 0, runesOut: 0, troopsOut: 0, kidnappedOut: 0, riotsOut: 0, turncoatOut: 0, sabwizOut: 0,
      goldIn: 0, foodIn: 0, runesIn: 0, troopsIn: 0, kidnappedIn: 0, riotsIn: 0, turncoatIn: 0, sabwizIn: 0, arsonIn: 0, detectedIn: 0 },
  );

  return (
    <KingdomViewShell kingdom={kingdom} active="ops">
      {stats.effectiveFrom && (
        <p className="text-xs text-gray-500 mb-3">
          Showing from <span className="text-gray-400">{stats.effectiveFrom}</span>
          {from && <> · <button type="button" onClick={() => router.push(kingdomHref + "?view=ops")} className="underline hover:text-gray-300">clear filter</button></>}
        </p>
      )}

      {provs.length === 0 ? (
        <p className="text-sm text-gray-500">No ops data in this range.</p>
      ) : (
        <div className="rounded-lg border border-gray-800 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-gray-800 text-gray-500">
                  <ThS col="name" className="text-left border-r border-gray-800 px-3" rowSpan={2}>Province</ThS>
                  <th className="px-2 py-1 text-center font-normal border-l border-gray-800 text-green-600" colSpan={7}>We did to them →</th>
                  <th className="px-2 py-1 text-center font-normal border-l border-gray-800 text-red-600" colSpan={10}>They did to us ←</th>
                </tr>
                <tr className="border-b border-gray-800 text-gray-500">
                  <ThS col="goldOut"      className="text-right border-l border-gray-800" title="Gold stolen (Vaults)">Gold</ThS>
                  <ThS col="foodOut"      className="text-right" title="Food stolen (Granaries)">Food</ThS>
                  <ThS col="runesOut"     className="text-right" title="Runes stolen (Towers)">Runes</ThS>
                  <ThS col="troopsOut"    className="text-right" title="Troops assassinated (Night Strike)">Troops</ThS>
                  <ThS col="kidnappedOut" className="text-right" title="Peasants kidnapped">Kidnap</ThS>
                  <ThS col="riotsOut"     className="text-right" title="Incite riots (successes)">Riots</ThS>
                  <ThS col="turncoatOut"  className="text-right" title="Bribe generals (successes)">Bribe</ThS>
                  <ThS col="goldIn"       className="text-right border-l border-gray-800" title="Gold stolen from us">Gold</ThS>
                  <ThS col="foodIn"       className="text-right" title="Food stolen from us">Food</ThS>
                  <ThS col="runesIn"      className="text-right" title="Runes stolen from us">Runes</ThS>
                  <ThS col="troopsIn"     className="text-right" title="Troops killed by Night Strike">Troops</ThS>
                  <ThS col="kidnappedIn"  className="text-right" title="Peasants kidnapped from us">Kidnap</ThS>
                  <ThS col="riotsIn"      className="text-right" title="Incite riots against us (count)">Riots</ThS>
                  <ThS col="turncoatIn"   className="text-right" title="Bribe generals against us (count)">Bribe</ThS>
                  <ThS col="sabwizIn"     className="text-right" title="Sabotage Wizards against us (count)">Sabwiz</ThS>
                  <ThS col="arsonIn"      className="text-right" title="Arson acres burned">Arson</ThS>
                  <ThS col="detectedIn"   className="text-right" title="Their thieves caught by us (detected/foiled)">Caught</ThS>
                </tr>
              </thead>
              <tbody>
                {provs.map((p, i) => (
                  <tr key={p.provinceName} className={i % 2 === 0 ? "bg-gray-900/40" : "bg-gray-900/20"}>
                    <td className="px-3 py-1.5 whitespace-nowrap border-r border-gray-800">
                      {p.slot != null && <span className="text-gray-500 font-mono mr-1.5">{p.slot}</span>}
                      <Link href={`${kingdomHref}/${encodeURIComponent(p.provinceName)}`} className="text-gray-300 hover:text-blue-300 transition-colors">
                        {p.provinceName}
                      </Link>
                    </td>
                    <td className="px-2 py-1.5 text-right font-mono border-l border-gray-800"><Num n={p.goldOut}       color={OC} /></td>
                    <td className="px-2 py-1.5 text-right font-mono"><Num n={p.foodOut}       color={OC} /></td>
                    <td className="px-2 py-1.5 text-right font-mono"><Num n={p.runesOut}      color={OC} /></td>
                    <td className="px-2 py-1.5 text-right font-mono"><Num n={p.troopsOut}     color={OC} /></td>
                    <td className="px-2 py-1.5 text-right font-mono"><Num n={p.kidnappedOut}  color={OC} /></td>
                    <td className="px-2 py-1.5 text-right font-mono"><Num n={p.riotsOut}      color={OC} /></td>
                    <td className="px-2 py-1.5 text-right font-mono"><Num n={p.turncoatOut}   color={OC} /></td>
                    <td className="px-2 py-1.5 text-right font-mono border-l border-gray-800"><Num n={p.goldIn}       color={IC} /></td>
                    <td className="px-2 py-1.5 text-right font-mono"><Num n={p.foodIn}        color={IC} /></td>
                    <td className="px-2 py-1.5 text-right font-mono"><Num n={p.runesIn}       color={IC} /></td>
                    <td className="px-2 py-1.5 text-right font-mono"><Num n={p.troopsIn}      color={IC} /></td>
                    <td className="px-2 py-1.5 text-right font-mono"><Num n={p.kidnappedIn}   color={IC} /></td>
                    <td className="px-2 py-1.5 text-right font-mono"><Num n={p.riotsIn}       color={IC} /></td>
                    <td className="px-2 py-1.5 text-right font-mono"><Num n={p.turncoatIn}    color={IC} /></td>
                    <td className="px-2 py-1.5 text-right font-mono"><Num n={p.sabwizIn}      color={IC} /></td>
                    <td className="px-2 py-1.5 text-right font-mono"><Num n={p.arsonIn}       color={IC} /></td>
                    <td className="px-2 py-1.5 text-right font-mono"><Num n={p.detectedIn}    color="text-orange-400" /></td>
                  </tr>
                ))}
              </tbody>
              {provs.length > 1 && (
                <tfoot>
                  <tr className="border-t border-gray-700 text-gray-400 font-medium bg-gray-900/60">
                    <td className="px-3 py-1.5 text-gray-500 text-[11px] border-r border-gray-800">Total</td>
                    <td className="px-2 py-1.5 text-right font-mono border-l border-gray-800"><Num n={totals.goldOut}      color={OC} /></td>
                    <td className="px-2 py-1.5 text-right font-mono"><Num n={totals.foodOut}      color={OC} /></td>
                    <td className="px-2 py-1.5 text-right font-mono"><Num n={totals.runesOut}     color={OC} /></td>
                    <td className="px-2 py-1.5 text-right font-mono"><Num n={totals.troopsOut}    color={OC} /></td>
                    <td className="px-2 py-1.5 text-right font-mono"><Num n={totals.kidnappedOut} color={OC} /></td>
                    <td className="px-2 py-1.5 text-right font-mono"><Num n={totals.riotsOut}     color={OC} /></td>
                    <td className="px-2 py-1.5 text-right font-mono"><Num n={totals.turncoatOut}  color={OC} /></td>
                    <td className="px-2 py-1.5 text-right font-mono border-l border-gray-800"><Num n={totals.goldIn}      color={IC} /></td>
                    <td className="px-2 py-1.5 text-right font-mono"><Num n={totals.foodIn}       color={IC} /></td>
                    <td className="px-2 py-1.5 text-right font-mono"><Num n={totals.runesIn}      color={IC} /></td>
                    <td className="px-2 py-1.5 text-right font-mono"><Num n={totals.troopsIn}     color={IC} /></td>
                    <td className="px-2 py-1.5 text-right font-mono"><Num n={totals.kidnappedIn}  color={IC} /></td>
                    <td className="px-2 py-1.5 text-right font-mono"><Num n={totals.riotsIn}      color={IC} /></td>
                    <td className="px-2 py-1.5 text-right font-mono"><Num n={totals.turncoatIn}   color={IC} /></td>
                    <td className="px-2 py-1.5 text-right font-mono"><Num n={totals.sabwizIn}     color={IC} /></td>
                    <td className="px-2 py-1.5 text-right font-mono"><Num n={totals.arsonIn}      color={IC} /></td>
                    <td className="px-2 py-1.5 text-right font-mono"><Num n={totals.detectedIn}   color="text-orange-400" /></td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      )}

      {ourProvs.length > 0 && (
        <div className="mt-6">
          <h3 className="text-xs text-gray-500 font-medium mb-2 uppercase tracking-wide">Our activity against {kingdom}</h3>
          <div className="rounded-lg border border-gray-800 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-gray-800 text-gray-500">
                    <OurThS col="name"         className="text-left border-r border-gray-800 px-3">Our Province</OurThS>
                    <OurThS col="goldOut"      className="text-right border-l border-gray-800" title="Gold stolen (Vaults)">Gold</OurThS>
                    <OurThS col="foodOut"      className="text-right" title="Food stolen (Granaries)">Food</OurThS>
                    <OurThS col="runesOut"     className="text-right" title="Runes stolen (Towers)">Runes</OurThS>
                    <OurThS col="troopsOut"    className="text-right" title="Troops assassinated (Night Strike)">Troops</OurThS>
                    <OurThS col="kidnappedOut" className="text-right" title="Peasants kidnapped">Kidnap</OurThS>
                    <OurThS col="riotsOut"     className="text-right" title="Incite riots (successes)">Riots</OurThS>
                    <OurThS col="turncoatOut"  className="text-right" title="Bribe generals (successes)">Bribe</OurThS>
                    <OurThS col="sabwizOut"    className="text-right" title="Sabotage wizards (successes)">Sabwiz</OurThS>
                  </tr>
                </thead>
                <tbody>
                  {ourProvs.map((p, i) => (
                    <tr key={p.provinceName} className={i % 2 === 0 ? "bg-gray-900/40" : "bg-gray-900/20"}>
                      <td className="px-3 py-1.5 whitespace-nowrap border-r border-gray-800 text-gray-300">{p.provinceName}</td>
                      <td className="px-2 py-1.5 text-right font-mono border-l border-gray-800"><Num n={p.goldOut}      color={OC} /></td>
                      <td className="px-2 py-1.5 text-right font-mono"><Num n={p.foodOut}      color={OC} /></td>
                      <td className="px-2 py-1.5 text-right font-mono"><Num n={p.runesOut}     color={OC} /></td>
                      <td className="px-2 py-1.5 text-right font-mono"><Num n={p.troopsOut}    color={OC} /></td>
                      <td className="px-2 py-1.5 text-right font-mono"><Num n={p.kidnappedOut} color={OC} /></td>
                      <td className="px-2 py-1.5 text-right font-mono"><Num n={p.riotsOut}     color={OC} /></td>
                      <td className="px-2 py-1.5 text-right font-mono"><Num n={p.turncoatOut}  color={OC} /></td>
                      <td className="px-2 py-1.5 text-right font-mono"><Num n={p.sabwizOut}    color={OC} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </KingdomViewShell>
  );
}
