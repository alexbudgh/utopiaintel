"use client";

import { useMemo, useState } from "react";
import { Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { TooltipContentProps } from "recharts/types/component/Tooltip";
import type { Payload } from "recharts/types/component/DefaultTooltipContent";
import type { ProvinceHistoryPoint } from "@/lib/db";
import { formatNum } from "@/lib/ui";

type MetricKey = keyof Omit<ProvinceHistoryPoint, "receivedAt" | "meta">;

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

const METRIC_BY_KEY = new Map(METRICS.map((m) => [m.key, m]));

const LOCAL_TZ_LABEL =
  new Intl.DateTimeFormat("en", { timeZoneName: "shortOffset" })
    .formatToParts(new Date())
    .find((p) => p.type === "timeZoneName")?.value ?? "Local";

// Target ~60 display points; snap bucket size to a nice interval
const TARGET_POINTS = 60;
const NICE_BUCKETS_MS = [
  5 * 60_000, 10 * 60_000, 15 * 60_000, 30 * 60_000,
  60 * 60_000, 120 * 60_000, 240 * 60_000,
];

function chartLabel(isoStr: string, tz: "UTC" | "local"): string {
  const d = new Date(isoStr.replace(" ", "T") + "Z");
  return d.toLocaleString("en-US", {
    month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit",
    hour12: false,
    timeZone: tz === "UTC" ? "UTC" : undefined,
  });
}

type MetaMap = Partial<Record<string, { sources: string[]; savedBy: string[] }>>;

type ChartRow = {
  iso: string;
  label: string;
  meta: MetaMap;
  bucketed: boolean;
} & Partial<Record<MetricKey, number>>;

function buildRows(history: ProvinceHistoryPoint[], tz: "UTC" | "local"): ChartRow[] {
  if (history.length === 0) return [];

  const toMs = (iso: string) => new Date(iso.replace(" ", "T") + "Z").getTime();

  // Pick a bucket size: if few points, use raw; otherwise snap up to a nice interval
  const spanMs = toMs(history[history.length - 1].receivedAt) - toMs(history[0].receivedAt);
  const rawBucketMs = spanMs / TARGET_POINTS;
  const bucketMs = history.length <= TARGET_POINTS
    ? 0  // no bucketing
    : NICE_BUCKETS_MS.find((b) => b >= rawBucketMs) ?? NICE_BUCKETS_MS[NICE_BUCKETS_MS.length - 1];

  if (!bucketMs) {
    return history.map((point) => {
      const row: ChartRow = {
        iso: point.receivedAt,
        label: chartLabel(point.receivedAt, tz),
        meta: point.meta,
        bucketed: false,
      };
      for (const m of METRICS) {
        const v = point[m.key];
        if (v != null) row[m.key] = v as number;
      }
      return row;
    });
  }

  // Group into buckets, LWW per metric (history is sorted ascending so last wins)
  const groups = new Map<number, ProvinceHistoryPoint[]>();
  for (const point of history) {
    const bucket = Math.floor(toMs(point.receivedAt) / bucketMs) * bucketMs;
    (groups.get(bucket) ?? (groups.set(bucket, []), groups.get(bucket)!)).push(point);
  }

  return [...groups.entries()].sort(([a], [b]) => a - b).map(([bucketStart, points]) => {
    const iso = new Date(bucketStart).toISOString().replace("T", " ").replace(".000Z", "");
    const meta: MetaMap = {};
    for (const p of points) {
      for (const [key, m] of Object.entries(p.meta)) {
        const existing = meta[key] ?? (meta[key] = { sources: [], savedBy: [] });
        for (const s of m!.sources) if (!existing.sources.includes(s)) existing.sources.push(s);
        for (const s of m!.savedBy) if (!existing.savedBy.includes(s)) existing.savedBy.push(s);
      }
    }
    const row: ChartRow = { iso, label: chartLabel(iso, tz), meta, bucketed: true };
    for (const m of METRICS) {
      const last = [...points].reverse().find((p) => p[m.key] != null);
      if (last) row[m.key] = last[m.key] as number;
    }
    return row;
  });
}

function ChartTooltip({ active, payload, tz }: TooltipContentProps<number, string> & { tz: "UTC" | "local" }) {
  if (!active || !payload?.length) return null;
  const point = (payload[0] as Payload<number, string> | undefined)?.payload as ChartRow | undefined;
  if (!point) return null;

  const visible = (payload as Payload<number, string>[]).filter((p) => p.value != null);

  return (
    <div className="rounded border border-gray-700 bg-gray-900 p-2 text-xs shadow-lg" style={{ minWidth: 160 }}>
      <div className="mb-1 font-medium text-gray-200">
        {point.label}
        <span className="ml-1 text-gray-500">{tz === "UTC" ? "UTC" : LOCAL_TZ_LABEL}</span>
      </div>
      <div className="space-y-0.5">
        {visible.map((p: Payload<number, string>) => {
          const cfg = METRIC_BY_KEY.get(p.dataKey as MetricKey);
          const m = point.meta[p.dataKey as string];
          return (
            <div key={String(p.dataKey)}>
              <div className="flex items-center justify-between gap-3">
                <span style={{ color: cfg?.color ?? "#9ca3af" }}>{p.name}</span>
                <span className="tabular-nums text-gray-200">{Number(p.value).toLocaleString()}</span>
              </div>
              {m && (m.sources.length > 0 || m.savedBy.length > 0) && (
                <div className="pl-1 text-gray-600">
                  {m.sources.length > 0 && <span>{m.sources.join(", ")}</span>}
                  {m.sources.length > 0 && m.savedBy.length > 0 && <span> · </span>}
                  {m.savedBy.length > 0 && <span>{m.savedBy.join(", ")}</span>}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function ProvinceHistoryChart({ history }: { history: ProvinceHistoryPoint[] }) {
  const [hidden, setHidden] = useState<Set<MetricKey>>(
    new Set(METRICS.filter((m) => !["networth", "land"].includes(m.key)).map((m) => m.key))
  );
  const [open, setOpen] = useState(false);
  const [hoveredLine, setHoveredLine] = useState<MetricKey | null>(null);
  const [tz, setTz] = useState<"UTC" | "local">("UTC");

  if (history.length < 2) return null;

  const data = useMemo(() => buildRows(history, tz), [history, tz]);
  const visibleMetrics = METRICS.filter((m) => !hidden.has(m.key));
  const hasLarge = visibleMetrics.some((m) => m.axis === "large");
  const hasSmall = visibleMetrics.some((m) => m.axis === "small");
  const bucketed = data.some((r) => r.bucketed);

  const tzLabel = tz === "UTC" ? "UTC" : LOCAL_TZ_LABEL;
  const summary = `${history.length} snapshot${history.length === 1 ? "" : "s"} from ${chartLabel(history[0].receivedAt, tz)} to ${chartLabel(history[history.length - 1].receivedAt, tz)} ${tzLabel}`;

  const axisStyle = { fill: "#6b7280", fontSize: 10 };

  return (
    <section className="mt-6 rounded-lg border border-gray-800 bg-gray-900/50 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-gray-100">Province History</h2>
          <div className="text-xs text-gray-500">
            {summary}{bucketed && ` · bucketed into ${data.length} points (most recent per window)`}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setTz((v) => v === "UTC" ? "local" : "UTC")}
            className="inline-flex items-center rounded border border-gray-700 bg-gray-900 px-2.5 py-1 text-xs text-gray-400 transition-colors hover:border-gray-500 hover:text-gray-100"
            title={tz === "UTC" ? "Switch to local time" : "Switch to UTC"}
          >
            {tz === "UTC" ? "UTC" : `Local (${LOCAL_TZ_LABEL})`}
          </button>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="inline-flex items-center rounded border border-gray-700 bg-gray-900 px-2.5 py-1 text-xs text-gray-300 transition-colors hover:border-gray-500 hover:text-gray-100"
          >
            {open ? "Hide chart" : "Show chart"}
          </button>
        </div>
      </div>
      {open && (
        <div className="mt-3">
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={data} margin={{ top: 4, right: hasSmall ? 60 : 8, bottom: 0, left: 0 }}>
              <XAxis dataKey="label" tick={axisStyle} tickLine={false} axisLine={false} minTickGap={40} />
              <YAxis yAxisId="large" tick={axisStyle} tickLine={false} axisLine={false} width={56}
                tickFormatter={(v) => formatNum(Number(v))} hide={!hasLarge} />
              <YAxis yAxisId="small" orientation="right" tick={axisStyle} tickLine={false} axisLine={false} width={56}
                tickFormatter={(v) => formatNum(Number(v))} hide={!hasSmall} />
              <Tooltip content={(props) => <ChartTooltip {...(props as TooltipContentProps<number, string>)} tz={tz} />} />
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
                    if (next.has(key)) next.delete(key); else next.add(key);
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
                  dot={hoveredLine === m.key ? { r: 3, fill: m.color, strokeWidth: 0 } : false}
                  activeDot={{ r: 5, strokeWidth: 2, stroke: "#111827" }}
                  connectNulls
                  hide={hidden.has(m.key)}
                  onMouseEnter={() => setHoveredLine(m.key)}
                  onMouseLeave={() => setHoveredLine(null)}
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
