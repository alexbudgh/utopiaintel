"use client";

import { useState } from "react";
import { KingdomViewShell } from "./KingdomTabs";
import { UtopiaDateRangeFilter } from "./UtopiaDateRangeFilter";
import type {
  IncomingProvinceEvent,
  IncomingDamageProvinceStat,
  IncomingDamageStats,
} from "@/lib/db-api";

// Explicitly good events
const POSITIVE_EVENTS = new Set([
  "aid_received",
  "monthly_dedication",
  "war_victory_reward",
  "utopian_lords_reward",
  "new_scientist",
  "exploration",
  "thief_foiled",
  "thief_foiled_shadowlight",
  "attack_failed",
]);

// Neutral: informational or ambiguous
const NEUTRAL_EVENTS = new Set([
  "thief_detected",
  "thief_detected_unknown",
  "spell_detected",
  "war_ended",
  "war_loss_penalty",
  "starvation",
  "ritual_shortened",
  "plague_ended",
  "inactivity_penalty",
  "desertions",
  "other",
]);

const CONSOLIDATED_RESOURCE_EVENTS = new Set([
  "attack_plunder",
  "aid_received",
]);

const DISPLAY_EVENT_GROUPS: Record<string, string> = {
  thief_detected_unknown: "thief_detected",
  thief_foiled_shadowlight: "thief_foiled",
};

const RESOURCE_ORDER = [
  "gold",
  "food",
  "runes",
  "soldiers",
  "peasants",
  "troops",
  "acres",
  "buildings",
  "books",
  "horses",
];

const LABELS: Record<string, string> = {
  // Thievery — incoming damage
  troops_killed: "Night Strike",
  peasants_kidnapped: "Kidnap",
  rioting: "Incite Riots",
  turncoat_general: "Bribe Generals",
  turncoat_thieves: "Bribe Thieves",
  thief_sabotage_wizards: "Sabotage Wizards",
  arson: "Arson",
  thief_propaganda: "Propaganda",
  spell_expose_thieves: "Thieves Exposed",
  // Thievery — positive (we caught them)
  thief_detected: "Thief Detected",
  thief_detected_unknown: "Thief Detected",
  thief_foiled: "Attempt Foiled",
  thief_foiled_shadowlight: "Attempt Foiled",
  // Spells — incoming damage
  spell_fools_gold: "Fool's Gold",
  spell_fireball: "Fireball",
  spell_lightning: "Lightning Strike",
  spell_meteor_start: "Meteor Shower",
  spell_meteor: "Meteor Shower",
  spell_blizzard: "Blizzard",
  spell_gluttony: "Gluttony",
  spell_greed: "Greed",
  spell_explosions: "Explosions",
  spell_tornado: "Tornado",
  spell_land_lust: "Land Lust",
  spell_mystic_vortex: "Mystic Vortex",
  spell_drought: "Drought",
  spell_pitfalls: "Pitfalls",
  spell_chastity: "Chastity",
  spell_sloth: "Sloth",
  spell_nightmares: "Nightmares",
  spell_vermin: "Vermin",
  spell_storms: "Storms",
  // Spells — positive
  spell_detected: "Wizard Detected",
  // Attacks
  attack_trad_march: "Attack (Traditional March)",
  attack_conquest: "Attack (Conquest)",
  attack_learn: "Attack (Learn)",
  attack_plunder: "Attack (Plunder)",
  attack_razed: "Attack (Raze)",
  attack_ambush: "Ambush",
  attack_failed: "Attack Repelled",
  attack_massacre: "Massacre",
  // Dragon
  dragon_damage: "Dragon Damage",
  // Neutral/friendly
  aid_received: "Aid Received",
  exploration: "Exploration",
  monthly_dedication: "Monthly Dedication",
  war_ended: "War Ended",
  war_loss_penalty: "War Loss Penalty",
  war_victory_reward: "War Victory Reward",
  starvation: "Starvation",
  ritual_shortened: "Ritual Shortened",
  plague_ended: "Plague Ended",
  utopian_lords_reward: "Utopian Lords Reward",
  new_scientist: "New Scientist",
  inactivity_penalty: "Inactivity Penalty",
  desertions: "Desertions",
};

function getLabel(eventType: string, resourceType: string | null): string {
  if (eventType === "resource_stolen") {
    if (resourceType === "gold") return "Rob Vaults";
    if (resourceType === "food") return "Rob Granaries";
    if (resourceType === "runes") return "Rob Towers";
    if (resourceType === "horses") return "Horses Stolen";
    return "Resources Stolen";
  }
  if (eventType === "aid_received" && resourceType) {
    const res = resourceType.charAt(0).toUpperCase() + resourceType.slice(1);
    return `Aid Received (${res})`;
  }
  const base = LABELS[eventType] ?? eventType;
  if (eventType === "thief_propaganda" && resourceType)
    return `${base} (${resourceType})`;
  return base;
}

function getResourceLabel(resourceType: string): string {
  return resourceType.charAt(0).toUpperCase() + resourceType.slice(1);
}

function getSummaryStr(e: IncomingProvinceEvent): string | null {
  if (e.totalAmount === 0) return null;
  const n = e.totalAmount.toLocaleString();
  const res = e.resourceType ?? "";
  switch (e.eventType) {
    case "resource_stolen":
      return `${n} ${res} stolen`;
    case "attack_learn":
      return `${n} books learned`;
    case "attack_trad_march":
      return `${n} acres taken`;
    case "attack_conquest":
      return `${n} acres taken`;
    case "attack_razed":
      return `${n} buildings razed`;
    case "attack_ambush":
      return `${n} acres recaptured`;
    case "attack_plunder":
      return `${n} ${res} plundered`;
    case "troops_killed":
      return `${n} troops killed`;
    case "peasants_kidnapped":
      return `${n} peasants kidnapped`;
    case "arson":
      return `${n} acres burned`;
    case "thief_propaganda":
      return `${n} deserters`;
    case "spell_fools_gold":
      return `${n} gold destroyed`;
    case "spell_lightning":
      return `${n} runes destroyed`;
    case "spell_vermin":
      return `${n} food destroyed`;
    case "spell_fireball":
      return `${n} peasants`;
    case "spell_meteor":
      return `${n} ${res}`;
    case "spell_nightmares":
      return `${n} troops disrupted`;
    case "spell_tornado":
      return `${n} buildings`;
    case "spell_land_lust":
      return `${n} acres`;
    // Duration-based spells store days, not resource amounts — fall through to getAmountStr → "N days"
    default:
      return getAmountStr(e);
  }
}

// Maps event types to the unit suffix for their amount field.
// resource_type is used as the unit when the string is "".
const AMOUNT_UNITS: Partial<Record<string, string>> = {
  attack_learn: " books",
  attack_trad_march: " acres",
  attack_conquest: " acres",
  attack_razed: " buildings",
  attack_ambush: " acres",
  troops_killed: " troops",
  peasants_kidnapped: " peasants",
  arson: " acres",
  thief_propaganda: " deserters",
  spell_fireball: " peasants",
  spell_lightning: " runes",
  spell_meteor_start: " days", // duration of shower, not troops
  spell_blizzard: " days", // duration, not troops
  spell_gluttony: " days", // duration of food drain, not food amount
  spell_greed: " days", // duration of upkeep surcharge, not gold
  spell_explosions: " days", // duration, not buildings
  spell_tornado: " buildings",
  spell_land_lust: " acres",
  spell_drought: " days", // duration of harvest penalty, not food
  spell_pitfalls: " days", // duration, not troops
  spell_chastity: " days", // duration, not pop
  spell_sloth: " days", // duration of draft penalty
  spell_nightmares: " troops disrupted",
  spell_vermin: " food",
  spell_fools_gold: " gold",
  dragon_damage: " troops",
  exploration: " acres",
};

function isResourceBasedEvent(e: IncomingProvinceEvent): boolean {
  switch (e.eventType) {
    case "resource_stolen":
    case "attack_plunder":
    case "aid_received":
    case "spell_meteor":
    case "monthly_dedication":
      return true;
  }
  return false;
}

function getAmountStr(e: IncomingProvinceEvent): string | null {
  if (e.totalAmount === 0) return null;
  if (!isResourceBasedEvent(e) && !(e.eventType in AMOUNT_UNITS)) return null;
  const unit = isResourceBasedEvent(e)
    ? ` ${e.resourceType ?? ""}`
    : AMOUNT_UNITS[e.eventType]!;
  return `${e.totalAmount.toLocaleString()}${unit}`;
}

type ViewMode = "province" | "op";

interface OperationRow {
  provinceName: string;
  events: IncomingProvinceEvent[];
  totalCount: number;
  totalAmount: number;
  amountsByResource: Map<string, number>;
}

interface OperationGroup {
  key: string;
  eventType: string;
  resourceType: string | null;
  rows: OperationRow[];
  rowByProvince: Map<string, OperationRow>;
  resourceTypes: string[];
  totalsByResource: Map<string, number>;
  totalCount: number;
  totalAmount: number;
}

function eventKey(e: IncomingProvinceEvent): string {
  const displayEventType = DISPLAY_EVENT_GROUPS[e.eventType] ?? e.eventType;
  if (
    displayEventType !== e.eventType ||
    Object.values(DISPLAY_EVENT_GROUPS).includes(displayEventType)
  ) {
    return displayEventType;
  }
  if (CONSOLIDATED_RESOURCE_EVENTS.has(displayEventType))
    return displayEventType;
  return `${displayEventType}|${e.resourceType ?? ""}`;
}

function impactValue(row: OperationRow): number {
  return row.totalAmount || row.totalCount;
}

function sortResourceTypes(resources: Iterable<string>): string[] {
  return [...resources].sort((a, b) => {
    const ai = RESOURCE_ORDER.indexOf(a);
    const bi = RESOURCE_ORDER.indexOf(b);
    if (ai !== -1 || bi !== -1) {
      if (ai === -1) return 1;
      if (bi === -1) return -1;
      return ai - bi;
    }
    return a.localeCompare(b);
  });
}

function formatResourceTotals(totals: Map<string, number>): string | null {
  const parts = sortResourceTypes(totals.keys())
    .map((resourceType) => {
      const total = totals.get(resourceType) ?? 0;
      return total > 0 ? `${total.toLocaleString()} ${resourceType}` : null;
    })
    .filter((part): part is string => part != null);
  return parts.length > 0 ? parts.join(", ") : null;
}

function buildOperationGroups(stats: IncomingDamageStats): OperationGroup[] {
  const byOperation = new Map<string, OperationGroup>();

  for (const stat of stats.provinces) {
    for (const event of stat.events) {
      const key = eventKey(event);
      let group = byOperation.get(key);
      if (!group) {
        const displayEventType =
          DISPLAY_EVENT_GROUPS[event.eventType] ?? event.eventType;
        group = {
          key,
          eventType: displayEventType,
          resourceType:
            displayEventType === event.eventType &&
            !CONSOLIDATED_RESOURCE_EVENTS.has(event.eventType)
              ? event.resourceType
              : null,
          rows: [],
          rowByProvince: new Map(),
          resourceTypes: [],
          totalsByResource: new Map(),
          totalCount: 0,
          totalAmount: 0,
        };
        byOperation.set(key, group);
      }

      let row = group.rowByProvince.get(stat.provinceName);
      if (!row) {
        row = {
          provinceName: stat.provinceName,
          events: [],
          totalCount: 0,
          totalAmount: 0,
          amountsByResource: new Map(),
        };
        group.rowByProvince.set(stat.provinceName, row);
        group.rows.push(row);
      }

      row.events.push(event);
      row.totalCount += event.count;
      row.totalAmount += event.totalAmount;
      group.totalCount += event.count;
      group.totalAmount += event.totalAmount;

      if (event.resourceType) {
        row.amountsByResource.set(
          event.resourceType,
          (row.amountsByResource.get(event.resourceType) ?? 0) +
            event.totalAmount,
        );
        group.totalsByResource.set(
          event.resourceType,
          (group.totalsByResource.get(event.resourceType) ?? 0) +
            event.totalAmount,
        );
      }
    }
  }

  const groups = [...byOperation.values()];
  for (const group of groups) {
    group.resourceTypes = sortResourceTypes(group.totalsByResource.keys());
    group.rows.sort(
      (a, b) =>
        impactValue(b) - impactValue(a) ||
        b.totalCount - a.totalCount ||
        a.provinceName.localeCompare(b.provinceName),
    );
  }

  return groups.sort((a, b) => {
    const aIsPositive = POSITIVE_EVENTS.has(a.eventType) ? 1 : 0;
    const bIsPositive = POSITIVE_EVENTS.has(b.eventType) ? 1 : 0;
    if (aIsPositive !== bIsPositive) return aIsPositive - bIsPositive;

    const aIsNeutral = NEUTRAL_EVENTS.has(a.eventType) ? 1 : 0;
    const bIsNeutral = NEUTRAL_EVENTS.has(b.eventType) ? 1 : 0;
    if (aIsNeutral !== bIsNeutral) return aIsNeutral - bIsNeutral;

    return (
      b.totalAmount - a.totalAmount ||
      b.totalCount - a.totalCount ||
      getLabel(a.eventType, a.resourceType).localeCompare(
        getLabel(b.eventType, b.resourceType),
      )
    );
  });
}

function EventRow({ e }: { e: IncomingProvinceEvent }) {
  const isPositive = POSITIVE_EVENTS.has(e.eventType);
  const isNeutral = NEUTRAL_EVENTS.has(e.eventType);
  const label = getLabel(e.eventType, e.resourceType);
  const amountStr = getAmountStr(e);
  const labelColor = isPositive
    ? "text-green-400"
    : isNeutral
      ? "text-gray-400"
      : "text-gray-300";
  const amtColor = isPositive
    ? "text-green-500"
    : isNeutral
      ? "text-gray-500"
      : amountStr
        ? "text-red-400"
        : "text-gray-700";

  return (
    <tr className="border-b border-gray-800/30">
      <td className={`py-1 pr-4 text-xs ${labelColor}`}>{label}</td>
      <td className="text-right font-mono text-xs py-1 px-2 text-gray-500">
        {e.count.toLocaleString()}
      </td>
      <td className={`text-right font-mono text-xs py-1 pl-2 ${amtColor}`}>
        {amountStr ?? "—"}
      </td>
    </tr>
  );
}

function ProvinceSection({ stat }: { stat: IncomingDamageProvinceStat }) {
  const [open, setOpen] = useState(false);
  const damageEvents = stat.events.filter(
    (e) =>
      !POSITIVE_EVENTS.has(e.eventType) && !NEUTRAL_EVENTS.has(e.eventType),
  );
  const positiveEvents = stat.events.filter((e) =>
    POSITIVE_EVENTS.has(e.eventType),
  );

  const topDamage = damageEvents[0];
  const topSummary = topDamage
    ? (getSummaryStr(topDamage) ??
      getLabel(topDamage.eventType, topDamage.resourceType))
    : null;
  const extraDamage = damageEvents.length - 1;
  const positiveCount = positiveEvents.reduce((s, e) => s + e.count, 0);

  return (
    <div className="border border-gray-800 rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-2.5 bg-gray-900/50 hover:bg-gray-800/50 transition-colors text-left cursor-pointer"
      >
        <span className="text-sm text-gray-300">{stat.provinceName}</span>
        <span className="flex items-center gap-2 text-xs">
          {topSummary && <span className="text-red-400">{topSummary}</span>}
          {extraDamage > 0 && (
            <span className="text-gray-600">+{extraDamage}</span>
          )}
          {positiveCount > 0 && (
            <span className="text-green-700">{positiveCount} repelled</span>
          )}
          <span className="text-gray-600">{open ? "▲" : "▼"}</span>
        </span>
      </button>
      {open && (
        <div className="px-4 py-3 border-t border-gray-800">
          <table className="w-full">
            <thead>
              <tr className="text-gray-600 border-b border-gray-800 text-xs">
                <th className="text-left py-1 pr-4 font-normal">Event</th>
                <th className="text-right py-1 px-2 font-normal">Count</th>
                <th className="text-right py-1 pl-2 font-normal">
                  Total Impact
                </th>
              </tr>
            </thead>
            <tbody>
              {stat.events.map((e) => (
                <EventRow
                  key={`${e.eventType}|${e.resourceType ?? ""}`}
                  e={e}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function OperationTable({ group }: { group: OperationGroup }) {
  const [open, setOpen] = useState(false);
  const isPositive = POSITIVE_EVENTS.has(group.eventType);
  const isNeutral = NEUTRAL_EVENTS.has(group.eventType);
  const isConsolidated = CONSOLIDATED_RESOURCE_EVENTS.has(group.eventType);
  const hasResourceColumns = isConsolidated && group.resourceTypes.length > 0;
  const label = getLabel(group.eventType, group.resourceType);
  const summary = hasResourceColumns
    ? formatResourceTotals(group.totalsByResource)
    : getSummaryStr({
        eventType: group.eventType,
        resourceType: group.resourceType,
        count: group.totalCount,
        totalAmount: group.totalAmount,
      });
  const summaryColor = isPositive
    ? "text-green-500"
    : isNeutral
      ? "text-gray-500"
      : "text-red-400";

  return (
    <div className="border border-gray-800 rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-3 bg-gray-900/50 px-4 py-2.5 hover:bg-gray-800/50 transition-colors text-left cursor-pointer"
      >
        <h2 className="text-sm text-gray-300">{label}</h2>
        <span className="flex items-center gap-3 text-xs">
          <span className="text-gray-600">
            {group.rows.length.toLocaleString()} provinces
          </span>
          <span className="font-mono text-gray-500">
            {group.totalCount.toLocaleString()}{" "}
            {isConsolidated ? "entries" : "ops"}
          </span>
          {summary && <span className={summaryColor}>{summary}</span>}
          <span className="text-gray-600">{open ? "▲" : "▼"}</span>
        </span>
      </button>
      {open && (
        <div className="overflow-x-auto px-4 py-3 border-t border-gray-800">
          <table className="w-full">
            <thead>
              <tr className="text-gray-600 border-b border-gray-800 text-xs">
                <th className="text-left py-1 pr-4 font-normal">Province</th>
                {hasResourceColumns ? (
                  group.resourceTypes.map((resourceType) => (
                    <th
                      key={resourceType}
                      className="text-right py-1 px-2 font-normal"
                    >
                      {getResourceLabel(resourceType)}
                    </th>
                  ))
                ) : (
                  <>
                    <th className="text-right py-1 px-2 font-normal">Count</th>
                    <th className="text-right py-1 pl-2 font-normal">Impact</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {group.rows.map((row) => {
                const event = row.events[0];
                const amountStr = event ? getAmountStr(event) : null;
                const impactColor = isPositive
                  ? "text-green-500"
                  : isNeutral
                    ? "text-gray-500"
                    : amountStr
                      ? "text-red-400"
                      : "text-gray-700";

                return (
                  <tr
                    key={row.provinceName}
                    className="border-b border-gray-800/30"
                  >
                    <td className="py-1 pr-4 text-xs text-gray-300">
                      {row.provinceName}
                    </td>
                    {hasResourceColumns ? (
                      group.resourceTypes.map((resourceType) => {
                        const amount =
                          row.amountsByResource.get(resourceType) ?? 0;
                        return (
                          <td
                            key={resourceType}
                            className={`text-right font-mono text-xs py-1 px-2 ${impactColor}`}
                          >
                            {amount > 0 ? amount.toLocaleString() : "—"}
                          </td>
                        );
                      })
                    ) : (
                      <>
                        <td className="text-right font-mono text-xs py-1 px-2 text-gray-500">
                          {row.totalCount.toLocaleString()}
                        </td>
                        <td
                          className={`text-right font-mono text-xs py-1 pl-2 ${impactColor}`}
                        >
                          {amountStr ?? "—"}
                        </td>
                      </>
                    )}
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t border-gray-700 text-xs">
                <td className="py-1.5 pr-4 font-medium text-gray-400">Total</td>
                {hasResourceColumns ? (
                  group.resourceTypes.map((resourceType) => {
                    const amount =
                      group.totalsByResource.get(resourceType) ?? 0;
                    return (
                      <td
                        key={resourceType}
                        className={`text-right font-mono py-1.5 px-2 font-medium ${summaryColor}`}
                      >
                        {amount > 0 ? amount.toLocaleString() : "—"}
                      </td>
                    );
                  })
                ) : (
                  <>
                    <td className="text-right font-mono py-1.5 px-2 font-medium text-gray-500">
                      {group.totalCount.toLocaleString()}
                    </td>
                    <td
                      className={`text-right font-mono py-1.5 pl-2 font-medium ${summaryColor}`}
                    >
                      {summary ?? "—"}
                    </td>
                  </>
                )}
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}

export function ProvinceEventsTable({
  stats,
  kingdom,
  boundKingdom,
  from,
  to,
  latestWarDate,
}: {
  stats: IncomingDamageStats;
  kingdom: string;
  boundKingdom?: string | null;
  from?: string;
  to?: string;
  latestWarDate?: string;
}) {
  const [viewMode, setViewMode] = useState<ViewMode>("province");
  const operationGroups = buildOperationGroups(stats);

  return (
    <KingdomViewShell
      kingdom={kingdom}
      boundKingdom={boundKingdom}
      active="events"
    >
      <p className="text-xs text-gray-600 mb-4">
        Incoming events across all your provinces — not filtered to any specific
        attacker.
        {stats.effectiveFrom && (
          <>
            {" "}
            Showing from{" "}
            <span className="text-gray-500">{stats.effectiveFrom}</span>.
          </>
        )}
      </p>
      <UtopiaDateRangeFilter
        kingdom={kingdom}
        view="events"
        from={from}
        to={to}
        effectiveFrom={stats.effectiveFrom ?? undefined}
        latestWarDate={latestWarDate}
      />

      {stats.provinces.length === 0 ? (
        <p className="text-sm text-gray-500">
          No incoming events in this range.
        </p>
      ) : (
        <>
          <div className="mb-4 inline-flex rounded-md border border-gray-800 bg-gray-950 p-0.5">
            {(
              [
                ["province", "By province"],
                ["op", "By op"],
              ] as const
            ).map(([mode, label]) => (
              <button
                key={mode}
                type="button"
                onClick={() => setViewMode(mode)}
                className={[
                  "px-3 py-1.5 text-xs transition-colors",
                  viewMode === mode
                    ? "bg-gray-800 text-gray-200"
                    : "text-gray-500 hover:text-gray-300",
                ].join(" ")}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="flex flex-col gap-2">
            {viewMode === "province"
              ? stats.provinces.map((p) => (
                  <ProvinceSection key={p.provinceName} stat={p} />
                ))
              : operationGroups.map((group) => (
                  <OperationTable key={group.key} group={group} />
                ))}
          </div>
        </>
      )}
    </KingdomViewShell>
  );
}
