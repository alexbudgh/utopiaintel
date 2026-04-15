"use client";

import { useMemo, useState } from "react";
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { KingdomSnapshotHistoryPoint } from "@/lib/db";
import { formatNum, formatTimestamp } from "@/lib/ui";

interface KingdomSnapshotChartProps {
  history: KingdomSnapshotHistoryPoint[];
}

type MetricKey = "totalNetworth" | "totalLand" | "totalHonor";

const METRICS: {
  key: MetricKey;
  label: string;
  color: string;
  suffix?: string;
}[] = [
  { key: "totalNetworth", label: "NW", color: "#60a5fa" },
  { key: "totalLand", label: "Land", color: "#34d399", suffix: "a" },
  { key: "totalHonor", label: "Honor", color: "#f59e0b" },
];

function chartLabel(iso: string): string {
  const d = new Date(iso.replace(" ", "T") + "Z");
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "UTC",
  });
}

function MetricChart({
  history,
  metric,
}: {
  history: Array<KingdomSnapshotHistoryPoint & { label: string }>;
  metric: (typeof METRICS)[number];
}) {
  return (
    <div className="rounded border border-gray-800 bg-gray-950/40 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="text-sm font-medium text-gray-200">{metric.label}</div>
        <div className="text-xs text-gray-500">
          Latest: <span className="text-gray-300 tabular-nums">{formatNum(history.at(-1)?.[metric.key] ?? null)}{metric.suffix ?? ""}</span>
        </div>
      </div>
      <ResponsiveContainer width="100%" height={160}>
        <LineChart data={history} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
          <XAxis
            dataKey="label"
            tick={{ fill: "#6b7280", fontSize: 10 }}
            tickLine={false}
            axisLine={false}
            minTickGap={32}
          />
          <YAxis
            tick={{ fill: "#6b7280", fontSize: 10 }}
            tickLine={false}
            axisLine={false}
            width={56}
            tickFormatter={(value) => formatNum(Number(value))}
          />
          <Tooltip
            contentStyle={{ background: "#111827", border: "1px solid #374151", borderRadius: 6, fontSize: 11 }}
            labelFormatter={(_, payload) => {
              const point = payload?.[0]?.payload as KingdomSnapshotHistoryPoint | undefined;
              return point ? formatTimestamp(point.receivedAt) : "";
            }}
            formatter={(value) => {
              const n = Number(value);
              return [`${n.toLocaleString()}${metric.suffix ?? ""}`, metric.label];
            }}
          />
          <Line
            type="monotone"
            dataKey={metric.key}
            stroke={metric.color}
            strokeWidth={2}
            dot={history.length <= 16}
            activeDot={{ r: 4 }}
            connectNulls={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function KingdomSnapshotChart({ history }: KingdomSnapshotChartProps) {
  const [open, setOpen] = useState(false);
  const chartData = useMemo(
    () =>
      history.map((point) => ({
        ...point,
        label: chartLabel(point.receivedAt),
      })),
    [history],
  );

  if (history.length === 0) return null;

  return (
    <section className="mb-4 rounded-lg border border-gray-800 bg-gray-900/50 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-gray-100">Kingdom History</h2>
          <div className="text-xs text-gray-500">
            {history.length} snapshot{history.length === 1 ? "" : "s"} from {formatTimestamp(history[0]?.receivedAt ?? null)} to {formatTimestamp(history.at(-1)?.receivedAt ?? null)}
          </div>
        </div>
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          className="inline-flex items-center rounded border border-gray-700 bg-gray-900 px-2.5 py-1 text-xs text-gray-300 transition-colors hover:border-gray-500 hover:text-gray-100"
        >
          {open ? "Hide chart" : "Show chart"}
        </button>
      </div>
      {open && (
        <div className="mt-3 grid gap-3 lg:grid-cols-3">
          {METRICS.map((metric) => (
            <MetricChart key={metric.key} history={chartData} metric={metric} />
          ))}
        </div>
      )}
    </section>
  );
}
