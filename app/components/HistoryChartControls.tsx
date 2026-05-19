"use client";

import { HistoryEventToggle } from "./HistoryEventMarkers";
import {
  UtopiaDateRangeControls,
  type UtopiaDateRangeValue,
} from "./UtopiaDateRangeControls";
import {
  LOCAL_HISTORY_TZ_LABEL,
  type HistoryChartTimezone,
} from "./historyChartTime";

export function HistoryChartControls({
  tz,
  onTimezoneToggle,
  hideEventMarkers,
  onEventMarkersToggle,
  hasEventMarkers,
  dateRange,
  onDateRangeChange,
  warDate,
  children,
}: {
  tz: HistoryChartTimezone;
  onTimezoneToggle: () => void;
  hideEventMarkers: boolean;
  onEventMarkersToggle: () => void;
  hasEventMarkers: boolean;
  dateRange: UtopiaDateRangeValue;
  onDateRangeChange: (v: UtopiaDateRangeValue) => void;
  warDate?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <UtopiaDateRangeControls
        value={dateRange}
        onChange={onDateRangeChange}
        latestWarDate={warDate}
      />
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
