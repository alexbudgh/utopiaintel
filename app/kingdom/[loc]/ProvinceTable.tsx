"use client";

import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { Tooltip, toneClass, type TooltipLine } from "@/app/components/Tooltip";
import type { ProvinceRow } from "@/lib/db";
import {
  freshnessColor,
  formatNum,
  timeAgo,
  formatTimestamp,
  sameTick,
  fullValueTooltip,
  parseUtc,
} from "@/lib/ui";
import { computeWizardCount, NW_PER_WIZARD } from "@/lib/nw";
import { computeAmbushRawOff } from "@/lib/ambush";
import {
  computeRtpa,
  computeMtpa,
  computeOtpa,
  computeDtpa,
  computeRwpa,
  computeMwpa,
  tpaPersonalityEffect,
  tpaRaceEffect,
  tpaHonorEffect,
  wpaPersonalityEffect,
  wpaRaceEffect,
  wpaHonorEffect,
} from "@/lib/metrics";
import { estimatePop } from "@/lib/population";
import { overpopulationTone } from "@/lib/overpopulation";

function oldest(...ages: (string | null | undefined)[]): string | null {
  const valid = ages.filter((a): a is string => a != null);
  return valid.length ? valid.reduce((a, b) => (a < b ? a : b)) : null;
}

const COLUMNS = [
  { key: "race", label: "Race", group: "Overview", desc: "Race" },
  {
    key: "personality",
    label: "Personality",
    group: "Overview",
    desc: "Personality",
  },
  {
    key: "honor_title",
    label: "Honor",
    group: "Overview",
    desc: "Honor title (from SoT or kingdom page)",
  },
  { key: "land", label: "Land", group: "Overview", desc: "Acres of land" },
  { key: "networth", label: "NW", group: "Overview", desc: "Networth" },
  {
    key: "pop_pct",
    label: "Pop%",
    group: "Overview",
    desc: "Current population / max population\nSelf: direct from council state\nEnemy: estimated from SoT+SoM+Survey+SoS\n~prefix = wizards estimated from NW residual",
  },
  {
    key: "ppa",
    label: "PPA",
    group: "Overview",
    desc: "Peasants per acre = peasants ÷ land\nNeeds peasants and land from the same tick",
  },
  {
    key: "hit_status",
    label: "MAP",
    group: "Overview",
    desc: "Multi-Attack Protection warning from SoT\nExamples: a little, moderately, pretty heavily, extremely badly",
  },
  {
    key: "building_efficiency",
    label: "BE",
    group: "Overview",
    desc: "Building efficiency",
  },
  {
    key: "armies",
    label: "Armies",
    group: "Overview",
    desc: "Armies currently out (SoM): count · land incoming · soonest return",
  },
  {
    key: "off_points",
    label: "Off",
    group: "Military",
    desc: "Total modified offense\nSoT normally; newer SoM home offense when all armies are home",
  },
  {
    key: "def_points",
    label: "Def",
    group: "Military",
    desc: "Total modified defense\nSoT normally; newer SoM home defense when all armies are home",
  },
  {
    key: "soldiers",
    label: "Soldiers",
    group: "Military",
    desc: "Total soldiers (SoT)",
  },
  {
    key: "off_specs",
    label: "Off specs",
    group: "Military",
    desc: "Total off specs (SoT)",
  },
  {
    key: "def_specs",
    label: "Def specs",
    group: "Military",
    desc: "Total def specs (SoT)",
  },
  {
    key: "elites",
    label: "Elites",
    group: "Military",
    desc: "Total elites (SoT)",
  },
  {
    key: "war_horses",
    label: "Horses",
    group: "Military",
    desc: "Total war horses (SoT)",
  },
  {
    key: "soldiers_home",
    label: "SolHome",
    group: "Military",
    desc: "Soldiers at home (SoM)",
  },
  {
    key: "off_specs_home",
    label: "OSpec Home",
    group: "Military",
    desc: "Off specs at home (SoM)",
  },
  {
    key: "def_specs_home",
    label: "DSpec Home",
    group: "Military",
    desc: "Def specs at home (SoM)",
  },
  {
    key: "elites_home",
    label: "EliHome",
    group: "Military",
    desc: "Elites at home (SoM)",
  },
  {
    key: "off_home",
    label: "OffHome",
    group: "Military",
    desc: "Modified offense at home (SoM)",
  },
  {
    key: "def_home",
    label: "DefHome",
    group: "Military",
    desc: "Modified defense at home (SoM/SoD)",
  },
  {
    key: "good_spells",
    label: "Good Spells",
    group: "Overview",
    desc: "Active good spells from latest self-throne data",
  },
  {
    key: "bad_spells",
    label: "Bad Spells",
    group: "Overview",
    desc: "Active bad spells from latest self-throne data",
  },
  {
    key: "ome",
    label: "OME",
    group: "Military",
    desc: "Offensive military effectiveness % (SoM)",
  },
  {
    key: "dme",
    label: "DME",
    group: "Military",
    desc: "Defensive military effectiveness % (SoM)",
  },
  {
    key: "free_specialist_credits",
    label: "Spec Credits",
    group: "Military",
    desc: "Free specialist credits remaining (self train_army page)",
  },
  {
    key: "free_building_credits",
    label: "Build Credits",
    group: "Resources",
    desc: "Free building credits remaining (self build page)",
  },
  { key: "money", label: "Gold", group: "Resources", desc: "Gold on hand" },
  { key: "food", label: "Food", group: "Resources", desc: "Food on hand" },
  { key: "runes", label: "Runes", group: "Resources", desc: "Runes on hand" },
  { key: "peasants", label: "Peasants", group: "Resources", desc: "Peasants" },
  {
    key: "prisoners",
    label: "Prisoners",
    group: "Military",
    desc: "Prisoners",
  },
  {
    key: "trade_balance",
    label: "Trade bal.",
    group: "Resources",
    desc: "Trade balance",
  },
  { key: "thieves", label: "Thieves", group: "T/M", desc: "Thieves" },
  {
    key: "stealth",
    label: "Stealth",
    group: "T/M",
    desc: "Stealth % (self only — from throne)",
  },
  { key: "wizards", label: "Wizards", group: "T/M", desc: "Wizards" },
  {
    key: "mana",
    label: "Mana",
    group: "T/M",
    desc: "Mana % (self only — from throne)",
  },
  {
    key: "age",
    label: "Age",
    group: "Overview",
    desc: "Most recent intel across all sources\nOther columns may have older data — hover them to check",
  },
  {
    key: "rtpa",
    label: "rTPA",
    group: "T/M",
    desc: "Raw TPA = thieves / land\nNeeds: Infiltrate Thieves' Dens + SoT (same tick)",
  },
  {
    key: "mtpa",
    label: "mTPA",
    group: "T/M",
    desc: "Modified TPA = rTPA × Crime × Race × Honor × Personality\nNeeds: rTPA sources + SoS (same tick)",
  },
  {
    key: "otpa",
    label: "oTPA",
    group: "T/M",
    desc: "Offensive TPA = mTPA × Thieves' Den\nNeeds: mTPA sources + Survey (same tick)",
  },
  {
    key: "dtpa",
    label: "dTPA",
    group: "T/M",
    desc: "Defensive TPA = mTPA × Watch Tower prevent\nNeeds: mTPA sources + Survey (same tick)",
  },
  {
    key: "rwpa",
    label: "rWPA",
    group: "T/M",
    desc: "Raw WPA = wizards ÷ land\nSelf: direct from throne (needs same tick as land)\nEnemy: back-calc from NW residual (needs SoT+SoS+Survey+Infiltrate same tick)",
  },
  {
    key: "mwpa",
    label: "mWPA",
    group: "T/M",
    desc: "Modified WPA = rWPA × Channeling × Race × Honor × Personality\nAlso needs SoS same tick as other sources",
  },
  {
    key: "guild_pct",
    label: "Guilds%",
    group: "T/M",
    desc: "Guild percentage = Guilds built ÷ Land\nAffects self spell / ritual success rate and spell duration\nFrom Survey",
  },
  {
    key: "ritual_cost",
    label: "Ritual",
    group: "T/M",
    desc: "Rune cost per ritual cast\n= ⌊(0.6 × Land + 200) × 9⌋\n(Cost Multiplier 6 × 1.5)",
  },
] as const;

type ColKey = (typeof COLUMNS)[number]["key"];
type SortKey = ColKey | "province" | "slot";
type SortDir = "asc" | "desc";
const DEFAULT_SORT: { key: SortKey; dir: SortDir } = {
  key: "slot",
  dir: "asc",
};

const VIEWS: Record<string, ColKey[]> = {
  Overview: [
    "race",
    "personality",
    "honor_title",
    "land",
    "networth",
    "pop_pct",
    "armies",
    "off_points",
    "def_points",
    "def_home",
    "good_spells",
    "bad_spells",
    "hit_status",
    "peasants",
    "building_efficiency",
    "age",
  ],
  Military: [
    "land",
    "armies",
    "off_points",
    "def_points",
    "off_home",
    "def_home",
    "ome",
    "dme",
    "free_specialist_credits",
    "soldiers_home",
    "off_specs_home",
    "def_specs_home",
    "elites_home",
    "age",
  ],
  Resources: [
    "land",
    "networth",
    "pop_pct",
    "money",
    "food",
    "runes",
    "prisoners",
    "trade_balance",
    "war_horses",
    "peasants",
    "thieves",
    "wizards",
    "free_building_credits",
    "age",
  ],
  "T/M": [
    "land",
    "stealth",
    "mana",
    "rtpa",
    "mtpa",
    "otpa",
    "dtpa",
    "rwpa",
    "mwpa",
    "guild_pct",
    "ritual_cost",
    "age",
  ],
};
const VIEW_NAMES = Object.keys(VIEWS);

// Columns grouped for the dropdown panel
const COLUMN_GROUPS = COLUMNS.reduce(
  (acc, col) => {
    (acc[col.group] ??= []).push(col);
    return acc;
  },
  {} as Record<string, (typeof COLUMNS)[number][]>,
);

const STORAGE_VIEW_KEY = "province-view";
const STORAGE_COLS_KEY = "province-columns";
const STORAGE_SAVED_VIEWS_KEY = "province-saved-views";

function sortValueFor(p: ProvinceRow, key: SortKey): number | string | null {
  switch (key) {
    case "province":
      return p.name;
    case "slot":
      return p.slot;
    case "race":
      return p.race;
    case "personality":
      return p.personality;
    case "honor_title":
      return p.honor_title;
    case "good_spells":
      return p.good_spell_count ?? 0;
    case "bad_spells":
      return p.bad_spell_count ?? 0;
    case "armies":
      return p.armies_out_count ?? 0;
    case "land":
      return p.land;
    case "networth":
      return p.networth;
    case "hit_status":
      return p.hit_status;
    case "building_efficiency":
      return p.building_efficiency;
    case "off_points":
      return p.off_points;
    case "def_points":
      return p.def_points;
    case "soldiers":
      return p.soldiers;
    case "off_specs":
      return p.off_specs;
    case "def_specs":
      return p.def_specs;
    case "elites":
      return p.elites;
    case "war_horses":
      return p.war_horses;
    case "peasants":
      return p.peasants;
    case "soldiers_home":
      return p.soldiers_home;
    case "off_specs_home":
      return p.off_specs_home;
    case "def_specs_home":
      return p.def_specs_home;
    case "elites_home":
      return p.elites_home;
    case "off_home":
      return p.off_home;
    case "def_home":
      return p.def_home;
    case "ome":
      return p.ome;
    case "dme":
      return p.dme;
    case "free_specialist_credits":
      return p.free_specialist_credits;
    case "free_building_credits":
      return p.free_building_credits;
    case "money":
      return p.money;
    case "food":
      return p.food;
    case "runes":
      return p.runes;
    case "prisoners":
      return p.prisoners;
    case "trade_balance":
      return p.trade_balance;
    case "thieves":
      return p.thieves;
    case "stealth":
      return p.stealth;
    case "wizards":
      return p.wizards;
    case "mana":
      return p.mana;
    case "age":
      return ageFor(p, "age");
    case "rtpa":
      return displayedMetricValue(p, "rtpa");
    case "mtpa":
      return displayedMetricValue(p, "mtpa");
    case "otpa":
      return displayedMetricValue(p, "otpa");
    case "dtpa":
      return displayedMetricValue(p, "dtpa");
    case "rwpa":
      return displayedMetricValue(p, "rwpa");
    case "mwpa":
      return displayedMetricValue(p, "mwpa");
    case "pop_pct":
      return computePopPct(p)?.pct ?? null;
    case "ppa":
      return computePpa(p);
    case "guild_pct":
      return p.guilds_built != null && p.land ? p.guilds_built / p.land : null;
    case "ritual_cost":
      return ritualRuneCost(p.land);
  }
}

function compareSortValues(
  a: number | string | null,
  b: number | string | null,
): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b), undefined, { sensitivity: "base" });
}

function ritualRuneCost(land: number | null | undefined): number | null {
  if (land == null) return null;
  return Math.floor((0.6 * land + 200) * 9);
}

function effectFactorLabel(effect: number, label: string): string {
  const op = effect >= 0 ? "+" : "-";
  return ` × (1 ${op} ${Math.abs(effect).toFixed(1)}% ${label})`;
}

function computePopPct(
  p: ProvinceRow,
): { pct: number; estimated: boolean } | null {
  // Self-province: direct council state values
  if (p.total_pop != null && p.max_pop != null && p.max_pop > 0) {
    return { pct: p.total_pop / p.max_pop, estimated: false };
  }
  // Enemy: estimate from available intel
  const pop = estimatePop({
    race: p.race,
    honor_title: p.honor_title,
    personality: p.personality,
    barren_land: p.barren_land,
    homes_built: p.homes_built,
    buildings_built: p.buildings_built,
    buildings_in_progress: p.buildings_in_progress,
    survey_age: p.survey_age,
    housing_effect: p.housing_effect,
    sciences_age: p.sciences_age,
    science_total_books: p.science_total_books,
    networth: p.networth,
    land: p.land,
    peasants: p.peasants,
    soldiers: p.soldiers,
    off_specs: p.off_specs,
    def_specs: p.def_specs,
    elites: p.elites,
    war_horses: p.war_horses,
    money: p.money,
    thieves: p.thieves,
    thieves_age: p.thieves_age,
    wizards: p.wizards,
    prisoners: p.prisoners,
    troops_age: p.troops_age,
    resources_age: p.resources_age,
    training_off_specs: null,
    training_def_specs: null,
    training_elites: null,
    training_thieves: null,
    som_age: p.som_age,
  });
  if (pop.currentPop == null || pop.maxPop == null || pop.maxPop === 0)
    return null;
  return { pct: pop.currentPop / pop.maxPop, estimated: pop.wizardsEstimated };
}

function computePpa(p: ProvinceRow): number | null {
  if (p.peasants == null || !p.land) return null;
  if (!sameTick(p.troops_age, p.overview_age)) return null;
  return p.peasants / p.land;
}

function ageFor(p: ProvinceRow, key: ColKey): string | null {
  if (key === "age") {
    const candidates = [
      p.overview_age,
      p.military_age,
      p.troops_age,
      p.troops_home_age,
      p.home_mil_age,
      p.thieves_age,
      p.resources_age,
      p.status_age,
      p.effects_age ?? null,
      p.som_age,
      p.throne_age,
      p.sciences_age,
      p.survey_age,
    ].filter((v): v is string => v != null);
    return candidates.length
      ? candidates.reduce((a, b) => (a > b ? a : b))
      : null;
  }
  if (key === "armies") {
    const candidates = [p.som_age, p.throne_age].filter(
      (v): v is string => v != null,
    );
    return candidates.length
      ? candidates.reduce((a, b) => (a > b ? a : b))
      : null;
  }
  if (key === "good_spells" || key === "bad_spells")
    return p.effects_age ?? null;
  if (
    [
      "soldiers",
      "off_specs",
      "def_specs",
      "elites",
      "war_horses",
      "peasants",
    ].includes(key)
  )
    return p.troops_age;
  if (
    [
      "soldiers_home",
      "off_specs_home",
      "def_specs_home",
      "elites_home",
    ].includes(key)
  )
    return p.troops_home_age;
  if (
    [
      "money",
      "food",
      "runes",
      "prisoners",
      "trade_balance",
      "building_efficiency",
      "stealth",
      "wizards",
      "mana",
    ].includes(key)
  )
    return p.resources_age;
  if (key === "hit_status") return p.status_age;
  if (key === "thieves") return p.thieves_age;
  if (["ome", "dme", "free_specialist_credits"].includes(key))
    return p.free_specialist_credits_age ?? p.som_age;
  if (key === "free_building_credits") return p.free_building_credits_age;
  if (["off_points", "def_points"].includes(key)) return p.military_age;
  if (["off_home", "def_home"].includes(key)) return p.home_mil_age;
  if (key === "rtpa") return p.thieves_age ?? p.overview_age;
  if (key === "mtpa") return p.sciences_age;
  if (key === "otpa" || key === "dtpa" || key === "guild_pct")
    return p.survey_age;
  if (key === "rwpa") {
    if (p.wizards != null) return oldest(p.resources_age, p.overview_age);
    return oldest(
      p.thieves_age,
      p.overview_age,
      p.troops_age,
      p.resources_age,
      p.sciences_age,
      p.survey_age,
    );
  }
  if (key === "mwpa") {
    if (p.wizards != null)
      return oldest(p.resources_age, p.overview_age, p.sciences_age);
    return oldest(
      p.thieves_age,
      p.overview_age,
      p.troops_age,
      p.resources_age,
      p.sciences_age,
      p.survey_age,
    );
  }
  if (key === "pop_pct") return p.resources_age ?? p.survey_age;
  if (key === "ppa") return oldest(p.troops_age, p.overview_age);
  return p.overview_age;
}

function sourceFor(p: ProvinceRow, key: ColKey): string | null {
  if (key === "armies") return p.som_age ? "som" : null;
  if (key === "good_spells" || key === "bad_spells")
    return p.effects_age ? "throne" : null;
  if (
    [
      "soldiers",
      "off_specs",
      "def_specs",
      "elites",
      "war_horses",
      "peasants",
    ].includes(key)
  )
    return p.troops_source;
  if (
    [
      "soldiers_home",
      "off_specs_home",
      "def_specs_home",
      "elites_home",
    ].includes(key)
  )
    return "som";
  if (
    [
      "money",
      "food",
      "runes",
      "prisoners",
      "trade_balance",
      "building_efficiency",
      "stealth",
      "thieves",
      "wizards",
      "mana",
    ].includes(key)
  )
    return p.resources_source;
  if (key === "hit_status") return p.status_age ? "sot" : null;
  if (["ome", "dme"].includes(key)) return "som";
  if (["off_points", "def_points"].includes(key)) return p.military_source;
  if (["off_home", "def_home"].includes(key))
    return p.home_mil_age ? "som/sod" : null;
  if (key === "age")
    return p.overview_source ?? (p.military_age ? "sot" : null);
  if (key === "ppa") return null;
  if (["rtpa", "mtpa", "otpa", "dtpa"].includes(key)) return null;
  return p.overview_source;
}

function metricAgeSummary(entries: Array<[string, string | null]>): string {
  return entries
    .map(([label, age]) => `${label} ${age ? timeAgo(age) : "missing"}`)
    .join(", ");
}

function metricAgeLine(entries: Array<[string, string | null]>): string {
  return `\nCurrent data: ${metricAgeSummary(entries)}`;
}

function tpaStaleReason(
  p: ProvinceRow,
  needSoS: boolean,
  needSurvey: boolean,
): string {
  const entries: Array<[string, string | null]> = [
    ["infiltrate", p.thieves_age],
    ["overview", p.overview_age],
  ];
  if (needSoS) entries.push(["SoS", p.sciences_age]);
  if (needSurvey) entries.push(["Survey", p.survey_age]);
  const reason = entries.some(([, age]) => !age)
    ? "current data is missing required inputs"
    : "current data is not from the same tick";
  return `${reason}: ${metricAgeSummary(entries)}`;
}

type MetricKey = "rtpa" | "mtpa" | "otpa" | "dtpa" | "rwpa" | "mwpa";

function cachedMetric(
  p: ProvinceRow,
  key: MetricKey,
): { value: number | null | undefined; age: string | null | undefined } {
  switch (key) {
    case "rtpa":
      return { value: p.cached_rtpa, age: p.cached_rtpa_age };
    case "mtpa":
      return { value: p.cached_mtpa, age: p.cached_mtpa_age };
    case "otpa":
      return { value: p.cached_otpa, age: p.cached_otpa_age };
    case "dtpa":
      return { value: p.cached_dtpa, age: p.cached_dtpa_age };
    case "rwpa":
      return { value: p.cached_rwpa, age: p.cached_rwpa_age };
    case "mwpa":
      return { value: p.cached_mwpa, age: p.cached_mwpa_age };
  }
}

function metricLastValidLine(p: ProvinceRow, key: MetricKey): string {
  const { value, age } = cachedMetric(p, key);
  return value != null && age != null
    ? `\nLast valid value: ${value.toFixed(2)} · ${timeAgo(age)}`
    : "";
}

function displayedMetricValue(p: ProvinceRow, key: MetricKey): number | null {
  const live = liveMetricValue(p, key);
  if (live != null) return live;
  const { value, age } = cachedMetric(p, key);
  return value != null && age != null ? value : null;
}

function missingDependencyReason(metric: string): string {
  return `${metric} unavailable`;
}

type FormulaPart = {
  text: string;
  effect?: number;
};

function effectClass(effect: number | undefined): string {
  if (effect == null) return "text-gray-100";
  if (effect > 0) return "text-green-300";
  if (effect < 0) return "text-red-300";
  return "text-gray-400";
}

function FormulaTooltip({
  parts,
  lines,
}: {
  parts: FormulaPart[];
  lines?: string;
}): React.ReactElement {
  const detailLines = lines?.split("\n").filter(Boolean) ?? [];
  return (
    <div className="flex max-w-md flex-col gap-0.5 text-xs">
      <div className="font-medium">
        {parts.map((part, i) => (
          <span key={i} className={effectClass(part.effect)}>
            {part.text}
          </span>
        ))}
      </div>
      {detailLines.map((line, i) => (
        <div key={i} className="text-gray-400">
          {line}
        </div>
      ))}
    </div>
  );
}

function metricFallbackCell(p: ProvinceRow, key: MetricKey): React.ReactNode {
  const { value, age } = cachedMetric(p, key);
  return value != null && age != null ? value.toFixed(2) : "—";
}

function metricKeyForColumn(key: ColKey): MetricKey | null {
  switch (key) {
    case "rtpa":
    case "mtpa":
    case "otpa":
    case "dtpa":
    case "rwpa":
    case "mwpa":
      return key;
    default:
      return null;
  }
}

function liveMetricValue(p: ProvinceRow, key: MetricKey): number | null {
  switch (key) {
    case "rtpa":
      return computeRtpa(p);
    case "mtpa":
      return computeMtpa(p);
    case "otpa":
      return computeOtpa(p);
    case "dtpa":
      return computeDtpa(p);
    case "rwpa":
      return computeRwpa(p);
    case "mwpa":
      return computeMwpa(p);
  }
}

function freshnessAgeFor(p: ProvinceRow, key: ColKey): string | null {
  const metricKey = metricKeyForColumn(key);
  if (metricKey && liveMetricValue(p, metricKey) == null) {
    // When the displayed metric is a cached fallback, color the cell by the
    // cached metric age instead of whichever live input happened to be newest.
    const { value, age } = cachedMetric(p, metricKey);
    if (value != null && age != null) return age;
  }
  return ageFor(p, key);
}

// Returns the age of whichever source (som/throne) is actually providing army data
function armiesSourceAge(p: ProvinceRow): string | null {
  const throneNewer = !!(
    p.throne_age &&
    (!p.som_age || p.throne_age > p.som_age)
  );
  return throneNewer ? p.throne_age : p.som_age;
}

// Adjust a stored ETA (Utopia days/ticks = real hours) for elapsed time since capture
function adjustEta(eta: number, sourceAge: string): number {
  return Math.max(0, eta - (Date.now() - parseUtc(sourceAge)) / 3_600_000);
}

function freshnessToTone(age: string): TooltipLine["tone"] {
  const hrs = (Date.now() - parseUtc(age)) / 3_600_000;
  if (hrs < 1) return "good";
  if (hrs < 6) return "warn";
  return "bad";
}

function tipFor(
  p: ProvinceRow,
  key: ColKey,
  { includeLastValid = true }: { includeLastValid?: boolean } = {},
): string | TooltipLine[] | React.ReactElement {
  // Special case: age column shows all intel source ages
  if (key === "age") {
    const entries: Array<{ label: string; age: string }> = [
      p.overview_age
        ? {
            label: `overview (${p.overview_source ?? "?"})`,
            age: p.overview_age,
          }
        : null,
      p.military_age ? { label: "sot", age: p.military_age } : null,
      p.som_age ? { label: "som", age: p.som_age } : null,
      p.throne_age ? { label: "throne", age: p.throne_age } : null,
      p.troops_age
        ? { label: `troops (${p.troops_source ?? "?"})`, age: p.troops_age }
        : null,
      p.resources_age
        ? {
            label: `resources (${p.resources_source ?? "?"})`,
            age: p.resources_age,
          }
        : null,
      p.home_mil_age
        ? { label: "off/def home (som/sod)", age: p.home_mil_age }
        : null,
      p.sciences_age ? { label: "sciences", age: p.sciences_age } : null,
      p.survey_age ? { label: "survey", age: p.survey_age } : null,
      p.effects_age ? { label: "spells", age: p.effects_age } : null,
      p.status_age ? { label: "status", age: p.status_age } : null,
    ].filter((e): e is { label: string; age: string } => e !== null);
    entries.sort((a, b) => (a.age > b.age ? -1 : a.age < b.age ? 1 : 0));
    return [
      { text: "Intel ages", tone: "strong" },
      ...entries.map(({ label, age }) => ({
        text: `${label}: ${timeAgo(age)} · ${formatTimestamp(age)}`,
        tone: freshnessToTone(age),
      })),
    ];
  }
  if (key === "armies") {
    if (!p.som_age) return "No SoM data";
    type ArmyEntry = {
      type: string;
      soldiers: number;
      offSpecs: number;
      defSpecs: number;
      elites: number;
      land: number;
      eta: number;
    };
    const armies: ArmyEntry[] = p.armies_out_json
      ? JSON.parse(p.armies_out_json)
      : [];
    const srcAge = armiesSourceAge(p);
    const ambushes = armies.map((a) => {
      const hasUnits = a.soldiers || a.offSpecs || a.defSpecs || a.elites;
      return hasUnits ? computeAmbushRawOff(p.race, a) : null;
    });
    const showAmbush = ambushes.some((v) => v != null);
    const th = "px-2 py-0.5 text-gray-400 font-normal text-right";
    const td = "px-2 py-0.5 tabular-nums text-right text-gray-200";
    const tdL = "px-2 py-0.5 text-gray-200";
    return (
      <div className="text-xs">
        <div className="font-medium text-gray-100 mb-1">Armies out</div>
        {armies.length === 0 ? (
          <div className="text-gray-400">All armies home</div>
        ) : (
          <table>
            <thead>
              <tr className="border-b border-gray-700">
                <th className={tdL}>Army</th>
                <th className={th}>Sol</th>
                <th className={th}>OffS</th>
                <th className={th}>DefS</th>
                <th className={th}>Eli</th>
                <th className={th}>Land</th>
                <th className={th}>ETA</th>
                {showAmbush && <th className={th}>Ambush</th>}
              </tr>
            </thead>
            <tbody>
              {armies.map((a, i) => (
                <tr key={i} className="border-b border-gray-800">
                  <td className={tdL}>{a.type}</td>
                  <td className={td}>
                    {a.soldiers ? a.soldiers.toLocaleString() : "—"}
                  </td>
                  <td className={td}>
                    {a.offSpecs ? a.offSpecs.toLocaleString() : "—"}
                  </td>
                  <td className={td}>
                    {a.defSpecs ? a.defSpecs.toLocaleString() : "—"}
                  </td>
                  <td className={td}>
                    {a.elites ? a.elites.toLocaleString() : "—"}
                  </td>
                  <td className={td}>
                    {a.land > 0 ? a.land.toLocaleString() : "—"}
                  </td>
                  <td className={td}>
                    {srcAge
                      ? adjustEta(a.eta, srcAge) > 0
                        ? `${adjustEta(a.eta, srcAge).toFixed(1)}d`
                        : "ret?"
                      : `${a.eta.toFixed(1)}d`}
                  </td>
                  {showAmbush && (
                    <td className={td}>
                      {ambushes[i] != null
                        ? Math.ceil(ambushes[i]!).toLocaleString()
                        : "—"}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {p.som_age && (
          <div
            className={`mt-1 text-xs ${toneClass(freshnessToTone(p.som_age))}`}
          >{`som: ${timeAgo(p.som_age)} · ${formatTimestamp(p.som_age)}`}</div>
        )}
        {p.throne_age && (
          <div
            className={`mt-0.5 text-xs ${toneClass(freshnessToTone(p.throne_age))}`}
          >{`throne: ${timeAgo(p.throne_age)} · ${formatTimestamp(p.throne_age)}`}</div>
        )}
      </div>
    );
  }
  if (key === "good_spells") {
    const lines = [];
    if (p.good_spell_details)
      lines.push(p.good_spell_details.split(" | ").join(", "));
    if (p.effects_age)
      lines.push(
        `throne: ${timeAgo(p.effects_age)} · ${formatTimestamp(p.effects_age)}`,
      );
    return lines.length ? lines.join("\n") : "No active good spell data";
  }
  if (key === "bad_spells") {
    const lines = [];
    if (p.bad_spell_details)
      lines.push(p.bad_spell_details.split(" | ").join(", "));
    if (p.effects_age)
      lines.push(
        `throne: ${timeAgo(p.effects_age)} · ${formatTimestamp(p.effects_age)}`,
      );
    return lines.length ? lines.join("\n") : "No active bad spell data";
  }
  if (key === "rtpa") {
    if (p.thieves == null || !p.land) {
      const cached = includeLastValid ? metricLastValidLine(p, "rtpa") : "";
      return `No thieves or land data${cached}`;
    }
    const ok = sameTick(p.thieves_age, p.overview_age);
    const val = ok ? (p.thieves / p.land).toFixed(2) : "—";
    const cached =
      includeLastValid && !ok ? metricLastValidLine(p, "rtpa") : "";
    const ages = metricAgeLine([
      ["infiltrate", p.thieves_age],
      ["overview", p.overview_age],
    ]);
    return (
      `rTPA = ${formatNum(p.thieves)} ÷ ${formatNum(p.land)} = ${val}${ages}` +
      (ok ? "" : `\n(${tpaStaleReason(p, false, false)})${cached}`)
    );
  }
  if (key === "ppa") {
    if (p.peasants == null || !p.land) return "No peasants or land data";
    const ok = sameTick(p.troops_age, p.overview_age);
    const val = ok ? (computePpa(p)?.toFixed(2) ?? "—") : "—";
    const ages = metricAgeLine([
      ["peasants", p.troops_age],
      ["overview", p.overview_age],
    ]);
    return (
      `PPA = ${p.peasants.toLocaleString()} ÷ ${p.land.toLocaleString()} = ${val}${ages}` +
      (ok ? "" : "\n(peasants and land are not from the same tick)")
    );
  }
  if (key === "mtpa") {
    const rtpa = computeRtpa(p);
    if (rtpa == null) {
      const cached = includeLastValid ? metricLastValidLine(p, "mtpa") : "";
      return missingDependencyReason("rTPA") + cached;
    }
    if (p.crime_effect == null) {
      const cached = includeLastValid ? metricLastValidLine(p, "mtpa") : "";
      return `rTPA = ${rtpa.toFixed(2)}\nNo Crime science data${cached}`;
    }
    const ok = sameTick(p.thieves_age, p.overview_age, p.sciences_age);
    const personalityEffect = tpaPersonalityEffect(p);
    const raceEffect = tpaRaceEffect(p);
    const honorEffect = tpaHonorEffect(p);
    const val = ok ? (computeMtpa(p)?.toFixed(2) ?? "—") : "—";
    const cached =
      includeLastValid && !ok ? metricLastValidLine(p, "mtpa") : "";
    const ages = metricAgeLine([
      ["infiltrate", p.thieves_age],
      ["overview", p.overview_age],
      ["SoS", p.sciences_age],
    ]);
    const parts: FormulaPart[] = [
      { text: `mTPA = ${rtpa.toFixed(2)}` },
      {
        text: effectFactorLabel(p.crime_effect, "Crime"),
        effect: p.crime_effect,
      },
      ...(raceEffect !== 0
        ? [{ text: effectFactorLabel(raceEffect, "Race"), effect: raceEffect }]
        : []),
      ...(honorEffect !== 0
        ? [
            {
              text: effectFactorLabel(honorEffect, "Honor"),
              effect: honorEffect,
            },
          ]
        : []),
      ...(personalityEffect !== 0
        ? [
            {
              text: effectFactorLabel(personalityEffect, "Personality"),
              effect: personalityEffect,
            },
          ]
        : []),
      { text: ` = ${val}` },
    ];
    return (
      <FormulaTooltip
        parts={parts}
        lines={`${ages}${ok ? "" : `\n(${tpaStaleReason(p, true, false)})${cached}`}`}
      />
    );
  }
  if (key === "otpa") {
    const mtpa = computeMtpa(p);
    if (mtpa == null) {
      const cached = includeLastValid ? metricLastValidLine(p, "otpa") : "";
      return missingDependencyReason("mTPA") + cached;
    }
    if (p.thieves_dens_effect == null) {
      const cached = includeLastValid ? metricLastValidLine(p, "otpa") : "";
      return `mTPA = ${mtpa.toFixed(2)}\nNo Survey data${cached}`;
    }
    const ok = sameTick(
      p.thieves_age,
      p.overview_age,
      p.sciences_age,
      p.survey_age,
    );
    const val = ok ? (computeOtpa(p)?.toFixed(2) ?? "—") : "—";
    const cached =
      includeLastValid && !ok ? metricLastValidLine(p, "otpa") : "";
    const ages = metricAgeLine([
      ["infiltrate", p.thieves_age],
      ["overview", p.overview_age],
      ["SoS", p.sciences_age],
      ["Survey", p.survey_age],
    ]);
    return (
      <FormulaTooltip
        parts={[
          { text: `oTPA = ${mtpa.toFixed(2)}` },
          {
            text: effectFactorLabel(p.thieves_dens_effect, "Thieves' Den"),
            effect: p.thieves_dens_effect,
          },
          { text: ` = ${val}` },
        ]}
        lines={`${ages}${ok ? "" : `\n(${tpaStaleReason(p, true, true)})${cached}`}`}
      />
    );
  }
  if (key === "dtpa") {
    const mtpa = computeMtpa(p);
    if (mtpa == null) {
      const cached = includeLastValid ? metricLastValidLine(p, "dtpa") : "";
      return missingDependencyReason("mTPA") + cached;
    }
    if (p.watch_towers_effect == null) {
      const cached = includeLastValid ? metricLastValidLine(p, "dtpa") : "";
      return `mTPA = ${mtpa.toFixed(2)}\nNo Survey data${cached}`;
    }
    const ok = sameTick(
      p.thieves_age,
      p.overview_age,
      p.sciences_age,
      p.survey_age,
    );
    const val = ok ? (computeDtpa(p)?.toFixed(2) ?? "—") : "—";
    const cached =
      includeLastValid && !ok ? metricLastValidLine(p, "dtpa") : "";
    const ages = metricAgeLine([
      ["infiltrate", p.thieves_age],
      ["overview", p.overview_age],
      ["SoS", p.sciences_age],
      ["Survey", p.survey_age],
    ]);
    return (
      <FormulaTooltip
        parts={[
          { text: `dTPA = ${mtpa.toFixed(2)}` },
          {
            text: effectFactorLabel(p.watch_towers_effect, "Watch Tower"),
            effect: p.watch_towers_effect,
          },
          { text: ` = ${val}` },
        ]}
        lines={`${ages}${ok ? "" : `\n(${tpaStaleReason(p, true, true)})${cached}`}`}
      />
    );
  }
  if (key === "rwpa") {
    if (!p.land) {
      const cached = includeLastValid ? metricLastValidLine(p, "rwpa") : "";
      return `No land data${cached}`;
    }
    if (p.wizards != null) {
      const ok = sameTick(p.resources_age, p.overview_age);
      if (!ok) {
        const cached = includeLastValid ? metricLastValidLine(p, "rwpa") : "";
        return `Current wizard and land data is not from the same tick: ${metricAgeSummary(
          [
            ["wizards", p.resources_age],
            ["overview", p.overview_age],
          ],
        )}${cached}`;
      }
      return `rWPA = ${formatNum(p.wizards)} ÷ ${formatNum(p.land)} = ${(p.wizards / p.land).toFixed(2)}\n(direct from throne/self-intel)${metricAgeLine(
        [
          ["wizards", p.resources_age],
          ["overview", p.overview_age],
        ],
      )}`;
    }
    if (!p.networth || !p.race) {
      const cached = includeLastValid ? metricLastValidLine(p, "rwpa") : "";
      return `Missing NW, land, or race data${cached}`;
    }
    const ok = sameTick(
      p.thieves_age,
      p.overview_age,
      p.sciences_age,
      p.survey_age,
      p.troops_age,
      p.resources_age,
    );
    const w = ok ? computeWizardCount(p) : null;
    if (w == null) {
      const cached = includeLastValid ? metricLastValidLine(p, "rwpa") : "";
      const detail = metricAgeSummary([
        ["infiltrate", p.thieves_age],
        ["overview", p.overview_age],
        ["troops (SoT)", p.troops_age],
        ["resources (SoT)", p.resources_age],
        ["SoS", p.sciences_age],
        ["Survey", p.survey_age],
      ]);
      return (
        (ok
          ? "Current data is missing SoT/SoS/Survey/Infiltrate inputs"
          : `Current data is not from the same tick: ${detail}`) + cached
      );
    }
    const rwpa = w / p.land;
    return `wizards ≈ (${formatNum(p.networth)} NW residual) ÷ ${NW_PER_WIZARD} = ${Math.round(w).toLocaleString()}\nrWPA = ${Math.round(w).toLocaleString()} ÷ ${formatNum(p.land)} = ${rwpa.toFixed(2)}${metricAgeLine(
      [
        ["infiltrate", p.thieves_age],
        ["overview", p.overview_age],
        ["troops (SoT)", p.troops_age],
        ["resources (SoT)", p.resources_age],
        ["SoS", p.sciences_age],
        ["Survey", p.survey_age],
      ],
    )}`;
  }
  if (key === "mwpa") {
    const rwpa = computeRwpa(p);
    if (rwpa == null) {
      const cached = includeLastValid ? metricLastValidLine(p, "mwpa") : "";
      return missingDependencyReason("rWPA") + cached;
    }
    if (p.channeling_effect == null) {
      const cached = includeLastValid ? metricLastValidLine(p, "mwpa") : "";
      return `rWPA = ${rwpa.toFixed(2)}\nNo Channeling science data${cached}`;
    }
    if (
      p.wizards != null &&
      !sameTick(p.resources_age, p.overview_age, p.sciences_age)
    ) {
      const cached = includeLastValid ? metricLastValidLine(p, "mwpa") : "";
      const raceEffect = wpaRaceEffect(p);
      const honorEffect = wpaHonorEffect(p);
      const personalityEffect = wpaPersonalityEffect(p);
      const parts: FormulaPart[] = [
        { text: `rWPA = ${rwpa.toFixed(2)}` },
        {
          text: effectFactorLabel(p.channeling_effect, "Channeling"),
          effect: p.channeling_effect,
        },
        ...(raceEffect !== 0
          ? [
              {
                text: effectFactorLabel(raceEffect, "Race"),
                effect: raceEffect,
              },
            ]
          : []),
        ...(honorEffect !== 0
          ? [
              {
                text: effectFactorLabel(honorEffect, "Honor"),
                effect: honorEffect,
              },
            ]
          : []),
        ...(personalityEffect !== 0
          ? [
              {
                text: effectFactorLabel(personalityEffect, "Personality"),
                effect: personalityEffect,
              },
            ]
          : []),
      ];
      const lines = `Current WPA data is not from the same tick: ${metricAgeSummary(
        [
          ["wizards", p.resources_age],
          ["overview", p.overview_age],
          ["SoS", p.sciences_age],
        ],
      )}${cached}`;
      return <FormulaTooltip parts={parts} lines={lines} />;
    }
    const personalityEffect = wpaPersonalityEffect(p);
    const raceEffect = wpaRaceEffect(p);
    const honorEffect = wpaHonorEffect(p);
    const mysticNote =
      p.personality === "Mystic" && p.mana == null
        ? "\nMystic Focused Channeling not applied: mana unknown"
        : "";
    const ages =
      p.wizards != null
        ? metricAgeLine([
            ["wizards", p.resources_age],
            ["overview", p.overview_age],
            ["SoS", p.sciences_age],
          ])
        : metricAgeLine([
            ["infiltrate", p.thieves_age],
            ["overview", p.overview_age],
            ["troops (SoT)", p.troops_age],
            ["resources (SoT)", p.resources_age],
            ["SoS", p.sciences_age],
            ["Survey", p.survey_age],
          ]);
    const parts: FormulaPart[] = [
      { text: `mWPA = ${rwpa.toFixed(2)}` },
      {
        text: effectFactorLabel(p.channeling_effect, "Channeling"),
        effect: p.channeling_effect,
      },
      ...(raceEffect !== 0
        ? [{ text: effectFactorLabel(raceEffect, "Race"), effect: raceEffect }]
        : []),
      ...(honorEffect !== 0
        ? [
            {
              text: effectFactorLabel(honorEffect, "Honor"),
              effect: honorEffect,
            },
          ]
        : []),
      ...(personalityEffect !== 0
        ? [
            {
              text: effectFactorLabel(personalityEffect, "Personality"),
              effect: personalityEffect,
            },
          ]
        : []),
      { text: ` = ${computeMwpa(p)!.toFixed(2)}` },
    ];
    return <FormulaTooltip parts={parts} lines={`${ages}${mysticNote}`} />;
  }
  const age = ageFor(p, key);
  const source = sourceFor(p, key);
  if (!age) return "";
  return [source, timeAgo(age), formatTimestamp(age)]
    .filter(Boolean)
    .join(" · ");
}

function roundedValueTipFor(p: ProvinceRow, key: ColKey): string | null {
  switch (key) {
    case "networth":
    case "off_points":
    case "def_points":
    case "soldiers":
    case "off_specs":
    case "def_specs":
    case "elites":
    case "war_horses":
    case "peasants":
    case "soldiers_home":
    case "off_specs_home":
    case "def_specs_home":
    case "elites_home":
    case "off_home":
    case "def_home":
    case "money":
    case "food":
    case "runes":
    case "prisoners":
    case "thieves":
    case "wizards":
    case "free_specialist_credits":
    case "free_building_credits": {
      const value = sortValueFor(p, key);
      return typeof value === "number"
        ? fullValueTooltip(formatNum(value), value)
        : null;
    }
    case "guild_pct": {
      if (p.guilds_built == null || !p.land) return null;
      const pct = (p.guilds_built / p.land) * 100;
      return fullValueTooltip(`${pct.toFixed(1)}%`, pct, { suffix: "%" });
    }
    case "ritual_cost": {
      const v = ritualRuneCost(p.land);
      return v != null ? fullValueTooltip(formatNum(v), v) : null;
    }
    case "trade_balance":
      return p.trade_balance != null
        ? fullValueTooltip(
            `${p.trade_balance >= 0 ? "+" : ""}${formatNum(p.trade_balance)}`,
            p.trade_balance,
          )
        : null;
    case "ome":
      return p.ome != null
        ? fullValueTooltip(`${p.ome.toFixed(1)}%`, p.ome, { suffix: "%" })
        : null;
    case "dme":
      return p.dme != null
        ? fullValueTooltip(`${p.dme.toFixed(1)}%`, p.dme, { suffix: "%" })
        : null;
    case "rtpa": {
      const v = computeRtpa(p);
      return v != null ? fullValueTooltip(v.toFixed(2), v) : null;
    }
    case "mtpa": {
      const v = computeMtpa(p);
      return v != null ? fullValueTooltip(v.toFixed(2), v) : null;
    }
    case "otpa": {
      const v = computeOtpa(p);
      return v != null ? fullValueTooltip(v.toFixed(2), v) : null;
    }
    case "dtpa": {
      const v = computeDtpa(p);
      return v != null ? fullValueTooltip(v.toFixed(2), v) : null;
    }
    case "rwpa": {
      const v = computeRwpa(p);
      return v != null ? fullValueTooltip(v.toFixed(2), v) : null;
    }
    case "mwpa": {
      const v = computeMwpa(p);
      return v != null ? fullValueTooltip(v.toFixed(2), v) : null;
    }
    default:
      return null;
  }
}

function tooltipContentFor(
  p: ProvinceRow,
  key: ColKey,
): string | TooltipLine[] | React.ReactElement {
  const rounded = roundedValueTipFor(p, key);
  const base = tipFor(p, key);
  if (Array.isArray(base) || (typeof base === "object" && base !== null))
    return base;
  return [rounded, base].filter(Boolean).join("\n");
}

function cellValue(p: ProvinceRow, key: ColKey): React.ReactNode {
  switch (key) {
    case "race":
      return <span className="text-gray-400">{p.race ?? "—"}</span>;
    case "personality":
      return <span className="text-gray-400">{p.personality ?? "—"}</span>;
    case "honor_title":
      return <span className="text-gray-400">{p.honor_title ?? "—"}</span>;
    case "armies": {
      const srcAge = armiesSourceAge(p);
      if (!srcAge) return "—";
      const out = p.armies_out_count ?? 0;
      if (out === 0) return <span className="text-gray-600">home</span>;
      const eta =
        p.earliest_return != null ? adjustEta(p.earliest_return, srcAge) : null;
      return (
        <span className="font-mono text-xs">
          {out}✦
          {p.land_incoming ? ` +${p.land_incoming.toLocaleString()}a` : ""}
          {eta != null ? (eta > 0 ? ` ${eta.toFixed(1)}d` : " ret?") : ""}
        </span>
      );
    }
    case "good_spells":
      return (p.good_spell_count ?? 0) > 0 ? (
        <span className="rounded border border-blue-500/40 bg-blue-500/10 px-1.5 py-0.5 text-[10px] font-medium text-blue-300">
          +{p.good_spell_count}
        </span>
      ) : (
        "—"
      );
    case "bad_spells":
      return (p.bad_spell_count ?? 0) > 0 ? (
        <span className="rounded border border-red-500/40 bg-red-500/10 px-1.5 py-0.5 text-[10px] font-medium text-red-300">
          -{p.bad_spell_count}
        </span>
      ) : (
        "—"
      );
    case "land":
      return p.land != null ? p.land.toLocaleString() : "—";
    case "networth":
      return formatNum(p.networth);
    case "hit_status":
      return p.hit_status ?? "—";
    case "off_points":
      return formatNum(p.off_points);
    case "def_points":
      return formatNum(p.def_points);
    case "soldiers":
      return formatNum(p.soldiers);
    case "off_specs":
      return formatNum(p.off_specs);
    case "def_specs":
      return formatNum(p.def_specs);
    case "elites":
      return formatNum(p.elites);
    case "war_horses":
      return formatNum(p.war_horses);
    case "peasants":
      return formatNum(p.peasants);
    case "soldiers_home":
      return formatNum(p.soldiers_home);
    case "off_specs_home":
      return formatNum(p.off_specs_home);
    case "def_specs_home":
      return formatNum(p.def_specs_home);
    case "elites_home":
      return formatNum(p.elites_home);
    case "off_home":
      return formatNum(p.off_home);
    case "def_home":
      return formatNum(p.def_home);
    case "ome":
      return p.ome != null ? p.ome.toFixed(1) + "%" : "—";
    case "dme":
      return p.dme != null ? p.dme.toFixed(1) + "%" : "—";
    case "free_specialist_credits":
      return formatNum(p.free_specialist_credits);
    case "free_building_credits":
      return formatNum(p.free_building_credits);
    case "money":
      return formatNum(p.money);
    case "food":
      return formatNum(p.food);
    case "runes":
      return formatNum(p.runes);
    case "ritual_cost":
      return p.land != null ? ritualRuneCost(p.land)!.toLocaleString() : "—";
    case "prisoners":
      return formatNum(p.prisoners);
    case "trade_balance":
      return p.trade_balance != null
        ? (p.trade_balance >= 0 ? "+" : "") + formatNum(p.trade_balance)
        : "—";
    case "building_efficiency":
      return p.building_efficiency != null ? p.building_efficiency + "%" : "—";
    case "thieves":
      return formatNum(p.thieves);
    case "stealth":
      return p.stealth != null ? p.stealth + "%" : "—";
    case "wizards":
      return formatNum(p.wizards);
    case "mana":
      return p.mana != null ? p.mana + "%" : "—";
    case "age": {
      const a = ageFor(p, "age");
      return <span className={freshnessColor(a)}>{timeAgo(a)}</span>;
    }
    case "rtpa": {
      const v = computeRtpa(p);
      return v != null ? v.toFixed(2) : metricFallbackCell(p, "rtpa");
    }
    case "mtpa": {
      const v = computeMtpa(p);
      return v != null ? v.toFixed(2) : metricFallbackCell(p, "mtpa");
    }
    case "otpa": {
      const v = computeOtpa(p);
      return v != null ? v.toFixed(2) : metricFallbackCell(p, "otpa");
    }
    case "dtpa": {
      const v = computeDtpa(p);
      return v != null ? v.toFixed(2) : metricFallbackCell(p, "dtpa");
    }
    case "rwpa": {
      const v = computeRwpa(p);
      return v != null ? v.toFixed(2) : metricFallbackCell(p, "rwpa");
    }
    case "mwpa": {
      const v = computeMwpa(p);
      return v != null ? v.toFixed(2) : metricFallbackCell(p, "mwpa");
    }
    case "ppa": {
      const v = computePpa(p);
      return v != null ? v.toFixed(2) : "—";
    }
    case "guild_pct": {
      if (p.guilds_built == null || !p.land) return "—";
      const pct = (p.guilds_built / p.land) * 100;
      return (
        <span
          className={
            pct >= 20 ? "text-green-400" : pct >= 10 ? "text-amber-300" : ""
          }
        >
          {pct.toFixed(1)}%
        </span>
      );
    }
    case "pop_pct": {
      const r = computePopPct(p);
      if (!r) return "—";
      const pct = (r.pct * 100).toFixed(1);
      return (
        <span className={overpopulationTone(r.pct).textClass}>
          {r.estimated ? "~" : ""}
          {pct}%
        </span>
      );
    }
  }
}

const TEXT_LEFT = new Set<ColKey>(["race", "personality"]);

export function ProvinceTable({
  kingdom,
  provinces,
}: {
  kingdom: string;
  provinces: ProvinceRow[];
}) {
  const [selectedRowId, setSelectedRowId] = useState<number | null>(null);
  const [activeView, setActiveView] = useState<string | null>("Overview");
  const [customCols, setCustomCols] = useState<Set<ColKey>>(
    new Set(VIEWS.Overview),
  );
  const [savedViews, setSavedViews] = useState<Record<string, ColKey[]>>({});
  const [saveInputOpen, setSaveInputOpen] = useState(false);
  const [saveInputValue, setSaveInputValue] = useState("");
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir } | null>(
    DEFAULT_SORT,
  );
  const colsBtnRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const saveInputRef = useRef<HTMLInputElement>(null);
  const stickyHeaderRef = useRef<HTMLDivElement>(null);
  const bodyScrollRef = useRef<HTMLDivElement>(null);
  const mainTheadRef = useRef<HTMLTableSectionElement>(null);

  // Unified view map: built-in + saved
  const allViews: Record<string, ColKey[]> = { ...VIEWS, ...savedViews };

  // Derived: visible cols from active view or custom set
  const visible: Set<ColKey> = activeView
    ? new Set(allViews[activeView] ?? [])
    : customCols;

  // Load prefs from localStorage after mount (SSR-safe)
  useEffect(() => {
    try {
      const rawSaved = localStorage.getItem(STORAGE_SAVED_VIEWS_KEY);
      const userSavedViews: Record<string, ColKey[]> = rawSaved
        ? JSON.parse(rawSaved)
        : {};
      if (Object.keys(userSavedViews).length) setSavedViews(userSavedViews);

      const savedView = localStorage.getItem(STORAGE_VIEW_KEY);
      const savedCols = localStorage.getItem(STORAGE_COLS_KEY);
      const allKnown = { ...VIEWS, ...userSavedViews };
      if (savedView && allKnown[savedView]) {
        setActiveView(savedView);
      } else if (savedCols) {
        setCustomCols(new Set(JSON.parse(savedCols) as ColKey[]));
        setActiveView(null);
      }
    } catch (err) {
      console.warn("Failed to load saved province table preferences", err);
    }
  }, []);

  // Persist prefs
  useEffect(() => {
    localStorage.setItem(STORAGE_VIEW_KEY, activeView ?? "");
    if (!activeView) {
      localStorage.setItem(STORAGE_COLS_KEY, JSON.stringify([...customCols]));
    }
  }, [activeView, customCols]);

  // Persist saved views
  useEffect(() => {
    localStorage.setItem(STORAGE_SAVED_VIEWS_KEY, JSON.stringify(savedViews));
  }, [savedViews]);

  // Close dropdown on outside click
  useEffect(() => {
    if (!dropdownOpen) return;
    function handleDown(e: MouseEvent) {
      if (
        dropdownRef.current?.contains(e.target as Node) ||
        colsBtnRef.current?.contains(e.target as Node)
      )
        return;
      setDropdownOpen(false);
    }
    document.addEventListener("mousedown", handleDown);
    return () => document.removeEventListener("mousedown", handleDown);
  }, [dropdownOpen]);

  const selectView = (name: string) => {
    setActiveView(name);
    setDropdownOpen(false);
  };

  const toggleCustomCol = (key: ColKey) => {
    const base = activeView ? new Set(allViews[activeView] ?? []) : customCols;
    const next = new Set(base);
    if (next.has(key)) {
      next.delete(key);
    } else {
      next.add(key);
    }
    setActiveView(null);
    setCustomCols(next);
  };

  const saveCurrentView = (name: string) => {
    setSavedViews((prev) => ({ ...prev, [name]: [...visible] }));
    setActiveView(name);
    setSaveInputOpen(false);
    setSaveInputValue("");
  };

  const deleteSavedView = (name: string) => {
    setSavedViews((prev) => {
      const next = { ...prev };
      delete next[name];
      return next;
    });
    if (activeView === name) setActiveView("Overview");
  };

  const visibleCols = COLUMNS.filter((c) => visible.has(c.key));

  // Sync sticky header column widths from the (invisible) main thead
  useEffect(() => {
    function sync() {
      if (!mainTheadRef.current || !stickyHeaderRef.current) return;
      const mainThs = mainTheadRef.current.querySelectorAll<HTMLElement>("th");
      const stickyThs =
        stickyHeaderRef.current.querySelectorAll<HTMLElement>("th");
      mainThs.forEach((th, i) => {
        if (stickyThs[i]) stickyThs[i].style.width = th.offsetWidth + "px";
      });
    }
    sync();
    const ro = new ResizeObserver(sync);
    if (mainTheadRef.current) ro.observe(mainTheadRef.current);
    return () => ro.disconnect();
  }, [visibleCols]);

  const sortedProvinces = sort
    ? [...provinces].sort((a, b) => {
        const av = sortValueFor(a, sort.key);
        const bv = sortValueFor(b, sort.key);
        // nulls always sink to the bottom regardless of direction
        if (av == null && bv == null)
          return a.name.localeCompare(b.name, undefined, {
            sensitivity: "base",
          });
        if (av == null) return 1;
        if (bv == null) return -1;
        const cmp = compareSortValues(av, bv);
        if (cmp !== 0) return sort.dir === "asc" ? cmp : -cmp;
        return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
      })
    : provinces;

  const btnBase = "px-2.5 py-1 rounded text-xs border transition-colors";
  const btnActive = "border-blue-500 text-blue-300 bg-blue-950/40";
  const btnInactive =
    "border-gray-700 text-gray-500 hover:border-gray-500 hover:text-gray-300";

  const toggleSort = (key: SortKey) => {
    setSort((prev) => {
      if (!prev || prev.key !== key) return { key, dir: "desc" };
      if (prev.dir === "desc") return { key, dir: "asc" };
      return DEFAULT_SORT;
    });
  };

  const sortIndicator = (key: SortKey) => {
    if (!sort || sort.key !== key) return "↕";
    return sort.dir === "desc" ? "↓" : "↑";
  };

  const sortIndicatorClass = (key: SortKey) =>
    !sort || sort.key !== key
      ? "text-xs text-gray-600"
      : "text-sm font-semibold text-blue-300";

  return (
    <div>
      <div className="flex items-center gap-1.5 mb-4 flex-wrap">
        {VIEW_NAMES.map((name) => (
          <button
            key={name}
            onClick={() => selectView(name)}
            className={`${btnBase} ${activeView === name ? btnActive : btnInactive}`}
          >
            {name}
          </button>
        ))}
        {Object.keys(savedViews).map((name) => (
          <div key={name} className="relative group">
            <button
              onClick={() => selectView(name)}
              className={`${btnBase} ${activeView === name ? btnActive : btnInactive} pr-6`}
            >
              {name}
            </button>
            <button
              onClick={() => deleteSavedView(name)}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 text-gray-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity text-xs leading-none"
              title="Delete view"
            >
              ✕
            </button>
          </div>
        ))}
        <div className="w-px h-4 bg-gray-700 mx-1" />
        <button
          ref={colsBtnRef}
          onClick={() => setDropdownOpen((o) => !o)}
          className={`${btnBase} ${!activeView || dropdownOpen ? btnActive : btnInactive}`}
        >
          Columns ▾
        </button>
        {saveInputOpen ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const n = saveInputValue.trim();
              if (n) saveCurrentView(n);
            }}
            className="flex items-center gap-1"
          >
            <input
              ref={saveInputRef}
              autoFocus
              value={saveInputValue}
              onChange={(e) => setSaveInputValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  setSaveInputOpen(false);
                  setSaveInputValue("");
                }
              }}
              placeholder="View name"
              className="px-2 py-0.5 rounded border border-gray-600 bg-gray-800 text-xs text-gray-200 w-28 focus:outline-none focus:border-blue-500"
            />
            <button
              type="submit"
              disabled={
                !saveInputValue.trim() || !!allViews[saveInputValue.trim()]
              }
              className={`${btnBase} ${saveInputValue.trim() && !allViews[saveInputValue.trim()] ? btnInactive : "border-gray-800 text-gray-600 cursor-not-allowed"}`}
            >
              Save
            </button>
            <button
              type="button"
              onClick={() => {
                setSaveInputOpen(false);
                setSaveInputValue("");
              }}
              className={`${btnBase} ${btnInactive}`}
            >
              ✕
            </button>
          </form>
        ) : (
          <button
            onClick={() => setSaveInputOpen(true)}
            className={`${btnBase} ${btnInactive}`}
          >
            Save…
          </button>
        )}
      </div>

      {dropdownOpen &&
        colsBtnRef.current &&
        createPortal(
          <div
            ref={dropdownRef}
            className="fixed z-50 bg-gray-900 border border-gray-700 rounded shadow-lg py-2 min-w-40 overflow-y-auto"
            style={{
              left: colsBtnRef.current.getBoundingClientRect().left,
              top: colsBtnRef.current.getBoundingClientRect().bottom + 4,
              maxHeight: `calc(100vh - ${colsBtnRef.current.getBoundingClientRect().bottom + 4 + 8}px)`,
            }}
          >
            {Object.entries(COLUMN_GROUPS).map(([groupName, cols], gi) => (
              <div key={groupName}>
                {gi > 0 && <div className="border-t border-gray-700 my-1.5" />}
                <div className="px-3 py-0.5 text-xs text-gray-500 font-medium">
                  {groupName}
                </div>
                {cols.map((col) => (
                  <label
                    key={col.key}
                    className="flex items-center gap-2.5 px-3 py-1 hover:bg-gray-800 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={visible.has(col.key)}
                      onChange={() => toggleCustomCol(col.key)}
                      className="accent-blue-500"
                    />
                    <span
                      className={`text-sm ${visible.has(col.key) ? "text-gray-200" : "text-gray-500"}`}
                    >
                      {col.label}
                    </span>
                  </label>
                ))}
              </div>
            ))}
          </div>,
          document.body,
        )}

      <div
        ref={stickyHeaderRef}
        className="sticky top-0 z-10 overflow-hidden bg-gray-950"
      >
        <table className="min-w-max w-full text-sm">
          <thead>
            <tr className="text-left text-gray-400 border-b border-gray-700">
              <th className="py-2 pr-4 font-medium whitespace-nowrap">
                <button
                  type="button"
                  onClick={() => toggleSort("province")}
                  className="inline-flex items-center gap-1 hover:text-gray-200 transition-colors"
                >
                  <span>Province</span>
                  <span className={sortIndicatorClass("province")}>
                    {sortIndicator("province")}
                  </span>
                </button>
              </th>
              {visibleCols.map((col) => (
                <th
                  key={col.key}
                  className={`py-2 pr-4 font-medium whitespace-nowrap ${TEXT_LEFT.has(col.key) ? "" : "text-right"}`}
                >
                  <button
                    type="button"
                    onClick={() => toggleSort(col.key)}
                    className={`inline-flex items-center gap-1 hover:text-gray-200 transition-colors ${TEXT_LEFT.has(col.key) ? "" : "justify-end w-full"}`}
                  >
                    <Tooltip content={col.desc}>{col.label}</Tooltip>
                    <span className={sortIndicatorClass(col.key)}>
                      {sortIndicator(col.key)}
                    </span>
                  </button>
                </th>
              ))}
            </tr>
          </thead>
        </table>
      </div>

      <div
        ref={bodyScrollRef}
        className="overflow-x-auto"
        onScroll={(e) => {
          if (stickyHeaderRef.current)
            stickyHeaderRef.current.scrollLeft = e.currentTarget.scrollLeft;
        }}
      >
        <table className="min-w-max w-full text-sm">
          <thead
            ref={mainTheadRef}
            className="pointer-events-none"
            style={{ visibility: "collapse" }}
            aria-hidden="true"
          >
            <tr className="text-left text-gray-400">
              <th className="py-2 pr-4 font-medium whitespace-nowrap">
                <button
                  type="button"
                  className="inline-flex items-center gap-1"
                >
                  <span>Province</span>
                  <span className="text-xs">{sortIndicator("province")}</span>
                </button>
              </th>
              {visibleCols.map((col) => (
                <th
                  key={col.key}
                  className={`py-2 pr-4 font-medium whitespace-nowrap ${TEXT_LEFT.has(col.key) ? "" : "text-right"}`}
                >
                  <button
                    type="button"
                    className={`inline-flex items-center gap-1 ${TEXT_LEFT.has(col.key) ? "" : "justify-end w-full"}`}
                  >
                    <span>{col.label}</span>
                    <span className="text-xs">{sortIndicator(col.key)}</span>
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sortedProvinces.map((p) => {
              const dotAge = p.overview_age ?? p.military_age;
              return (
                <tr
                  key={p.id}
                  onClick={() => setSelectedRowId(p.id)}
                  className={`border-b border-gray-800 cursor-pointer hover:bg-gray-800/40 ${
                    selectedRowId === p.id
                      ? "bg-blue-950/25 ring-1 ring-inset ring-blue-500/50"
                      : ""
                  }`}
                >
                  <td className="py-2 pr-4">
                    <Tooltip content={tooltipContentFor(p, "age")}>
                      <span
                        className={`mr-1.5 ${selectedRowId === p.id ? "text-blue-300" : freshnessColor(dotAge)}`}
                      >
                        ●
                      </span>
                    </Tooltip>
                    {p.slot != null && (
                      <span className="mr-1.5 text-xs tabular-nums text-gray-500">
                        #{p.slot}
                      </span>
                    )}
                    <Link
                      href={`/kingdom/${kingdom}/${encodeURIComponent(p.name)}`}
                      className={`transition-colors ${selectedRowId === p.id ? "text-blue-100" : "hover:text-blue-400"}`}
                    >
                      {p.name}
                    </Link>
                  </td>
                  {visibleCols.map((col) => {
                    const age = freshnessAgeFor(p, col.key);
                    const fc = col.key === "age" ? "" : freshnessColor(age);
                    return (
                      <td
                        key={col.key}
                        className={`py-2 pr-4 tabular-nums ${TEXT_LEFT.has(col.key) ? "" : "text-right"} ${fc}`}
                      >
                        <Tooltip content={tooltipContentFor(p, col.key)}>
                          {cellValue(p, col.key)}
                        </Tooltip>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
