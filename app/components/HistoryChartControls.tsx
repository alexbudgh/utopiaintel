"use client";

import { HistoryEventToggle } from "./HistoryEventMarkers";
import {
  HISTORY_CHART_RANGE_OPTIONS,
  LOCAL_HISTORY_TZ_LABEL,
  type HistoryChartRange,
  type HistoryChartTimezone,
} from "./historyChartTime";

export function HistoryChartControls({
  tz,
  onTimezoneToggle,
  hideEventMarkers,
  onEventMarkersToggle,
  hasEventMarkers,
  range,
  onRangeChange,
  hasWarRange = false,
  children,
}: {
  tz: HistoryChartTimezone;
  onTimezoneToggle: () => void;
  hideEventMarkers: boolean;
  onEventMarkersToggle: () => void;
  hasEventMarkers: boolean;
  range: HistoryChartRange;
  onRangeChange: (range: HistoryChartRange) => void;
  hasWarRange?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        value={range}
        onChange={(event) =>
          onRangeChange(event.target.value as HistoryChartRange)
        }
        className="rounded border border-gray-700 bg-gray-900 px-2.5 py-1 text-xs text-gray-300 outline-none transition-colors hover:border-gray-500 hover:text-gray-100 focus:border-gray-500"
        title="History time range"
      >
        {range === "war" && <option value="war">Since war</option>}
        {HISTORY_CHART_RANGE_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {hasWarRange && (
        <button
          type="button"
          onClick={() => onRangeChange("war")}
          className={`inline-flex items-center rounded border px-2.5 py-1 text-xs transition-colors ${
            range === "war"
              ? "border-amber-700/60 bg-amber-950/30 text-amber-300"
              : "border-gray-700 bg-gray-900 text-gray-400 hover:border-amber-700/60 hover:text-amber-300"
          }`}
        >
          Since war
        </button>
      )}
      <button
        type="button"
        onClick={onTimezoneToggle}
        className="inline-flex items-center rounded border border-gray-700 bg-gray-900 px-2.5 py-1 text-xs text-gray-400 transition-colors hover:border-gray-500 hover:text-gray-100"
        title={tz === "UTC" ? "Switch to local time" : "Switch to UTC"}
      >
        {tz === "UTC" ? "UTC" : `Local (${LOCAL_HISTORY_TZ_LABEL})`}
      </button>
      <HistoryEventToggle
        hidden={hideEventMarkers}
        onToggle={onEventMarkersToggle}
        disabled={!hasEventMarkers}
      />
      {children}
    </div>
  );
}
