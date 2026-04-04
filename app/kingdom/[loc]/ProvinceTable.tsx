"use client";

import { useState, useEffect, useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import type { ProvinceRow } from "@/lib/db";
import { freshnessColor, formatNum, timeAgo, formatTimestamp, sameTick } from "@/lib/ui";

function Tooltip({ content, children }: { content: string; children: React.ReactNode }) {
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  const tipRef = useRef<HTMLDivElement>(null);

  // Shift tooltip left before paint if it would overflow the right edge
  useLayoutEffect(() => {
    if (!tipRef.current || !anchor) return;
    const rect = tipRef.current.getBoundingClientRect();
    const overshoot = rect.right - (window.innerWidth - 8);
    if (overshoot > 0) {
      tipRef.current.style.left = (anchor.left + anchor.width / 2 - overshoot) + "px";
    }
  }, [anchor]);

  if (!content) return <>{children}</>;
  const lines = content.split("\n");
  return (
    <span
      className="inline-block"
      onMouseEnter={(e) => setAnchor(e.currentTarget.getBoundingClientRect())}
      onMouseLeave={() => setAnchor(null)}
    >
      {children}
      {anchor && createPortal(
        <div
          ref={tipRef}
          className="fixed z-50 pointer-events-none flex flex-col gap-0.5 w-max max-w-xs rounded bg-gray-900 border border-gray-700 px-2 py-1.5 text-xs shadow-lg"
          style={{ left: anchor.left + anchor.width / 2, top: anchor.top - 8, transform: "translate(-50%, -100%)" }}
        >
          {lines.map((line, i) => (
            <span key={i} className={i === 0 ? "text-gray-100 font-medium" : "text-gray-400"}>{line}</span>
          ))}
        </div>,
        document.body
      )}
    </span>
  );
}

const COLUMNS = [
  { key: "race",        label: "Race",        group: "Overview",  desc: "Race"                                        },
  { key: "personality", label: "Personality", group: "Overview",  desc: "Personality"                                 },
  { key: "land",        label: "Land",        group: "Overview",  desc: "Acres of land"                               },
  { key: "networth",    label: "NW",          group: "Overview",  desc: "Networth"                                    },
  { key: "off_points",  label: "Off",         group: "Military",  desc: "Total modified offense (province-wide, SoT)" },
  { key: "def_points",  label: "Def",         group: "Military",  desc: "Total modified defense (province-wide, SoT)" },
  { key: "soldiers",    label: "Soldiers",    group: "Troops",    desc: "Soldiers at home"                            },
  { key: "off_specs",   label: "Off specs",   group: "Troops",    desc: "Offensive specialists at home"               },
  { key: "def_specs",   label: "Def specs",   group: "Troops",    desc: "Defensive specialists at home"               },
  { key: "elites",      label: "Elites",      group: "Troops",    desc: "Elites at home"                              },
  { key: "peasants",    label: "Peasants",    group: "Troops",    desc: "Peasants"                                    },
  { key: "ome",         label: "OME",         group: "Military",  desc: "Offensive military effectiveness % (SoM)"    },
  { key: "dme",         label: "DME",         group: "Military",  desc: "Defensive military effectiveness % (SoM)"    },
  { key: "thieves",     label: "Thieves",     group: "Resources", desc: "Thieves"                                     },
  { key: "wizards",     label: "Wizards",     group: "Resources", desc: "Wizards"                                     },
  { key: "age",         label: "Age",         group: "Overview",  desc: "Most recent intel across all sources\nOther columns may have older data — hover them to check"    },
  { key: "rtpa",        label: "rTPA",        group: "TPA",       desc: "Raw TPA = thieves / land\nNeeds: Infiltrate Thieves' Dens + SoT (same tick)"                   },
  { key: "mtpa",        label: "mTPA",        group: "TPA",       desc: "Modified TPA = rTPA × (1 + Crime%)\nNeeds: rTPA sources + SoS (same tick)"                     },
  { key: "otpa",        label: "oTPA",        group: "TPA",       desc: "Offensive TPA = mTPA × (1 + Thieves' Den%)\nNeeds: mTPA sources + Survey (same tick)"          },
  { key: "dtpa",        label: "dTPA",        group: "TPA",       desc: "Defensive TPA = mTPA × (1 + Watch Tower prevent%)\nNeeds: mTPA sources + Survey (same tick)"   },
] as const;

type ColKey = (typeof COLUMNS)[number]["key"];

const DEFAULT_VISIBLE = new Set<ColKey>([
  "race", "land", "networth", "off_points", "def_points", "age",
]);

const STORAGE_KEY = "province-columns";

function computeRtpa(p: ProvinceRow): number | null {
  if (p.thieves == null || !p.land) return null;
  if (!sameTick(p.resources_age, p.overview_age)) return null;
  return p.thieves / p.land;
}

function computeMtpa(p: ProvinceRow): number | null {
  const rtpa = computeRtpa(p);
  if (rtpa == null || p.crime_effect == null) return null;
  if (!sameTick(p.resources_age, p.overview_age, p.sciences_age)) return null;
  return rtpa * (1 + p.crime_effect / 100);
}

function computeOtpa(p: ProvinceRow): number | null {
  const mtpa = computeMtpa(p);
  if (mtpa == null || p.thieves_dens_effect == null) return null;
  if (!sameTick(p.resources_age, p.overview_age, p.sciences_age, p.survey_age)) return null;
  return mtpa * (1 + p.thieves_dens_effect / 100);
}

function computeDtpa(p: ProvinceRow): number | null {
  const mtpa = computeMtpa(p);
  if (mtpa == null || p.watch_towers_effect == null) return null;
  if (!sameTick(p.resources_age, p.overview_age, p.sciences_age, p.survey_age)) return null;
  return mtpa * (1 + p.watch_towers_effect / 100);
}

function ageFor(p: ProvinceRow, key: ColKey): string | null {
  if (key === "age") return p.overview_age ?? p.military_age;
  if (["soldiers", "off_specs", "def_specs", "elites", "peasants"].includes(key)) return p.troops_age;
  if (["thieves", "wizards"].includes(key)) return p.resources_age;
  if (["ome", "dme"].includes(key)) return p.som_age;
  if (["off_points", "def_points"].includes(key)) return p.military_age;
  if (key === "rtpa") return p.resources_age ?? p.overview_age;
  if (key === "mtpa") return p.sciences_age;
  if (key === "otpa" || key === "dtpa") return p.survey_age;
  return p.overview_age;
}

function sourceFor(p: ProvinceRow, key: ColKey): string | null {
  if (["soldiers", "off_specs", "def_specs", "elites", "peasants"].includes(key)) return p.troops_source;
  if (["thieves", "wizards"].includes(key)) return p.resources_source;
  if (["ome", "dme"].includes(key)) return "som";
  if (["off_points", "def_points"].includes(key)) return "sot";
  if (key === "age") return p.overview_source ?? (p.military_age ? "sot" : null);
  if (["rtpa", "mtpa", "otpa", "dtpa"].includes(key)) return null;
  return p.overview_source;
}

function tpaStaleReason(p: ProvinceRow, needSoS: boolean, needSurvey: boolean): string {
  const ages = [p.resources_age, p.overview_age];
  if (needSoS) ages.push(p.sciences_age);
  if (needSurvey) ages.push(p.survey_age);
  if (ages.some((a) => !a)) return "missing data";
  return "data not from same tick";
}

function tipFor(p: ProvinceRow, key: ColKey): string {
  // Special case: age column shows both overview and military ages
  if (key === "age") {
    const lines = [];
    if (p.overview_age) lines.push(`overview (${p.overview_source ?? "?"}): ${timeAgo(p.overview_age)} · ${formatTimestamp(p.overview_age)}`);
    if (p.military_age) lines.push(`military (sot): ${timeAgo(p.military_age)} · ${formatTimestamp(p.military_age)}`);
    return lines.join("\n");
  }
  if (key === "rtpa") {
    if (p.thieves == null || !p.land) return "No thieves or land data";
    const ok = sameTick(p.resources_age, p.overview_age);
    const val = ok ? (p.thieves / p.land).toFixed(2) : "—";
    return `rTPA = ${formatNum(p.thieves)} ÷ ${formatNum(p.land)} = ${val}` + (ok ? "" : `\n(${tpaStaleReason(p, false, false)})`);
  }
  if (key === "mtpa") {
    const rtpa = computeRtpa(p);
    if (rtpa == null) return tipFor(p, "rtpa");
    if (p.crime_effect == null) return `rTPA = ${rtpa.toFixed(2)}\nNo Crime science data`;
    const ok = sameTick(p.resources_age, p.overview_age, p.sciences_age);
    const val = ok ? (rtpa * (1 + p.crime_effect / 100)).toFixed(2) : "—";
    return `mTPA = ${rtpa.toFixed(2)} × (1 + ${p.crime_effect.toFixed(1)}% Crime) = ${val}` + (ok ? "" : `\n(${tpaStaleReason(p, true, false)})`);
  }
  if (key === "otpa") {
    const mtpa = computeMtpa(p);
    if (mtpa == null) return tipFor(p, "mtpa");
    if (p.thieves_dens_effect == null) return `mTPA = ${mtpa.toFixed(2)}\nNo Survey data`;
    const ok = sameTick(p.resources_age, p.overview_age, p.sciences_age, p.survey_age);
    const val = ok ? computeOtpa(p)?.toFixed(2) ?? "—" : "—";
    return `oTPA = ${mtpa.toFixed(2)} × (1 + ${p.thieves_dens_effect.toFixed(1)}% Thieves' Den) = ${val}` + (ok ? "" : `\n(${tpaStaleReason(p, true, true)})`);
  }
  if (key === "dtpa") {
    const mtpa = computeMtpa(p);
    if (mtpa == null) return tipFor(p, "mtpa");
    if (p.watch_towers_effect == null) return `mTPA = ${mtpa.toFixed(2)}\nNo Survey data`;
    const ok = sameTick(p.resources_age, p.overview_age, p.sciences_age, p.survey_age);
    const val = ok ? computeDtpa(p)?.toFixed(2) ?? "—" : "—";
    return `dTPA = ${mtpa.toFixed(2)} × (1 + ${p.watch_towers_effect.toFixed(1)}% Watch Tower) = ${val}` + (ok ? "" : `\n(${tpaStaleReason(p, true, true)})`);
  }
  const age = ageFor(p, key);
  const source = sourceFor(p, key);
  if (!age) return "";
  return [source, timeAgo(age), formatTimestamp(age)].filter(Boolean).join(" · ");
}

function cellValue(p: ProvinceRow, key: ColKey): React.ReactNode {
  switch (key) {
    case "race":        return <span className="font-mono text-gray-400">{p.race ?? "—"}</span>;
    case "personality": return <span className="text-gray-400">{p.personality ?? "—"}</span>;
    case "land":        return formatNum(p.land);
    case "networth":    return formatNum(p.networth);
    case "off_points":  return formatNum(p.off_points);
    case "def_points":  return formatNum(p.def_points);
    case "soldiers":    return formatNum(p.soldiers);
    case "off_specs":   return formatNum(p.off_specs);
    case "def_specs":   return formatNum(p.def_specs);
    case "elites":      return formatNum(p.elites);
    case "peasants":    return formatNum(p.peasants);
    case "ome":         return p.ome != null ? p.ome.toFixed(1) + "%" : "—";
    case "dme":         return p.dme != null ? p.dme.toFixed(1) + "%" : "—";
    case "thieves":     return formatNum(p.thieves);
    case "wizards":     return formatNum(p.wizards);
    case "age": {
      const a = p.overview_age ?? p.military_age;
      return <span className={freshnessColor(a)}>{timeAgo(a)}</span>;
    }
    case "rtpa": { const v = computeRtpa(p); return v != null ? v.toFixed(2) : "—"; }
    case "mtpa": { const v = computeMtpa(p); return v != null ? v.toFixed(2) : "—"; }
    case "otpa": { const v = computeOtpa(p); return v != null ? v.toFixed(2) : "—"; }
    case "dtpa": { const v = computeDtpa(p); return v != null ? v.toFixed(2) : "—"; }
  }
}

const TEXT_LEFT = new Set<ColKey>(["race", "personality"]);

export function ProvinceTable({
  kingdom,
  initial,
}: {
  kingdom: string;
  initial: ProvinceRow[];
}) {
  const [provinces, setProvinces] = useState(initial);
  const [visible, setVisible] = useState<Set<ColKey>>(DEFAULT_VISIBLE);

  // Load column prefs from localStorage after mount (SSR-safe)
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) setVisible(new Set(JSON.parse(saved) as ColKey[]));
    } catch {}
  }, []);

  // Persist column prefs
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...visible]));
  }, [visible]);

  // Poll every 30s
  useEffect(() => {
    const id = setInterval(async () => {
      const res = await fetch(`/api/kingdom/${encodeURIComponent(kingdom)}`);
      if (res.ok) setProvinces(await res.json());
    }, 30_000);
    return () => clearInterval(id);
  }, [kingdom]);

  const toggle = (key: ColKey) =>
    setVisible((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });

  const visibleCols = COLUMNS.filter((c) => visible.has(c.key));

  return (
    <div>
      <div className="flex flex-wrap gap-1.5 mb-4">
        {COLUMNS.map((col) => (
          <button
            key={col.key}
            onClick={() => toggle(col.key)}
            className={`px-2 py-0.5 rounded text-xs border transition-colors ${
              visible.has(col.key)
                ? "border-gray-500 text-gray-200"
                : "border-gray-700 text-gray-600"
            }`}
          >
            {col.label}
          </button>
        ))}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-gray-400 border-b border-gray-700">
              <th className="py-2 pr-4 font-medium">Province</th>
              {visibleCols.map((col) => (
                <th
                  key={col.key}
                  className={`py-2 pr-4 font-medium ${TEXT_LEFT.has(col.key) ? "" : "text-right"}`}
                >
                  <Tooltip content={col.desc}>{col.label}</Tooltip>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {provinces.map((p) => {
              const dotAge = p.overview_age ?? p.military_age;
              return (
                <tr key={p.id} className="border-b border-gray-800 hover:bg-gray-800/40">
                  <td className="py-2 pr-4">
                    <Tooltip content={tipFor(p, "age")}>
                      <span className={`mr-1.5 ${freshnessColor(dotAge)}`}>●</span>
                    </Tooltip>
                    <Link
                      href={`/kingdom/${kingdom}/${encodeURIComponent(p.name)}`}
                      className="hover:text-blue-400 transition-colors"
                    >
                      {p.name}
                    </Link>
                  </td>
                  {visibleCols.map((col) => {
                    const age = ageFor(p, col.key);
                    const fc = col.key === "age" ? "" : freshnessColor(age);
                    return (
                      <td
                        key={col.key}
                        className={`py-2 pr-4 tabular-nums ${TEXT_LEFT.has(col.key) ? "" : "text-right"} ${fc}`}
                      >
                        <Tooltip content={tipFor(p, col.key)}>{cellValue(p, col.key)}</Tooltip>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
