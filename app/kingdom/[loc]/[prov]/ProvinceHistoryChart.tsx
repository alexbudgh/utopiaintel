"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { ComposedChart, Legend, Line, ResponsiveContainer, Scatter, Tooltip, XAxis, YAxis } from "recharts";
import type { TooltipContentProps } from "recharts/types/component/Tooltip";
import type { Payload } from "recharts/types/component/DefaultTooltipContent";
import type { ProvinceHistoryPoint } from "@/lib/db";
import { formatNum } from "@/lib/ui";

type MetricKey = keyof Omit<ProvinceHistoryPoint, "receivedAt" | "meta" | "attacksTaken" | "thieveryOpsTaken" | "sorceryOpsTaken">;

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
  { key: "runes",     label: "Runes",       color: "#f59e0b", axis: "small" },
  { key: "thieves",   label: "Thieves",     color: "#e879f9", axis: "small" },
  { key: "wizards",   label: "Wizards",     color: "#818cf8", axis: "small" },
];

const METRIC_BY_KEY = new Map(METRICS.map((m) => [m.key, m]));

function truncateList(items: string[], max = 3): string {
  if (items.length <= max) return items.join(", ");
  return `${items.slice(0, max).join(", ")} … (${items.length - max} more)`;
}

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
  attacksTaken: ProvinceHistoryPoint["attacksTaken"];
  attackLosses?: number;
  thieveryOpsTaken: ProvinceHistoryPoint["thieveryOpsTaken"];
  thieveryAmountStolen?: number;
  thieveryOpsCount?: number;
  sorceryOpsTaken: ProvinceHistoryPoint["sorceryOpsTaken"];
  sorceryOpsCount?: number;
} & Partial<Record<MetricKey, number>>;

function attackTypeLabel(type: string): string {
  return type.replaceAll("_", " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

const ATTACK_TYPE_SHORT: Record<string, string> = {
  TRADITIONAL_MARCH: "TM",
  AMBUSH: "Ambush",
  RAZE: "Raze",
  PILLAGE: "Pillage",
  LOOT: "Loot",
  MASSACRE: "Massacre",
  NIGHT_STRIKE: "NS",
};
function attackTypeShort(type: string): string {
  return ATTACK_TYPE_SHORT[type] ?? attackTypeLabel(type);
}

function attackLosses(attacks: ProvinceHistoryPoint["attacksTaken"]): number {
  return attacks.reduce((sum, attack) =>
    sum + (attack.killed ?? 0) + (attack.imprisoned ?? 0) + (attack.massacred ?? 0), 0);
}

const ROB_OPS = new Set(["towers", "vaults", "granaries"]);

function sumAmountStolen(ops: ProvinceHistoryPoint["thieveryOpsTaken"]): number {
  return ops.filter((op) => ROB_OPS.has(op.op)).reduce((sum, op) => sum + (op.amountStolen ?? 0), 0);
}

function robOpLabel(op: string): string {
  if (op === "towers") return "Towers";
  if (op === "vaults") return "Vaults";
  if (op === "granaries") return "Granaries";
  return op.replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatBucketWidth(ms: number): string {
  const mins = ms / 60_000;
  return mins < 60 ? `${mins}m` : `${mins / 60}h`;
}

function buildRows(history: ProvinceHistoryPoint[], tz: "UTC" | "local"): { rows: ChartRow[]; bucketMs: number } {
  if (history.length === 0) return { rows: [], bucketMs: 0 };

  const toMs = (iso: string) => new Date(iso.replace(" ", "T") + "Z").getTime();

  // Pick a bucket size: if few points, use raw; otherwise snap up to a nice interval
  const spanMs = toMs(history[history.length - 1].receivedAt) - toMs(history[0].receivedAt);
  const rawBucketMs = spanMs / TARGET_POINTS;
  const bucketMs = history.length <= TARGET_POINTS
    ? 0  // no bucketing
    : NICE_BUCKETS_MS.find((b) => b >= rawBucketMs) ?? NICE_BUCKETS_MS[NICE_BUCKETS_MS.length - 1];

  if (!bucketMs) {
    return { bucketMs: 0, rows: history.map((point) => {
      const row: ChartRow = {
        iso: point.receivedAt,
        label: chartLabel(point.receivedAt, tz),
        meta: point.meta,
        bucketed: false,
        attacksTaken: point.attacksTaken,
        thieveryOpsTaken: point.thieveryOpsTaken,
        sorceryOpsTaken: point.sorceryOpsTaken,
      };
      for (const m of METRICS) {
        const v = point[m.key];
        if (v != null) row[m.key] = v as number;
      }
      const losses = attackLosses(point.attacksTaken);
      if (losses > 0) row.attackLosses = losses;
      const stolen = sumAmountStolen(point.thieveryOpsTaken);
      if (stolen > 0) row.thieveryAmountStolen = stolen;
      const otherOpsCount = point.thieveryOpsTaken.filter((op) => !ROB_OPS.has(op.op)).length;
      if (otherOpsCount > 0) row.thieveryOpsCount = otherOpsCount;
      if (point.sorceryOpsTaken.length > 0) row.sorceryOpsCount = point.sorceryOpsTaken.length;
      return row;
    }) };
  }

  // Group into buckets, LWW per metric (history is sorted ascending so last wins)
  const groups = new Map<number, ProvinceHistoryPoint[]>();
  for (const point of history) {
    const bucket = Math.floor(toMs(point.receivedAt) / bucketMs) * bucketMs;
    (groups.get(bucket) ?? (groups.set(bucket, []), groups.get(bucket)!)).push(point);
  }

  const rows = [...groups.entries()].sort(([a], [b]) => a - b).map(([bucketStart, points]) => {
    const iso = new Date(bucketStart).toISOString().replace("T", " ").replace(".000Z", "");
    const meta: MetaMap = {};
    for (const p of points) {
      for (const [key, m] of Object.entries(p.meta)) {
        const existing = meta[key] ?? (meta[key] = { sources: [], savedBy: [] });
        for (const s of m!.sources) if (!existing.sources.includes(s)) existing.sources.push(s);
        for (const s of m!.savedBy) if (!existing.savedBy.includes(s)) existing.savedBy.push(s);
      }
    }
    const attacksTaken = points.flatMap((p) => p.attacksTaken);
    const thieveryOpsTaken = points.flatMap((p) => p.thieveryOpsTaken);
    const sorceryOpsTaken = points.flatMap((p) => p.sorceryOpsTaken);
    const row: ChartRow = { iso, label: chartLabel(iso, tz), meta, bucketed: true, attacksTaken, thieveryOpsTaken, sorceryOpsTaken };
    for (const m of METRICS) {
      const last = [...points].reverse().find((p) => p[m.key] != null);
      if (last) row[m.key] = last[m.key] as number;
    }
    const losses = attackLosses(attacksTaken);
    if (losses > 0) row.attackLosses = losses;
    const stolen = sumAmountStolen(thieveryOpsTaken);
    if (stolen > 0) row.thieveryAmountStolen = stolen;
    const otherOpsCount = thieveryOpsTaken.filter((op) => !ROB_OPS.has(op.op)).length;
    if (otherOpsCount > 0) row.thieveryOpsCount = otherOpsCount;
    if (sorceryOpsTaken.length > 0) row.sorceryOpsCount = sorceryOpsTaken.length;
    return row;
  });

  return { bucketMs, rows };
}

function ChartTooltip({ active, payload, tz, hideAttacks, hideThievery, hideSabotageOps, hideSorcery, maxWidth }: TooltipContentProps<number, string> & { tz: "UTC" | "local"; hideAttacks: boolean; hideThievery: boolean; hideSabotageOps: boolean; hideSorcery: boolean; maxWidth: number }) {
  if (!active || !payload?.length) return null;
  const point = (payload[0] as Payload<number, string> | undefined)?.payload as ChartRow | undefined;
  if (!point) return null;

  const visible = (payload as Payload<number, string>[]).filter((p) => METRIC_BY_KEY.has(p.dataKey as MetricKey) && p.value != null);
  const attacks = hideAttacks ? [] : point.attacksTaken;
  const totalAcresTaken = attacks.reduce((sum, a) => sum + (a.acresTaken ?? 0), 0);
  const totalLosses = attacks.reduce((sum, a) => sum + (a.killed ?? 0) + (a.imprisoned ?? 0) + (a.massacred ?? 0), 0);
  const allThieveryOps = point.thieveryOpsTaken;
  const robOps = hideThievery ? [] : allThieveryOps.filter((op) => ROB_OPS.has(op.op));
  const sabotageOps = hideSabotageOps ? [] : allThieveryOps.filter((op) => !ROB_OPS.has(op.op));
  const sorceryOps = hideSorcery ? [] : point.sorceryOpsTaken;
  const totalStolen = robOps.reduce((sum, op) => sum + (op.amountStolen ?? 0), 0);
  const stolenByType = new Map<string, { stolen: number; thievesLost: number; successes: number; failures: number }>();
  for (const op of robOps) {
    const e = stolenByType.get(op.op) ?? { stolen: 0, thievesLost: 0, successes: 0, failures: 0 };
    e.stolen += op.amountStolen ?? 0;
    e.thievesLost += op.thievesLost;
    if (op.outcome === "success") e.successes++; else e.failures++;
    stolenByType.set(op.op, e);
  }
  const thieveryContributors = [...new Set(robOps.map((op) => op.attackerName))];
  const thieverySuccesses = robOps.filter((op) => op.outcome === "success").length;
  const thieveryFailures = robOps.length - thieverySuccesses;

  return (
    <div className="rounded border border-gray-700 bg-gray-900 p-2 text-xs shadow-lg" style={{ minWidth: 220, maxWidth }}>
      <div className="mb-1 font-medium text-gray-200">
        {point.label}
        <span className="ml-1 text-gray-500">{tz === "UTC" ? "UTC" : LOCAL_TZ_LABEL}</span>
      </div>
      <div className="space-y-0.5">
        {attacks.length > 0 && (
          <div className="mb-1 rounded border border-rose-900/70 bg-rose-950/30 p-1.5">
            <div className="flex items-center justify-between gap-3 text-rose-200">
              <span>{attacks.length} attack{attacks.length === 1 ? "" : "s"} taken</span>
              <span className="tabular-nums text-gray-400">
                {totalAcresTaken > 0 && <>{totalAcresTaken} acres · </>}{formatNum(totalLosses)} losses
              </span>
            </div>
            <div className="mt-1 grid grid-cols-[auto_1fr_2.5rem_auto] gap-x-2 gap-y-0.5 text-gray-600">
              <span>Type</span><span>By</span><span className="text-right">Acres</span><span>Casualties</span>
              {attacks.slice(0, 5).map((attack, i) => {
                const cas = [
                  attack.killed     ? `${formatNum(attack.killed)} K`   : null,
                  attack.imprisoned ? `${formatNum(attack.imprisoned)} I` : null,
                  attack.massacred  ? `${formatNum(attack.massacred)} M`  : null,
                ].filter(Boolean).join(" · ");
                return (
                  <Fragment key={`${attack.receivedAt}:${i}`}>
                    <span className="text-gray-400">{attackTypeShort(attack.attackType)}</span>
                    <span className="truncate text-gray-500">{attack.attackerName}</span>
                    <span className="text-right tabular-nums text-gray-500">{attack.acresTaken ?? "—"}</span>
                    <span className="tabular-nums text-gray-500">{cas || "—"}</span>
                  </Fragment>
                );
              })}
            </div>
            {attacks.length > 5 && <div className="mt-0.5 text-gray-600">+{attacks.length - 5} more</div>}
          </div>
        )}
        {robOps.length > 0 && (
          <div className="mb-1 rounded border border-amber-900/70 bg-amber-950/30 p-1.5">
            <div className="flex items-center justify-between gap-3 text-amber-200">
              <span>
                {robOps.length} rob op{robOps.length === 1 ? "" : "s"}
                <span className="ml-1.5 text-gray-500">
                  {thieverySuccesses}✓{thieveryFailures > 0 && <> {thieveryFailures}✗</>}
                </span>
              </span>
              {totalStolen > 0 && <span className="tabular-nums">{formatNum(totalStolen)} stolen</span>}
            </div>
            <div className="mt-1 grid grid-cols-[auto_1fr_auto_auto] gap-x-2 gap-y-0.5 text-gray-600">
              <span>Type</span><span>Stolen</span><span>✓/✗</span><span>Thieves Lost</span>
              {(["vaults", "granaries", "towers"] as const)
                .filter((op) => stolenByType.has(op))
                .map((op) => {
                  const { stolen, thievesLost, successes, failures } = stolenByType.get(op)!;
                  const resource = op === "vaults" ? "gold" : op === "granaries" ? "food" : "runes";
                  return (
                    <Fragment key={op}>
                      <span className="text-gray-400">{robOpLabel(op)}</span>
                      <span className="tabular-nums text-gray-500">{stolen > 0 ? `${formatNum(stolen)} ${resource}` : "—"}</span>
                      <span className="tabular-nums text-gray-500">{successes}✓{failures > 0 ? ` ${failures}✗` : ""}</span>
                      <span className="tabular-nums text-gray-500">{thievesLost > 0 ? formatNum(thievesLost) : "—"}</span>
                    </Fragment>
                  );
                })}
            </div>
            <div className="mt-0.5 text-gray-500">
              <span className="text-gray-600">By: </span>{thieveryContributors.slice(0, 3).join(", ")}{thieveryContributors.length > 3 ? ` +${thieveryContributors.length - 3} more` : ""}
            </div>
          </div>
        )}
        {sabotageOps.length > 0 && (
          <div className="mb-1 rounded border border-violet-900/70 bg-violet-950/30 p-1.5">
            <div className="text-violet-200">
              {sabotageOps.length} sabotage op{sabotageOps.length === 1 ? "" : "s"}
            </div>
            <div className="mt-1 grid grid-cols-[auto_1fr_auto_auto] gap-x-2 gap-y-0.5 text-gray-600">
              <span>Op</span><span>Result</span><span>✓/✗</span><span>Thieves Lost</span>
              {sabotageOps.map((op, i) => {
                let result: string;
                if (op.outcome === "failure") {
                  result = "failed";
                } else {
                  switch (op.op) {
                    case "night_strike":
                      result = op.troopsAssassinated != null ? `Assassinated ${formatNum(op.troopsAssassinated)} troops` : "Night Strike";
                      break;
                    case "kidnap":
                      result = op.kidnapped != null ? `Kidnapped ${formatNum(op.kidnapped)}` : "Kidnap";
                      break;
                    case "bribe_generals":
                      result = "Bribed a general";
                      break;
                    case "incite_riots":
                      result = op.effectDuration != null ? `Rioting ${op.effectDuration} days` : "Incite Riots";
                      break;
                    case "sabotage_wizards":
                      result = op.effectDuration === 0 ? "No lasting effect" : op.effectDuration != null ? `Sabotage ${op.effectDuration} days` : "Sabotage Wizards";
                      break;
                    case "arson":
                    case "greater_arson":
                      result = op.acresBurned === 0 ? "No buildings found" : op.acresBurned != null ? `Burned ${formatNum(op.acresBurned)} acres` : "Arson";
                      break;
                    case "destabilize_guilds":
                      result = op.effectDuration != null ? `Disrupted ${op.effectDuration} days` : "Destabilize Guilds";
                      break;
                    case "bribe_thieves":
                      result = "Bribed thieves";
                      break;
                    default:
                      result = op.op.replace(/_/g, " ");
                  }
                }
                const opLabel = op.op.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
                return (
                  <Fragment key={`${op.receivedAt}:${i}`}>
                    <span className="text-gray-400">{opLabel}</span>
                    <span className="truncate text-gray-500">{result}</span>
                    <span className="tabular-nums text-gray-500">{op.outcome === "success" ? "✓" : "✗"}</span>
                    <span className="tabular-nums text-gray-500">{op.thievesLost > 0 ? formatNum(op.thievesLost) : "—"}</span>
                  </Fragment>
                );
              })}
            </div>
            {(() => {
              const contributors = [...new Set(sabotageOps.map((op) => op.attackerName))];
              return (
                <div className="mt-0.5 text-gray-500">
                  <span className="text-gray-600">By: </span>
                  {contributors.slice(0, 3).join(", ")}{contributors.length > 3 ? ` +${contributors.length - 3} more` : ""}
                </div>
              );
            })()}
          </div>
        )}
        {sorceryOps.length > 0 && (
          <div className="mb-1 rounded border border-teal-900/70 bg-teal-950/30 p-1.5">
            <div className="text-teal-200">
              {sorceryOps.length} sorcery op{sorceryOps.length === 1 ? "" : "s"}
            </div>
            <div className="mt-1 grid grid-cols-[1fr_auto_auto] gap-x-2 gap-y-0.5 text-gray-600">
              <span>Spell</span><span>✓/✗</span><span>Dur.</span>
              {sorceryOps.slice(0, 8).map((op, i) => (
                <Fragment key={`${op.receivedAt}:${i}`}>
                  <span className="truncate text-gray-400">{op.spell}</span>
                  <span className="tabular-nums text-gray-500">{op.outcome === "success" ? "✓" : "✗"}</span>
                  <span className="tabular-nums text-gray-500">{op.durationDays != null ? `${op.durationDays}d` : "—"}</span>
                </Fragment>
              ))}
            </div>
            {sorceryOps.length > 8 && <div className="mt-0.5 text-gray-600">+{sorceryOps.length - 8} more</div>}
            {(() => {
              const contributors = [...new Set(sorceryOps.map((op) => op.casterName))];
              return (
                <div className="mt-0.5 text-gray-500">
                  <span className="text-gray-600">By: </span>
                  {contributors.slice(0, 3).join(", ")}{contributors.length > 3 ? ` +${contributors.length - 3} more` : ""}
                </div>
              );
            })()}
          </div>
        )}
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
                  {m.sources.length > 0 && <span>{truncateList(m.sources)}</span>}
                  {m.sources.length > 0 && m.savedBy.length > 0 && <span> · </span>}
                  {m.savedBy.length > 0 && <span>{truncateList(m.savedBy)}</span>}
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
  const [hideAttacks, setHideAttacks] = useState(false);
  const [hideThievery, setHideThievery] = useState(false);
  const [hideSabotageOps, setHideOtherOps] = useState(false);
  const [hideSorcery, setHideSorcery] = useState(false);
  const [open, setOpen] = useState(false);
  const [hoveredLine, setHoveredLine] = useState<MetricKey | null>(null);
  const [tz, setTz] = useState<"UTC" | "local">("UTC");
  const [containerWidth, setContainerWidth] = useState(800);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setContainerWidth(entry.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  if (history.length < 2) return null;

  const { rows: data, bucketMs } = useMemo(() => buildRows(history, tz), [history, tz]);
  const visibleMetrics = METRICS.filter((m) => !hidden.has(m.key));
  const hasLarge = visibleMetrics.some((m) => m.axis === "large");
  const hasSmall = visibleMetrics.some((m) => m.axis === "small");
  const hasAttackMarkers = data.some((r) => r.attackLosses != null);
  const hasThieveryMarkers = data.some((r) => r.thieveryAmountStolen != null);
  const hasSabotageOpsMarkers = data.some((r) => r.thieveryOpsCount != null);
  const hasSorceryMarkers = data.some((r) => r.sorceryOpsCount != null);
  const hasLargeAxis = hasLarge || (hasThieveryMarkers && !hideThievery);
  const hasSmallAxis = hasSmall || (hasAttackMarkers && !hideAttacks) || (hasSabotageOpsMarkers && !hideSabotageOps) || (hasSorceryMarkers && !hideSorcery);
  const bucketed = data.some((r) => r.bucketed);

  const tzLabel = tz === "UTC" ? "UTC" : LOCAL_TZ_LABEL;
  const summary = `${history.length} snapshot${history.length === 1 ? "" : "s"} from ${chartLabel(history[0].receivedAt, tz)} to ${chartLabel(history[history.length - 1].receivedAt, tz)} ${tzLabel}`;

  const narrow = containerWidth < 480;
  const axisWidth = narrow ? 38 : 52;
  const chartHeight = narrow ? 320 : 280;
  const tooltipMaxWidth = Math.max(220, containerWidth - 32);
  const axisStyle = { fill: "#6b7280", fontSize: 10 };

  return (
    <section ref={containerRef} className="mt-6 rounded-lg border border-gray-800 bg-gray-900/50 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-gray-100">Province History</h2>
          <div className="text-xs text-gray-500">
            {summary}{bucketed && ` · bucketed into ${data.length} × ${formatBucketWidth(bucketMs)} windows (most recent per window)`}
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
          <ResponsiveContainer width="100%" height={chartHeight}>
            <ComposedChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
              <XAxis dataKey="label" tick={axisStyle} tickLine={false} axisLine={false} minTickGap={40} />
              <YAxis yAxisId="large" tick={axisStyle} tickLine={false} axisLine={false}
                width={hasLargeAxis ? axisWidth : 0}
                tickFormatter={(v) => formatNum(Number(v))} hide={!hasLargeAxis} />
              <YAxis yAxisId="small" orientation="right" tick={axisStyle} tickLine={false} axisLine={false}
                width={hasSmallAxis ? axisWidth : 0}
                tickFormatter={(v) => formatNum(Number(v))} hide={!hasSmallAxis} />
              <Tooltip wrapperStyle={{ zIndex: 10 }} content={(props) => <ChartTooltip {...(props as TooltipContentProps<number, string>)} tz={tz} hideAttacks={hideAttacks} hideThievery={hideThievery} hideSabotageOps={hideSabotageOps} hideSorcery={hideSorcery} maxWidth={tooltipMaxWidth} />} />
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
              <Scatter
                yAxisId="small"
                dataKey="attackLosses"
                name="Attacks taken"
                fill="#fb7185"
                shape="diamond"
                legendType="diamond"
                hide={hideAttacks}
              />
              <Scatter
                yAxisId="large"
                dataKey="thieveryAmountStolen"
                name="Thievery ops"
                fill="#fbbf24"
                shape="triangle"
                legendType="triangle"
                hide={hideThievery}
              />
              <Scatter
                yAxisId="small"
                dataKey="thieveryOpsCount"
                name="Sabotage ops"
                fill="#a78bfa"
                shape="circle"
                legendType="circle"
                hide={hideSabotageOps}
              />
              <Scatter
                yAxisId="small"
                dataKey="sorceryOpsCount"
                name="Sorcery ops"
                fill="#2dd4bf"
                shape="star"
                legendType="star"
                hide={hideSorcery}
              />
            </ComposedChart>
          </ResponsiveContainer>
          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1.5">
            {METRICS.map((m) => {
              const isHidden = hidden.has(m.key);
              return (
                <button
                  key={m.key}
                  type="button"
                  onClick={() => setHidden((prev) => { const next = new Set(prev); if (next.has(m.key)) next.delete(m.key); else next.add(m.key); return next; })}
                  className="flex items-center gap-1.5 text-xs transition-opacity"
                  style={{ opacity: isHidden ? 0.5 : 1 }}
                >
                  <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: m.color }} />
                  <span style={{ color: isHidden ? "#6b7280" : "#d1d5db" }}>{m.label}</span>
                </button>
              );
            })}
            <button
              type="button"
              onClick={() => setHideAttacks((prev) => !prev)}
              className="flex items-center gap-1.5 text-xs transition-opacity"
              style={{ opacity: hideAttacks ? 0.5 : 1 }}
            >
              <span className="inline-block h-2.5 w-2.5 shrink-0 rotate-45 rounded-sm" style={{ background: "#fb7185" }} />
              <span style={{ color: hideAttacks ? "#6b7280" : "#d1d5db" }}>Attacks</span>
            </button>
            <button
              type="button"
              onClick={() => setHideThievery((prev) => !prev)}
              className="flex items-center gap-1.5 text-xs transition-opacity"
              style={{ opacity: hideThievery ? 0.5 : 1 }}
            >
              <span className="inline-block h-0 w-0 shrink-0 border-x-[5px] border-b-[9px] border-x-transparent" style={{ borderBottomColor: "#fbbf24" }} />
              <span style={{ color: hideThievery ? "#6b7280" : "#d1d5db" }}>Thievery</span>
            </button>
            <button
              type="button"
              onClick={() => setHideOtherOps((prev) => !prev)}
              className="flex items-center gap-1.5 text-xs transition-opacity"
              style={{ opacity: hideSabotageOps ? 0.5 : 1 }}
            >
              <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: "#a78bfa" }} />
              <span style={{ color: hideSabotageOps ? "#6b7280" : "#d1d5db" }}>Sabotage</span>
            </button>
            <button
              type="button"
              onClick={() => setHideSorcery((prev) => !prev)}
              className="flex items-center gap-1.5 text-xs transition-opacity"
              style={{ opacity: hideSorcery ? 0.5 : 1 }}
            >
              <span className="inline-block h-2.5 w-2.5 shrink-0" style={{ background: "#2dd4bf", clipPath: "polygon(50% 0%, 61% 35%, 98% 35%, 68% 57%, 79% 91%, 50% 70%, 21% 91%, 32% 57%, 2% 35%, 39% 35%)" }} />
              <span style={{ color: hideSorcery ? "#6b7280" : "#d1d5db" }}>Sorcery</span>
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
