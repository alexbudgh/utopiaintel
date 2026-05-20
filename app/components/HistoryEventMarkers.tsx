"use client";

import { ReferenceLine } from "recharts";
import type { HistoryEventMarker } from "@/lib/db-types";
import { parseUtc } from "@/lib/ui";

export type VisibleHistoryEventMarker = HistoryEventMarker & { t: number };

export const MARKER_CATEGORIES = [
  { key: "war", label: "War", color: "#fbbf24" },
  { key: "ritual", label: "Ritual", color: "#c084fc" },
  { key: "dragon", label: "Dragon", color: "#fb923c" },
] as const;

export type MarkerCategory = (typeof MARKER_CATEGORIES)[number]["key"];

export function markerCategory(marker: HistoryEventMarker): MarkerCategory {
  if (marker.id.startsWith("ritual")) return "ritual";
  if (marker.id.startsWith("dragon")) return "dragon";
  return "war";
}

function markerColor(marker: HistoryEventMarker): string {
  if (marker.id.startsWith("war_victory:")) return "#4ade80";
  if (marker.id.startsWith("war_defeat:")) return "#f87171";
  if (marker.id.startsWith("ritual_active:")) return "#22d3ee";
  if (marker.id.startsWith("ritual:")) return "#c084fc";
  if (marker.id.startsWith("dragon_against:")) return "#fb923c";
  if (marker.id.startsWith("dragon_by:")) return "#38bdf8";
  if (marker.id.startsWith("dragon_slain:")) return "#86efac";
  return "#fbbf24";
}

export function historyEventMarkerTime(marker: HistoryEventMarker): number {
  return parseUtc(marker.at);
}

export function visibleHistoryEventMarkers(
  markers: HistoryEventMarker[],
  domainStart: number,
  domainEnd: number,
): VisibleHistoryEventMarker[] {
  return markers
    .map((marker) => ({ ...marker, t: historyEventMarkerTime(marker) }))
    .filter(
      (marker) =>
        Number.isFinite(marker.t) &&
        marker.t >= domainStart &&
        marker.t <= domainEnd,
    );
}

export function HistoryEventReferenceLines({
  markers,
  yAxisId,
}: {
  markers: VisibleHistoryEventMarker[];
  yAxisId?: string;
}) {
  return (
    <>
      {markers.map((marker) => {
        const color = markerColor(marker);
        return (
          <ReferenceLine
            key={marker.id}
            x={marker.t}
            yAxisId={yAxisId}
            stroke={color}
            strokeDasharray="4 4"
            strokeWidth={1.5}
            ifOverflow="visible"
          />
        );
      })}
    </>
  );
}

export function HistoryEventLegend({
  markers,
  formatTime,
}: {
  markers: VisibleHistoryEventMarker[];
  formatTime: (marker: VisibleHistoryEventMarker) => string;
}) {
  return (
    <>
      {markers.map((marker) => (
        <div
          key={marker.id}
          className="flex items-center gap-1.5 text-xs text-gray-300"
          title={marker.detail ?? undefined}
        >
          <span
            className="inline-block h-3 w-0 shrink-0 border-l border-dashed"
            style={{ borderColor: markerColor(marker) }}
          />
          <span>
            {marker.label}
            <span className="ml-1 text-gray-500">{formatTime(marker)}</span>
          </span>
        </div>
      ))}
    </>
  );
}

export function HistoryEventToggles({
  markers,
  hiddenCategories,
  onToggle,
}: {
  markers: HistoryEventMarker[];
  hiddenCategories: Set<string>;
  onToggle: (category: string) => void;
}) {
  const presentCategories = MARKER_CATEGORIES.filter((cat) =>
    markers.some((m) => markerCategory(m) === cat.key),
  );
  if (presentCategories.length === 0) return null;
  return (
    <>
      {presentCategories.map((cat) => {
        const hidden = hiddenCategories.has(cat.key);
        return (
          <button
            key={cat.key}
            type="button"
            onClick={() => onToggle(cat.key)}
            className="inline-flex items-center gap-1.5 rounded border border-gray-700 bg-gray-900 px-2.5 py-1 text-xs text-gray-300 transition-colors hover:border-gray-500 hover:text-gray-100"
            style={{ opacity: hidden ? 0.55 : undefined }}
            title={`${hidden ? "Show" : "Hide"} ${cat.label} markers`}
          >
            <span
              className="inline-block h-3 w-0 shrink-0 border-l border-dashed"
              style={{ borderColor: cat.color }}
            />
            {cat.label}
          </button>
        );
      })}
    </>
  );
}
