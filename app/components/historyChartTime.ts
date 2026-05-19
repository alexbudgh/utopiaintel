import { parseUtc } from "@/lib/ui";

export type HistoryChartTimezone = "UTC" | "local";

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

export function filterHistoryByDateRange<T extends { receivedAt: string }>(
  history: T[],
  fromMs: number | null,
  toMs: number | null,
): T[] {
  if (history.length === 0) return history;
  let filtered = history;
  if (fromMs != null) {
    filtered = filtered.filter(
      (p) => historyChartTimeMs(p.receivedAt) >= fromMs,
    );
  }
  if (toMs != null) {
    filtered = filtered.filter((p) => historyChartTimeMs(p.receivedAt) <= toMs);
  }
  return filtered.length > 0 ? filtered : history.slice(-1);
}
