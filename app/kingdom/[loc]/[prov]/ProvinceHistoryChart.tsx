"use client";

import { useMemo, useState } from "react";
import { Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { ProvinceHistoryPoint } from "@/lib/db";
import { formatNum } from "@/lib/ui";

type MetricKey = keyof Omit<ProvinceHistoryPoint, "receivedAt">;

interface MetricConfig {
  key: MetricKey;
  label: string;
  color: string;
  axis: "large" | "small";
}

// "large" axis (left): metrics with NW-scale values; "small" axis (right): land/troop/count-scale values
const METRICS: MetricConfig[] = [
  { key: "networth",  label: "NW",         color: "#60a5fa", axis: "large" },
  { key: "money",     label: "Money",       color: "#d1fae5", axis: "large" },
  { key: "food",      label: "Food",        color: "#bbf7d0", axis: "large" },
  { key: "land",      label: "Land",        color: "#34d399", axis: "small" },
  { key: "peasants",  label: "Peasants",    color: "#a78bfa", axis: "small" },
  { key: "soldiers",  label: "Soldiers",    color: "#fbbf24", axis: "small" },
  { key: "offSpecs",  label: "Off Specs",   color: "#f87171", axis: "small" },
  { key: "defSpecs",  label: "Def Specs",   color: "#6ee7b7", axis: "small" },
  { key: "elites",    label: "Elites",      color: "#fb923c", axis: "small" },
  { key: "warHorses", label: "War Horses",  color: "#c084fc", axis: "small" },
  { key: "offPoints", label: "Off Points",  color: "#f43f5e", axis: "small" },
  { key: "defPoints", label: "Def Points",  color: "#38bdf8", axis: "small" },
  { key: "thieves",   label: "Thieves",     color: "#e879f9", axis: "small" },
  { key: "wizards",   label: "Wizards",     color: "#818cf8", axis: "small" },
];

function chartLabel(isoStr: string): string {
  const d = new Date(isoStr.replace(" ", "T") + "Z");
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "UTC",
  });
}

type ChartRow = { iso: string; label: string } & Partial<Record<MetricKey, number>>;

function buildRows(history: ProvinceHistoryPoint[]): ChartRow[] {
  return history.map((point) => {
    const row: ChartRow = { iso: point.receivedAt, label: chartLabel(point.receivedAt) };
    for (const m of METRICS) {
      const v = point[m.key];
      if (v != null) row[m.key] = v as number;
    }
    return row;
  });
}

export function ProvinceHistoryChart({ history }: { history: ProvinceHistoryPoint[] }) {
  const [hidden, setHidden] = useState<Set<MetricKey>>(
    new Set(METRICS.filter((m) => !["networth", "land"].includes(m.key)).map((m) => m.key))
  );
  const [open, setOpen] = useState(false);

  if (history.length < 2) return null;

  const data = useMemo(() => buildRows(history), [history]);
  const visibleMetrics = METRICS.filter((m) => !hidden.has(m.key));
  const hasLarge = visibleMetrics.some((m) => m.axis === "large");
  const hasSmall = visibleMetrics.some((m) => m.axis === "small");

  const summary = `${history.length} snapshot${history.length === 1 ? "" : "s"} from ${chartLabel(history[0].receivedAt)} to ${chartLabel(history[history.length - 1].receivedAt)}`;

  const axisStyle = { fill: "#6b7280", fontSize: 10 };
  const tickFormatter = (value: number) => formatNum(value);

  return (
    <section className="mt-6 rounded-lg border border-gray-800 bg-gray-900/50 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-gray-100">Province History</h2>
          <div className="text-xs text-gray-500">{summary}</div>
        </div>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="inline-flex items-center rounded border border-gray-700 bg-gray-900 px-2.5 py-1 text-xs text-gray-300 transition-colors hover:border-gray-500 hover:text-gray-100"
        >
          {open ? "Hide chart" : "Show chart"}
        </button>
      </div>
      {open && (
        <div className="mt-3">
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={data} margin={{ top: 4, right: hasSmall ? 60 : 8, bottom: 0, left: 0 }}>
              <XAxis
                dataKey="label"
                tick={axisStyle}
                tickLine={false}
                axisLine={false}
                minTickGap={40}
              />
              <YAxis
                yAxisId="large"
                tick={axisStyle}
                tickLine={false}
                axisLine={false}
                width={56}
                tickFormatter={tickFormatter}
                hide={!hasLarge}
              />
              <YAxis
                yAxisId="small"
                orientation="right"
                tick={axisStyle}
                tickLine={false}
                axisLine={false}
                width={56}
                tickFormatter={tickFormatter}
                hide={!hasSmall}
              />
              <Tooltip
                contentStyle={{ background: "#111827", border: "1px solid #374151", borderRadius: 6, fontSize: 11 }}
                labelFormatter={(_, payload) => {
                  const point = payload?.[0]?.payload as ChartRow | undefined;
                  return point ? point.label : "";
                }}
                formatter={(value, name) => [Number(value).toLocaleString(), String(name)]}
              />
              <Legend
                wrapperStyle={{ fontSize: 11, color: "#9ca3af", cursor: "pointer" }}
                formatter={(value) => (
                  <span className="transition-colors hover:text-gray-100 hover:underline hover:underline-offset-2">
                    {value}
                  </span>
                )}
                onClick={(entry) => {
                  const key = String(entry.dataKey) as MetricKey;
                  setHidden((prev) => {
                    const next = new Set(prev);
                    if (next.has(key)) next.delete(key);
                    else next.add(key);
                    return next;
                  });
                }}
              />
              {METRICS.map((m) => (
                <Line
                  key={m.key}
                  yAxisId={m.axis}
                  type="monotone"
                  dataKey={m.key}
                  name={m.label}
                  stroke={m.color}
                  strokeWidth={["networth", "land"].includes(m.key) ? 2 : 1.5}
                  dot={data.length <= 20}
                  activeDot={{ r: 4 }}
                  connectNulls
                  hide={hidden.has(m.key)}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
          {visibleMetrics.length === 0 && (
            <p className="mt-2 text-center text-xs text-gray-500">Click legend entries to show metrics.</p>
          )}
          <p className="mt-1 text-right text-xs text-gray-600">Left axis: NW/Money/Food · Right axis: Land/Troops/Counts</p>
        </div>
      )}
    </section>
  );
}
