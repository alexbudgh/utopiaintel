"use client";

import React, { useState } from "react";
import { ReferenceLine } from "recharts";
import type { HistoryEventMarker } from "@/lib/db-types";
import { parseUtc } from "@/lib/ui";

export type VisibleHistoryEventMarker = HistoryEventMarker & { t: number };

const DRAGON_TYPE_COLORS: Record<string, string> = {
  topaz: "#fbbf24",
  sapphire: "#38bdf8",
  ruby: "#f87171",
  emerald: "#4ade80",
  lightning: "#22d3ee",
  shadow: "#a78bfa",
  ice: "#bae6fd",
  fire: "#fb923c",
};

function dragonTypeColor(type: string): string {
  return DRAGON_TYPE_COLORS[type.toLowerCase()] ?? "#fb923c";
}

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
  if (marker.id.startsWith("ritual_ended:")) return "#6b7280";
  if (marker.id.startsWith("ritual:")) return "#c084fc";
  if (marker.id.startsWith("dragon_arrived:")) return "#f87171";
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
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  return (
    <>
      {markers.map((marker) => {
        const color = markerColor(marker);
        const isHovered = hoveredId === marker.id;
        return (
          <ReferenceLine
            key={marker.id}
            x={marker.t}
            yAxisId={yAxisId}
            stroke={color}
            strokeDasharray="4 4"
            strokeWidth={isHovered ? 2.5 : 1.5}
            ifOverflow="visible"
            label={(props: {
              viewBox?: { x?: number; y?: number; height?: number };
            }) => {
              const vb = props.viewBox;
              if (!vb) return null;
              const x = vb.x ?? 0;
              const y = vb.y ?? 0;
              const h = vb.height ?? 200;
              return (
                <g
                  onMouseEnter={() => setHoveredId(marker.id)}
                  onMouseLeave={() => setHoveredId(null)}
                >
                  <rect
                    x={x - 8}
                    y={y}
                    width={16}
                    height={h}
                    fill="transparent"
                    style={{ cursor: "default" }}
                  />
                  {isHovered && (
                    <>
                      <text
                        x={x}
                        y={y + 14}
                        textAnchor="middle"
                        fill={color}
                        stroke="rgba(17,24,39,0.85)"
                        strokeWidth={3}
                        paintOrder="stroke fill"
                        fontSize={10}
                        fontWeight={600}
                        style={{ pointerEvents: "none" }}
                      >
                        {marker.label}
                      </text>
                      {marker.date && (
                        <text
                          x={x}
                          y={y + 26}
                          textAnchor="middle"
                          fill="#d1d5db"
                          stroke="rgba(17,24,39,0.85)"
                          strokeWidth={3}
                          paintOrder="stroke fill"
                          fontSize={9}
                          style={{ pointerEvents: "none" }}
                        >
                          {marker.date}
                        </text>
                      )}
                    </>
                  )}
                </g>
              );
            }}
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
  const groups = MARKER_CATEGORIES.map((cat) => ({
    cat,
    items: markers
      .filter((m) => markerCategory(m) === cat.key)
      .sort((a, b) => a.t - b.t),
  })).filter((g) => g.items.length > 0);

  if (groups.length === 0) return null;

  return (
    <table className="text-xs border-collapse">
      <thead>
        <tr className="text-gray-600 font-normal">
          <th className="pb-1 pr-1.5 w-3 font-normal text-center" />
          <th className="pb-1 pr-2 font-normal" />
          <th className="pb-1 pr-2 font-normal text-left">Type</th>
          <th className="pb-1 pr-3 font-normal text-left">Event</th>
          <th className="pb-1 pr-3 font-normal text-left">Kingdom</th>
          <th className="pb-1 font-normal text-left">Date</th>
        </tr>
      </thead>
      <tbody>
        {groups.map(({ cat, items }) => (
          <React.Fragment key={cat.key}>
            <tr>
              <td
                colSpan={6}
                className="pt-2 pb-0.5 font-medium"
                style={{ color: cat.color }}
              >
                {cat.label}
              </td>
            </tr>
            {items.map((marker) => (
              <tr key={marker.id} title={marker.date ?? undefined}>
                <td className="pr-1.5 w-3 text-center text-gray-500">
                  {marker.direction === "out"
                    ? "↑"
                    : marker.direction === "in"
                      ? "↓"
                      : ""}
                </td>
                <td className="pr-2">
                  <span
                    className="inline-block h-3 w-0 border-l border-dashed"
                    style={{ borderColor: markerColor(marker) }}
                  />
                </td>
                <td className="pr-2 whitespace-nowrap">
                  {marker.dragonType ? (
                    <span
                      className="rounded px-1 py-px text-[10px] font-semibold leading-tight"
                      style={{
                        color: dragonTypeColor(marker.dragonType),
                        background: `${dragonTypeColor(marker.dragonType)}22`,
                        border: `1px solid ${dragonTypeColor(marker.dragonType)}55`,
                      }}
                    >
                      {marker.dragonType}
                    </span>
                  ) : null}
                </td>
                <td className="pr-3 whitespace-nowrap text-gray-300">
                  {marker.dragonName ? (
                    <span className="italic">
                      &ldquo;{marker.dragonName}&rdquo;
                    </span>
                  ) : (
                    marker.label
                  )}
                  {marker.dragonType && (
                    <span className="ml-1 text-gray-500">{marker.label}</span>
                  )}
                </td>
                <td className="pr-3 whitespace-nowrap text-gray-500 font-mono text-[11px]">
                  {marker.kingdom ?? ""}
                </td>
                <td className="text-gray-500 whitespace-nowrap">
                  {formatTime(marker)}
                </td>
              </tr>
            ))}
          </React.Fragment>
        ))}
      </tbody>
    </table>
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
