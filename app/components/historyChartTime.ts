import { parseUtc } from "@/lib/ui";

export type HistoryChartTimezone = "UTC" | "local";
export type HistoryChartRange = "3d" | "7d" | "14d" | "war" | "all";

export const DEFAULT_HISTORY_CHART_RANGE: HistoryChartRange = "3d";

export const HISTORY_CHART_RANGE_OPTIONS: Array<{
  value: HistoryChartRange;
  label: string;
}> = [
  { value: "3d", label: "3d" },
  { value: "7d", label: "7d" },
  { value: "14d", label: "14d" },
  { value: "all", label: "All" },
];

export const LOCAL_HISTORY_TZ_LABEL =
  new Intl.DateTimeFormat("en", { timeZoneName: "shortOffset" })
    .formatToParts(new Date())
    .find((p) => p.type === "timeZoneName")?.value ?? "Local";

export function historyChartTimeMs(iso: string): number {
  return parseUtc(iso);
}

export function historyChartLabelFromMs(
  ms: number,
  tz: HistoryChartTimezone,
): string {
  const d = new Date(ms);
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: tz === "UTC" ? "UTC" : undefined,
  });
}

export function historyChartLabel(
  iso: string,
  tz: HistoryChartTimezone,
): string {
  return historyChartLabelFromMs(historyChartTimeMs(iso), tz);
}

export function filterHistoryByRange<T extends { receivedAt: string }>(
  history: T[],
  range: HistoryChartRange,
  rangeStartMs?: number,
): T[] {
  if (range === "all" || history.length === 0) return history;
  const latest = Math.max(
    ...history.map((point) => historyChartTimeMs(point.receivedAt)),
  );
  const cutoff =
    range === "war" && rangeStartMs != null
      ? rangeStartMs
      : latest - Number(range.replace("d", "")) * 24 * 60 * 60 * 1000;
  const filtered = history.filter(
    (point) => historyChartTimeMs(point.receivedAt) >= cutoff,
  );
  return filtered.length > 0 ? filtered : history.slice(-1);
}
