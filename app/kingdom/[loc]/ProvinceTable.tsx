"use client";

import { useState, useEffect, useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import type { ProvinceRow } from "@/lib/db";
import { freshnessColor, formatNum, timeAgo, formatTimestamp } from "@/lib/ui";

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
] as const;

type ColKey = (typeof COLUMNS)[number]["key"];

const DEFAULT_VISIBLE = new Set<ColKey>([
  "race", "land", "networth", "off_points", "def_points", "age",
]);

const STORAGE_KEY = "province-columns";

function ageFor(p: ProvinceRow, key: ColKey): string | null {
  if (key === "age") return p.overview_age ?? p.military_age;
  if (["soldiers", "off_specs", "def_specs", "elites", "peasants"].includes(key)) return p.troops_age;
  if (["thieves", "wizards"].includes(key)) return p.resources_age;
  if (["ome", "dme"].includes(key)) return p.som_age;
  if (["off_points", "def_points"].includes(key)) return p.military_age;
  return p.overview_age;
}

function sourceFor(p: ProvinceRow, key: ColKey): string | null {
  if (["soldiers", "off_specs", "def_specs", "elites", "peasants"].includes(key)) return p.troops_source;
  if (["thieves", "wizards"].includes(key)) return p.resources_source;
  if (["ome", "dme"].includes(key)) return "som";
  if (["off_points", "def_points"].includes(key)) return "sot";
  if (key === "age") return p.overview_source ?? (p.military_age ? "sot" : null);
  return p.overview_source;
}

function tipFor(p: ProvinceRow, key: ColKey): string {
  // Special case: age column shows both overview and military ages
  if (key === "age") {
    const lines = [];
    if (p.overview_age) lines.push(`overview (${p.overview_source ?? "?"}): ${timeAgo(p.overview_age)} · ${formatTimestamp(p.overview_age)}`);
    if (p.military_age) lines.push(`military (sot): ${timeAgo(p.military_age)} · ${formatTimestamp(p.military_age)}`);
    return lines.join("\n");
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
