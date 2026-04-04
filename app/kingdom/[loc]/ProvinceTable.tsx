"use client";

import { useState, useEffect } from "react";
import type { ProvinceRow } from "@/lib/db";
import { freshnessColor, formatNum, timeAgo } from "@/lib/ui";

const COLUMNS = [
  { key: "race",     label: "Race" },
  { key: "land",     label: "Land" },
  { key: "networth", label: "NW"   },
  { key: "off",      label: "Off"  },
  { key: "def",      label: "Def"  },
  { key: "age",      label: "Age"  },
] as const;

type ColKey = (typeof COLUMNS)[number]["key"];

const ALL_KEYS = COLUMNS.map((c) => c.key);
const STORAGE_KEY = "province-columns";
const DEFAULT_VISIBLE = new Set<ColKey>(ALL_KEYS);

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

  const show = (key: ColKey) => visible.has(key);

  return (
    <div>
      <div className="flex gap-2 mb-3">
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
              {show("race")     && <th className="py-2 pr-4 font-medium">Race</th>}
              {show("land")     && <th className="py-2 pr-4 font-medium text-right">Land</th>}
              {show("networth") && <th className="py-2 pr-4 font-medium text-right">NW</th>}
              {show("off")      && <th className="py-2 pr-4 font-medium text-right">Off</th>}
              {show("def")      && <th className="py-2 pr-4 font-medium text-right">Def</th>}
              {show("age")      && <th className="py-2 font-medium text-right">Age</th>}
            </tr>
          </thead>
          <tbody>
            {provinces.map((p) => {
              const ageCol = p.overview_age ?? p.military_age;
              const fc = freshnessColor(ageCol);
              return (
                <tr key={p.id} className="border-b border-gray-800 hover:bg-gray-800/40">
                  <td className="py-2 pr-4">
                    <span className={`mr-1.5 ${fc}`}>●</span>
                    {p.name}
                  </td>
                  {show("race")     && <td className="py-2 pr-4 font-mono text-gray-400">{p.race ?? "—"}</td>}
                  {show("land")     && <td className="py-2 pr-4 text-right tabular-nums">{formatNum(p.land)}</td>}
                  {show("networth") && <td className="py-2 pr-4 text-right tabular-nums">{formatNum(p.networth)}</td>}
                  {show("off")      && <td className="py-2 pr-4 text-right tabular-nums">{formatNum(p.off_points)}</td>}
                  {show("def")      && <td className="py-2 pr-4 text-right tabular-nums">{formatNum(p.def_points)}</td>}
                  {show("age")      && <td className={`py-2 text-right tabular-nums ${fc}`}>{timeAgo(ageCol)}</td>}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
