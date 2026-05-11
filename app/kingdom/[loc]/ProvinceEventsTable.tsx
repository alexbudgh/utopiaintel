"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { KingdomViewShell } from "./KingdomTabs";
import type { IncomingDamageEvent, IncomingDamageProvinceStat, IncomingDamageStats } from "@/lib/db-api";

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

const LABELS: Record<string, string> = {
  // Thievery — incoming damage
  troops_killed:            "Night Strike",
  peasants_kidnapped:       "Kidnap",
  rioting:                  "Incite Riots",
  turncoat_general:         "Bribe Generals",
  turncoat_thieves:         "Bribe Thieves",
  thief_sabotage_wizards:   "Sabotage Wizards",
  arson:                    "Arson",
  thief_propaganda:         "Propaganda",
  spell_expose_thieves:     "Thieves Exposed",
  // Thievery — positive (we caught them)
  thief_detected:           "Thief Detected",
  thief_detected_unknown:   "Thief Detected",
  thief_foiled:             "Attempt Foiled",
  thief_foiled_shadowlight: "Attempt Foiled",
  // Spells — incoming damage
  spell_fools_gold:         "Fool's Gold",
  spell_fireball:           "Fireball",
  spell_lightning:          "Lightning Strike",
  spell_meteor_start:       "Meteor Shower",
  spell_meteor:             "Meteor Shower",
  spell_blizzard:           "Blizzard",
  spell_gluttony:           "Gluttony",
  spell_greed:              "Greed",
  spell_explosions:         "Explosions",
  spell_tornado:            "Tornado",
  spell_land_lust:          "Land Lust",
  spell_mystic_vortex:      "Mystic Vortex",
  spell_drought:            "Drought",
  spell_pitfalls:           "Pitfalls",
  spell_chastity:           "Chastity",
  spell_nightmares:         "Nightmares",
  spell_vermin:             "Vermin",
  spell_storms:             "Storms",
  // Spells — positive
  spell_detected:           "Wizard Detected",
  // Attacks
  attack_trad_march:        "Attack (Traditional March)",
  attack_conquest:          "Attack (Conquest)",
  attack_loot:              "Attack (Learn)",
  attack_plunder:           "Attack (Plunder)",
  attack_razed:             "Attack (Raze)",
  attack_ambush:            "Ambush",
  attack_failed:            "Attack Repelled",
  attack_massacre:          "Massacre",
  // Dragon
  dragon_damage:            "Dragon Damage",
  // Neutral/friendly
  aid_received:             "Aid Received",
  exploration:              "Exploration",
  monthly_dedication:       "Monthly Dedication",
  war_ended:                "War Ended",
  war_loss_penalty:         "War Loss Penalty",
  war_victory_reward:       "War Victory Reward",
  starvation:               "Starvation",
  ritual_shortened:         "Ritual Shortened",
  plague_ended:             "Plague Ended",
  utopian_lords_reward:     "Utopian Lords Reward",
  new_scientist:            "New Scientist",
  inactivity_penalty:       "Inactivity Penalty",
  desertions:               "Desertions",
};

function getLabel(eventType: string, resourceType: string | null): string {
  if (eventType === "resource_stolen") {
    if (resourceType === "gold")   return "Rob Vaults";
    if (resourceType === "food")   return "Rob Granaries";
    if (resourceType === "runes")  return "Rob Towers";
    if (resourceType === "horses") return "Horses Stolen";
    return "Resources Stolen";
  }
  if (eventType === "aid_received" && resourceType) {
    const res = resourceType.charAt(0).toUpperCase() + resourceType.slice(1);
    return `Aid Received (${res})`;
  }
  const base = LABELS[eventType] ?? eventType;
  if (eventType === "thief_propaganda" && resourceType) return `${base} (${resourceType})`;
  return base;
}

function getSummaryStr(e: IncomingDamageEvent): string | null {
  if (e.totalAmount === 0) return null;
  const n = e.totalAmount.toLocaleString();
  const res = e.resourceType ?? "";
  switch (e.eventType) {
    case "resource_stolen":    return `${n} ${res} stolen`;
    case "troops_killed":      return `${n} troops killed`;
    case "peasants_kidnapped": return `${n} peasants kidnapped`;
    case "arson":              return `${n} acres burned`;
    case "thief_propaganda":   return `${n} deserters`;
    case "spell_fools_gold":   return `${n} gold destroyed`;
    case "spell_lightning":    return `${n} runes stolen`;
    case "spell_vermin":       return `${n} food destroyed`;
    case "spell_fireball":     return `${n} peasants`;
    case "spell_meteor": {
      const parts = [`${n} peasants`];
      if (e.totalAlt > 0) parts.push(`${e.totalAlt.toLocaleString()} troops`);
      return parts.join(", ");
    }
    case "spell_nightmares":   return `${n} troops disrupted`;
    case "spell_tornado":
    case "spell_land_lust":    return `${n} acres`;
    // Duration-based spells store days, not resource amounts — fall through to getAmountStr → "N days"
    default:                   return getAmountStr(e);
  }
}

// Maps event types to the unit suffix for their amount field.
// resource_type is used as the unit when the string is "".
const AMOUNT_UNITS: Partial<Record<string, string>> = {
  resource_stolen:        "",          // unit from resource_type
  troops_killed:          " troops",
  peasants_kidnapped:     " peasants",
  arson:                  " acres",    // uses acres field in query
  thief_propaganda:       " deserters",
  spell_fireball:         " peasants",
  spell_lightning:        " runes",
  spell_meteor_start:     " days",     // duration of shower, not troops
  spell_meteor:           " peasants", // troops are in totalAlt
  spell_blizzard:         " days",     // duration, not troops
  spell_gluttony:         " days",     // duration of food drain, not food amount
  spell_greed:            " days",     // duration of upkeep surcharge, not gold
  spell_explosions:       " days",     // duration, not buildings
  spell_tornado:          " acres",    // uses acres field
  spell_land_lust:        " acres",    // uses acres field
  spell_drought:          " days",     // duration of harvest penalty, not food
  spell_pitfalls:         " days",     // duration, not troops
  spell_chastity:         " days",     // duration, not pop
  spell_nightmares:       " troops disrupted",
  spell_vermin:           " food",
  spell_fools_gold:       " gold",
  dragon_damage:          " troops",
  exploration:            " acres",    // uses acres field
};

function getAmountStr(e: IncomingDamageEvent): string | null {
  if (e.totalAmount === 0 && e.totalAlt === 0) return null;
  if (e.eventType === "spell_meteor") {
    const parts = e.totalAmount > 0 ? [`${e.totalAmount.toLocaleString()} peasants`] : [];
    if (e.totalAlt > 0) parts.push(`${e.totalAlt.toLocaleString()} troops`);
    return parts.length > 0 ? parts.join(", ") : null;
  }
  if (e.totalAmount === 0) return null;
  if (!(e.eventType in AMOUNT_UNITS)) return null;
  const unit = e.eventType === "resource_stolen"
    ? ` ${e.resourceType ?? ""}`
    : AMOUNT_UNITS[e.eventType]!;
  return `${e.totalAmount.toLocaleString()}${unit}`;
}

function EventRow({ e }: { e: IncomingDamageEvent }) {
  const isPositive = POSITIVE_EVENTS.has(e.eventType);
  const isNeutral  = NEUTRAL_EVENTS.has(e.eventType);
  const label      = getLabel(e.eventType, e.resourceType);
  const amountStr  = getAmountStr(e);
  const labelColor = isPositive ? "text-green-400" : isNeutral ? "text-gray-400" : "text-gray-300";
  const amtColor   = isPositive ? "text-green-500" : isNeutral ? "text-gray-500" : amountStr ? "text-red-400" : "text-gray-700";

  return (
    <tr className="border-b border-gray-800/30">
      <td className={`py-1 pr-4 text-xs ${labelColor}`}>{label}</td>
      <td className="text-right font-mono text-xs py-1 px-2 text-gray-500">{e.count.toLocaleString()}</td>
      <td className={`text-right font-mono text-xs py-1 pl-2 ${amtColor}`}>{amountStr ?? "—"}</td>
    </tr>
  );
}

function ProvinceSection({ stat }: { stat: IncomingDamageProvinceStat }) {
  const [open, setOpen] = useState(false);
  const damageEvents   = stat.events.filter((e) => !POSITIVE_EVENTS.has(e.eventType) && !NEUTRAL_EVENTS.has(e.eventType));
  const positiveEvents = stat.events.filter((e) => POSITIVE_EVENTS.has(e.eventType));

  const topDamage     = damageEvents[0];
  const topSummary    = topDamage ? (getSummaryStr(topDamage) ?? getLabel(topDamage.eventType, topDamage.resourceType)) : null;
  const extraDamage   = damageEvents.length - 1;
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
          {extraDamage > 0 && <span className="text-gray-600">+{extraDamage}</span>}
          {positiveCount > 0 && <span className="text-green-700">{positiveCount} repelled</span>}
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
                <th className="text-right py-1 pl-2 font-normal">Total Impact</th>
              </tr>
            </thead>
            <tbody>
              {stat.events.map((e) => (
                <EventRow key={`${e.eventType}|${e.resourceType ?? ""}`} e={e} />
              ))}
            </tbody>
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
}: {
  stats: IncomingDamageStats;
  kingdom: string;
  boundKingdom?: string | null;
  from?: string;
}) {
  const router = useRouter();
  const kingdomHref = `/kingdom/${encodeURIComponent(kingdom)}`;

  return (
    <KingdomViewShell kingdom={kingdom} boundKingdom={boundKingdom} active="events">
      <p className="text-xs text-gray-600 mb-4">
        Incoming events across all your provinces — not filtered to any specific attacker.
        {stats.effectiveFrom && (
          <> Showing from <span className="text-gray-500">{stats.effectiveFrom}</span>.</>
        )}
        {from && (
          <>
            {" · "}
            <button
              type="button"
              onClick={() => router.push(kingdomHref + "?view=events")}
              className="underline hover:text-gray-300"
            >
              clear filter
            </button>
          </>
        )}
      </p>

      {stats.provinces.length === 0 ? (
        <p className="text-sm text-gray-500">No incoming events in this range.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {stats.provinces.map((p) => (
            <ProvinceSection key={p.provinceName} stat={p} />
          ))}
        </div>
      )}
    </KingdomViewShell>
  );
}
