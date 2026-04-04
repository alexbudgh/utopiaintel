"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import type { ProvinceRow } from "@/lib/db";
import { freshnessColor, formatNum, timeAgo } from "@/lib/ui";

const COLUMNS = [
  { key: "race",        label: "Race",        group: "Overview"  },
  { key: "personality", label: "Personality", group: "Overview"  },
  { key: "land",        label: "Land",        group: "Overview"  },
  { key: "networth",    label: "NW",          group: "Overview"  },
  { key: "off_points",  label: "Off",         group: "Military"  },
  { key: "def_points",  label: "Def",         group: "Military"  },
  { key: "soldiers",    label: "Soldiers",    group: "Troops"    },
  { key: "off_specs",   label: "Off specs",   group: "Troops"    },
  { key: "def_specs",   label: "Def specs",   group: "Troops"    },
  { key: "elites",      label: "Elites",      group: "Troops"    },
  { key: "peasants",    label: "Peasants",    group: "Troops"    },
  { key: "ome",         label: "OME",         group: "Military"  },
  { key: "dme",         label: "DME",         group: "Military"  },
  { key: "thieves",     label: "Thieves",     group: "Resources" },
  { key: "wizards",     label: "Wizards",     group: "Resources" },
  { key: "age",         label: "Age",         group: "Overview"  },
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
                  {col.label}
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
                    <span className={`mr-1.5 ${freshnessColor(dotAge)}`}>●</span>
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
                        {cellValue(p, col.key)}
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
