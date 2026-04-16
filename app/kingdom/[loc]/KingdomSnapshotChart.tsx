"use client";

import { KingdomTabs } from "./KingdomTabs";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { KingdomSnapshotHistoryPoint } from "@/lib/db";
import { formatNum, formatTimestamp } from "@/lib/ui";

type MetricKey = "totalNetworth" | "totalLand" | "totalHonor";

interface SeriesConfig {
  kingdom: string;
  history: KingdomSnapshotHistoryPoint[];
  color: string;
  dash?: string;
}

interface SharedChartProps {
  primaryKingdom: string;
  primaryHistory: KingdomSnapshotHistoryPoint[];
  compareKingdom?: string | null;
  compareHistory?: KingdomSnapshotHistoryPoint[];
}

interface KingdomSnapshotChartProps extends SharedChartProps {
  initiallyOpen?: boolean;
}

interface KingdomHistoryViewProps extends SharedChartProps {}

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

const SECONDARY_COLOR = "#f472b6";

type ChartRow = {
  iso: string;
  label: string;
  primaryValue?: number;
  compareValue?: number;
};

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

function buildMetricRows(
  primary: KingdomSnapshotHistoryPoint[],
  compare: KingdomSnapshotHistoryPoint[],
  metric: MetricKey,
): ChartRow[] {
  const byIso = new Map<string, ChartRow>();

  for (const point of primary) {
    byIso.set(point.receivedAt, {
      iso: point.receivedAt,
      label: chartLabel(point.receivedAt),
      primaryValue: point[metric] ?? undefined,
    });
  }

  for (const point of compare) {
    const existing = byIso.get(point.receivedAt);
    if (existing) {
      existing.compareValue = point[metric] ?? undefined;
    } else {
      byIso.set(point.receivedAt, {
        iso: point.receivedAt,
        label: chartLabel(point.receivedAt),
        compareValue: point[metric] ?? undefined,
      });
    }
  }

  return [...byIso.values()].sort((a, b) => a.iso.localeCompare(b.iso));
}

function latestMetricValue(history: KingdomSnapshotHistoryPoint[], metric: MetricKey): number | null {
  for (let i = history.length - 1; i >= 0; i -= 1) {
    const value = history[i][metric];
    if (value != null) return value;
  }
  return null;
}

function MetricChart({
  primary,
  compare,
  metric,
}: {
  primary: SeriesConfig;
  compare?: SeriesConfig;
  metric: (typeof METRICS)[number];
}) {
  const data = useMemo(
    () => buildMetricRows(primary.history, compare?.history ?? [], metric.key),
    [primary.history, compare?.history, metric.key],
  );

  return (
    <div className="rounded border border-gray-800 bg-gray-950/40 p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm font-medium text-gray-200">{metric.label}</div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500">
          <span>
            <span className="text-gray-400">{primary.kingdom}</span>{" "}
            <span className="text-gray-300 tabular-nums">
              {formatNum(latestMetricValue(primary.history, metric.key))}{metric.suffix ?? ""}
            </span>
          </span>
          {compare && (
            <span>
              <span className="text-gray-400">{compare.kingdom}</span>{" "}
              <span className="text-gray-300 tabular-nums">
                {formatNum(latestMetricValue(compare.history, metric.key))}{metric.suffix ?? ""}
              </span>
            </span>
          )}
        </div>
      </div>
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
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
              const point = payload?.[0]?.payload as ChartRow | undefined;
              return point ? formatTimestamp(point.iso) : "";
            }}
            formatter={(value, name) => {
              const n = Number(value);
              return [`${n.toLocaleString()}${metric.suffix ?? ""}`, String(name)];
            }}
          />
          <Legend wrapperStyle={{ fontSize: 11, color: "#9ca3af" }} />
          <Line
            type="monotone"
            name={primary.kingdom}
            dataKey="primaryValue"
            stroke={primary.color}
            strokeWidth={2}
            dot={data.length <= 16}
            activeDot={{ r: 4 }}
            connectNulls
          />
          {compare && (
            <Line
              type="monotone"
              name={compare.kingdom}
              dataKey="compareValue"
              stroke={compare.color}
              strokeWidth={2}
              strokeDasharray={compare.dash}
              dot={data.length <= 16}
              activeDot={{ r: 4 }}
              connectNulls
            />
          )}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function historySummary(history: KingdomSnapshotHistoryPoint[]): string {
  return `${history.length} snapshot${history.length === 1 ? "" : "s"} from ${formatTimestamp(history[0]?.receivedAt ?? null)} to ${formatTimestamp(history.at(-1)?.receivedAt ?? null)}`;
}

function ChartStack({ primaryKingdom, primaryHistory, compareKingdom, compareHistory }: SharedChartProps) {
  const primarySeries: SeriesConfig = {
    kingdom: primaryKingdom,
    history: primaryHistory,
    color: METRICS[0].color,
  };
  const compareSeries = compareKingdom && compareHistory && compareHistory.length > 0
    ? { kingdom: compareKingdom, history: compareHistory, color: SECONDARY_COLOR, dash: "5 3" }
    : undefined;

  return (
    <div className="grid gap-3 lg:grid-cols-3">
      {METRICS.map((metric, index) => (
        <MetricChart
          key={metric.key}
          primary={{ ...primarySeries, color: index === 0 ? "#60a5fa" : index === 1 ? "#34d399" : "#f59e0b" }}
          compare={compareSeries}
          metric={metric}
        />
      ))}
    </div>
  );
}

export function KingdomSnapshotChart({
  primaryKingdom,
  primaryHistory,
  compareKingdom,
  compareHistory = [],
  initiallyOpen = false,
}: KingdomSnapshotChartProps) {
  const [open, setOpen] = useState(initiallyOpen);

  if (primaryHistory.length === 0) return null;

  return (
    <section className="mb-4 rounded-lg border border-gray-800 bg-gray-900/50 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-gray-100">Kingdom History</h2>
          <div className="text-xs text-gray-500">{historySummary(primaryHistory)}</div>
          {compareKingdom && compareHistory.length > 0 && (
            <div className="text-xs text-gray-500">Overlaying {compareKingdom}.</div>
          )}
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
        <div className="mt-3">
          <ChartStack
            primaryKingdom={primaryKingdom}
            primaryHistory={primaryHistory}
            compareKingdom={compareKingdom}
            compareHistory={compareHistory}
          />
        </div>
      )}
    </section>
  );
}

export function KingdomHistoryView({
  primaryKingdom,
  primaryHistory,
  compareKingdom,
  compareHistory = [],
}: KingdomHistoryViewProps) {
  const router = useRouter();
  const [compareInput, setCompareInput] = useState(compareKingdom ?? "");
  const kingdomHref = `/kingdom/${encodeURIComponent(primaryKingdom)}`;

  function applyCompare(event: React.FormEvent) {
    event.preventDefault();
    const target = compareInput.trim();
    if (!target) {
      router.push(`${kingdomHref}?view=history`);
      return;
    }
    router.push(`${kingdomHref}?view=history&compare=${encodeURIComponent(target)}`);
  }

  return (
    <div>
      <KingdomTabs kingdomHref={kingdomHref} active="history" />

      <section className="mb-4 rounded-lg border border-gray-800 bg-gray-900/50 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-gray-100">Snapshot History</h2>
            <div className="text-xs text-gray-500">{historySummary(primaryHistory)}</div>
            {compareKingdom && compareHistory.length > 0 && (
              <div className="mt-1 text-xs text-gray-500">
                Comparing against <span className="text-gray-300 font-mono">{compareKingdom}</span> with {historySummary(compareHistory)}.
              </div>
            )}
            {compareKingdom && compareHistory.length === 0 && (
              <div className="mt-1 text-xs text-amber-300">
                No accessible history found for <span className="font-mono">{compareKingdom}</span>.
              </div>
            )}
          </div>
          <form onSubmit={applyCompare} className="flex flex-wrap items-center gap-2">
            <input
              type="text"
              value={compareInput}
              onChange={(event) => setCompareInput(event.target.value)}
              placeholder="Compare kingdom e.g. 2:6"
              className="w-44 rounded border border-gray-700 bg-gray-950 px-2.5 py-1.5 text-sm text-gray-200 outline-none transition-colors placeholder:text-gray-600 focus:border-gray-500"
            />
            <button
              type="submit"
              className="inline-flex items-center rounded border border-gray-700 bg-gray-900 px-2.5 py-1 text-xs text-gray-300 transition-colors hover:border-gray-500 hover:text-gray-100"
            >
              Compare
            </button>
            {compareKingdom && (
              <button
                type="button"
                onClick={() => {
                  setCompareInput("");
                  router.push(`${kingdomHref}?view=history`);
                }}
                className="inline-flex items-center rounded border border-gray-700 bg-gray-900 px-2.5 py-1 text-xs text-gray-400 transition-colors hover:border-gray-500 hover:text-gray-200"
              >
                Clear
              </button>
            )}
          </form>
        </div>
      </section>

      {primaryHistory.length > 0 ? (
        <ChartStack
          primaryKingdom={primaryKingdom}
          primaryHistory={primaryHistory}
          compareKingdom={compareKingdom}
          compareHistory={compareHistory}
        />
      ) : (
        <div className="rounded-lg border border-gray-800 bg-gray-900/50 px-5 py-6 text-sm text-gray-400">
          No accessible kingdom history is available for {primaryKingdom}.
        </div>
      )}
    </div>
  );
}
