"use client";

import { KingdomViewShell } from "./KingdomTabs";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { HistoryChartControls } from "@/app/components/HistoryChartControls";
import {
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  HistoryEventLegend,
  HistoryEventReferenceLines,
  historyEventMarkerTime,
  markerCategory,
  visibleHistoryEventMarkers,
  type VisibleHistoryEventMarker,
} from "@/app/components/HistoryEventMarkers";
import {
  filterHistoryByDateRange,
  historyChartLabel,
  historyChartLabelFromMs,
  historyChartTimeMs,
  type HistoryChartTimezone,
} from "@/app/components/historyChartTime";
import {
  defaultRealFrom,
  type UtopiaDateRangeValue,
} from "@/app/components/UtopiaDateRangeControls";
import { utcTimestampToUtopiaDate } from "@/lib/utopia-age";
import type {
  HistoryEventMarker,
  KingdomSnapshotHistoryPoint,
} from "@/lib/db-types";
import { formatNum } from "@/lib/ui";

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
  eventMarkers?: HistoryEventMarker[];
}

interface KingdomSnapshotChartProps extends SharedChartProps {
  initiallyOpen?: boolean;
}

interface KingdomHistoryViewProps extends SharedChartProps {
  boundKingdom?: string | null;
}

interface ChartStackProps extends SharedChartProps {
  tz: HistoryChartTimezone;
}

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
  t: number;
  label: string;
  primaryValue?: number;
  compareValue?: number;
};

function buildMetricRows(
  primary: KingdomSnapshotHistoryPoint[],
  compare: KingdomSnapshotHistoryPoint[],
  metric: MetricKey,
  tz: HistoryChartTimezone,
): ChartRow[] {
  const byIso = new Map<string, ChartRow>();

  for (const point of primary) {
    byIso.set(point.receivedAt, {
      iso: point.receivedAt,
      t: historyChartTimeMs(point.receivedAt),
      label: historyChartLabel(point.receivedAt, tz),
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
        t: historyChartTimeMs(point.receivedAt),
        label: historyChartLabel(point.receivedAt, tz),
        compareValue: point[metric] ?? undefined,
      });
    }
  }

  return [...byIso.values()].sort((a, b) => a.t - b.t);
}

function latestMetricValue(
  history: KingdomSnapshotHistoryPoint[],
  metric: MetricKey,
): number | null {
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
  tz,
  eventMarkers = [],
}: {
  primary: SeriesConfig;
  compare?: SeriesConfig;
  metric: (typeof METRICS)[number];
  tz: HistoryChartTimezone;
  eventMarkers?: HistoryEventMarker[];
}) {
  const data = useMemo(
    () =>
      buildMetricRows(primary.history, compare?.history ?? [], metric.key, tz),
    [primary.history, compare?.history, metric.key, tz],
  );
  const domainStart = data[0]?.t ?? 0;
  const domainEnd = data.at(-1)?.t ?? 0;
  const visibleEventMarkers = visibleHistoryEventMarkers(
    eventMarkers,
    domainStart,
    domainEnd,
  );
  const activeEventMarkers = visibleEventMarkers;

  return (
    <div className="rounded border border-gray-800 bg-gray-950/40 p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm font-medium text-gray-200">{metric.label}</div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500">
          <span>
            <span className="text-gray-400">{primary.kingdom}</span>{" "}
            <span className="text-gray-300 tabular-nums">
              {formatNum(latestMetricValue(primary.history, metric.key))}
              {metric.suffix ?? ""}
            </span>
          </span>
          {compare && (
            <span>
              <span className="text-gray-400">{compare.kingdom}</span>{" "}
              <span className="text-gray-300 tabular-nums">
                {formatNum(latestMetricValue(compare.history, metric.key))}
                {metric.suffix ?? ""}
              </span>
            </span>
          )}
        </div>
      </div>
      <ResponsiveContainer width="100%" height={220}>
        <LineChart
          data={data}
          margin={{ top: 4, right: 8, bottom: 0, left: 0 }}
        >
          <XAxis
            dataKey="t"
            type="number"
            domain={["dataMin", "dataMax"]}
            tick={{ fill: "#6b7280", fontSize: 10 }}
            tickLine={false}
            axisLine={false}
            minTickGap={32}
            tickFormatter={(value) =>
              historyChartLabelFromMs(Number(value), tz)
            }
          />
          <YAxis
            tick={{ fill: "#6b7280", fontSize: 10 }}
            tickLine={false}
            axisLine={false}
            width={56}
            tickFormatter={(value) => formatNum(Number(value))}
          />
          <Tooltip
            contentStyle={{
              background: "#111827",
              border: "1px solid #374151",
              borderRadius: 6,
              fontSize: 11,
            }}
            labelFormatter={(_, payload) => {
              const point = payload?.[0]?.payload as ChartRow | undefined;
              return point ? historyChartLabel(point.iso, tz) : "";
            }}
            formatter={(value, name) => {
              const n = Number(value);
              return [
                `${n.toLocaleString()}${metric.suffix ?? ""}`,
                String(name),
              ];
            }}
          />
          <Legend wrapperStyle={{ fontSize: 11, color: "#9ca3af" }} />
          <HistoryEventReferenceLines markers={activeEventMarkers} />
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
      {activeEventMarkers.length > 0 && (
        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
          <HistoryEventLegend
            markers={activeEventMarkers}
            formatTime={(marker: VisibleHistoryEventMarker) =>
              marker.detail ?? ""
            }
          />
        </div>
      )}
    </div>
  );
}

function historySummary(
  history: KingdomSnapshotHistoryPoint[],
  tz: HistoryChartTimezone,
): string {
  if (history.length === 0) return "0 snapshots";
  return `${history.length} snapshot${history.length === 1 ? "" : "s"} from ${historyChartLabel(history[0].receivedAt, tz)} to ${historyChartLabel(history[history.length - 1].receivedAt, tz)}`;
}

function ChartStack({
  primaryKingdom,
  primaryHistory,
  compareKingdom,
  compareHistory,
  tz,
  eventMarkers = [],
}: ChartStackProps) {
  const primarySeries: SeriesConfig = {
    kingdom: primaryKingdom,
    history: primaryHistory,
    color: METRICS[0].color,
  };
  const compareSeries =
    compareKingdom && compareHistory && compareHistory.length > 0
      ? {
          kingdom: compareKingdom,
          history: compareHistory,
          color: SECONDARY_COLOR,
          dash: "5 3",
        }
      : undefined;

  return (
    <div className="grid gap-3 lg:grid-cols-3">
      {METRICS.map((metric, index) => (
        <MetricChart
          key={metric.key}
          primary={{
            ...primarySeries,
            color:
              index === 0 ? "#60a5fa" : index === 1 ? "#34d399" : "#f59e0b",
          }}
          compare={compareSeries}
          metric={metric}
          tz={tz}
          eventMarkers={eventMarkers}
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
  eventMarkers = [],
  initiallyOpen = false,
}: KingdomSnapshotChartProps) {
  const [open, setOpen] = useState(initiallyOpen);
  const [tz, setTz] = useState<HistoryChartTimezone>("local");
  const [hiddenCategories, setHiddenCategories] = useState<Set<string>>(
    new Set(),
  );
  const [dateRange, setDateRange] = useState<UtopiaDateRangeValue>({
    mode: "real",
    from: defaultRealFrom(),
    to: "",
    toLatest: true,
  });
  const warMarker = eventMarkers.findLast((marker) =>
    marker.id.startsWith("war:"),
  );
  const warStartMs = warMarker ? historyEventMarkerTime(warMarker) : undefined;
  const warDate =
    warStartMs != null
      ? (utcTimestampToUtopiaDate(
          new Date(warStartMs).toISOString().slice(0, 19).replace("T", " "),
        ) ?? undefined)
      : undefined;
  const fromMs = dateRange.from ? new Date(dateRange.from).getTime() : null;
  const toMs =
    !dateRange.toLatest && dateRange.to
      ? new Date(dateRange.to).getTime()
      : null;
  const displayedPrimaryHistory = useMemo(
    () => filterHistoryByDateRange(primaryHistory, fromMs, toMs),
    [primaryHistory, fromMs, toMs],
  );
  const displayedCompareHistory = useMemo(
    () => filterHistoryByDateRange(compareHistory, fromMs, toMs),
    [compareHistory, fromMs, toMs],
  );

  if (primaryHistory.length === 0) return null;

  return (
    <section className="mb-4 rounded-lg border border-gray-800 bg-gray-900/50 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-gray-100">
            Kingdom History
          </h2>
          <div className="text-xs text-gray-500">
            {historySummary(displayedPrimaryHistory, tz)}
          </div>
          {compareKingdom && displayedCompareHistory.length > 0 && (
            <div className="text-xs text-gray-500">
              Overlaying {compareKingdom}.
            </div>
          )}
        </div>
        <HistoryChartControls
          tz={tz}
          onTimezoneToggle={() =>
            setTz((value) => (value === "UTC" ? "local" : "UTC"))
          }
          hiddenCategories={hiddenCategories}
          onCategoryToggle={(cat) =>
            setHiddenCategories((prev) => {
              const next = new Set(prev);
              if (next.has(cat)) next.delete(cat);
              else next.add(cat);
              return next;
            })
          }
          eventMarkers={eventMarkers}
          dateRange={dateRange}
          onDateRangeChange={setDateRange}
          warDate={warDate}
        >
          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            className="inline-flex items-center rounded border border-gray-700 bg-gray-900 px-2.5 py-1 text-xs text-gray-300 transition-colors hover:border-gray-500 hover:text-gray-100"
          >
            {open ? "Hide chart" : "Show chart"}
          </button>
        </HistoryChartControls>
      </div>
      {open && (
        <div className="mt-3">
          <ChartStack
            primaryKingdom={primaryKingdom}
            primaryHistory={displayedPrimaryHistory}
            compareKingdom={compareKingdom}
            compareHistory={displayedCompareHistory}
            tz={tz}
            eventMarkers={eventMarkers.filter(
              (m) => !hiddenCategories.has(markerCategory(m)),
            )}
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
  boundKingdom,
  eventMarkers = [],
}: KingdomHistoryViewProps) {
  const router = useRouter();
  const [compareInput, setCompareInput] = useState(compareKingdom ?? "");
  const [tz, setTz] = useState<HistoryChartTimezone>("local");
  const [hiddenCategories, setHiddenCategories] = useState<Set<string>>(
    new Set(),
  );
  const [dateRange, setDateRange] = useState<UtopiaDateRangeValue>({
    mode: "real",
    from: defaultRealFrom(),
    to: "",
    toLatest: true,
  });
  const kingdomHref = `/kingdom/${encodeURIComponent(primaryKingdom)}`;
  const warMarker = eventMarkers.findLast((marker) =>
    marker.id.startsWith("war:"),
  );
  const warStartMs = warMarker ? historyEventMarkerTime(warMarker) : undefined;
  const warDate =
    warStartMs != null
      ? (utcTimestampToUtopiaDate(
          new Date(warStartMs).toISOString().slice(0, 19).replace("T", " "),
        ) ?? undefined)
      : undefined;
  const fromMs = dateRange.from ? new Date(dateRange.from).getTime() : null;
  const toMs =
    !dateRange.toLatest && dateRange.to
      ? new Date(dateRange.to).getTime()
      : null;
  const displayedPrimaryHistory = useMemo(
    () => filterHistoryByDateRange(primaryHistory, fromMs, toMs),
    [primaryHistory, fromMs, toMs],
  );
  const displayedCompareHistory = useMemo(
    () => filterHistoryByDateRange(compareHistory, fromMs, toMs),
    [compareHistory, fromMs, toMs],
  );

  function applyCompare(event: React.FormEvent) {
    event.preventDefault();
    const target = compareInput.trim();
    if (!target) {
      router.push(`${kingdomHref}?view=history`);
      return;
    }
    router.push(
      `${kingdomHref}?view=history&compare=${encodeURIComponent(target)}`,
    );
  }

  return (
    <KingdomViewShell
      kingdom={primaryKingdom}
      boundKingdom={boundKingdom}
      active="history"
    >
      <section className="mb-4 rounded-lg border border-gray-800 bg-gray-900/50 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-gray-100">
              Snapshot History
            </h2>
            <div className="text-xs text-gray-500">
              {historySummary(displayedPrimaryHistory, tz)}
            </div>
            {compareKingdom && displayedCompareHistory.length > 0 && (
              <div className="mt-1 text-xs text-gray-500">
                Comparing against{" "}
                <span className="text-gray-300 font-mono">
                  {compareKingdom}
                </span>{" "}
                with {historySummary(displayedCompareHistory, tz)}.
              </div>
            )}
            {compareKingdom && displayedCompareHistory.length === 0 && (
              <div className="mt-1 text-xs text-amber-300">
                No accessible history found for{" "}
                <span className="font-mono">{compareKingdom}</span>.
              </div>
            )}
          </div>
          <form
            onSubmit={applyCompare}
            className="flex flex-wrap items-center gap-2"
          >
            <HistoryChartControls
              tz={tz}
              onTimezoneToggle={() =>
                setTz((value) => (value === "UTC" ? "local" : "UTC"))
              }
              hiddenCategories={hiddenCategories}
              onCategoryToggle={(cat) =>
                setHiddenCategories((prev) => {
                  const next = new Set(prev);
                  if (next.has(cat)) next.delete(cat);
                  else next.add(cat);
                  return next;
                })
              }
              eventMarkers={eventMarkers}
              dateRange={dateRange}
              onDateRangeChange={setDateRange}
              warDate={warDate}
            />
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
          primaryHistory={displayedPrimaryHistory}
          compareKingdom={compareKingdom}
          compareHistory={displayedCompareHistory}
          tz={tz}
          eventMarkers={eventMarkers.filter(
            (m) => !hiddenCategories.has(markerCategory(m)),
          )}
        />
      ) : (
        <div className="rounded-lg border border-gray-800 bg-gray-900/50 px-5 py-6 text-sm text-gray-400">
          No accessible kingdom history is available for {primaryKingdom}.
        </div>
      )}
    </KingdomViewShell>
  );
}
