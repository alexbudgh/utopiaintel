"use client";

import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { Tooltip, toneClass, type TooltipLine } from "@/app/components/Tooltip";
import type { ProvinceRow } from "@/lib/db";
import { freshnessColor, formatNum, timeAgo, formatTimestamp, sameTick, fullValueTooltip, parseUtc } from "@/lib/ui";
import { computeWizardCount, NW_PER_WIZARD } from "@/lib/nw";
import { computeAmbushRawOff } from "@/lib/ambush";
import { estimatePop } from "@/lib/population";
import { overpopulationTone } from "@/lib/overpopulation";

const COLUMNS = [
  { key: "race",        label: "Race",        group: "Overview",  desc: "Race"                                        },
  { key: "personality", label: "Personality", group: "Overview",  desc: "Personality"                                 },
  { key: "honor_title", label: "Honor",       group: "Overview",  desc: "Honor title (from SoT or kingdom page)"      },
  { key: "land",        label: "Land",        group: "Overview",  desc: "Acres of land"                               },
  { key: "networth",    label: "NW",          group: "Overview",  desc: "Networth"                                    },
  { key: "pop_pct",     label: "Pop%",        group: "Overview",  desc: "Current population / max population\nSelf: direct from council state\nEnemy: estimated from SoT+SoM+Survey+SoS\n~prefix = wizards estimated from NW residual" },
  { key: "hit_status",  label: "MAP",         group: "Overview",  desc: "Multi-Attack Protection warning from SoT\nExamples: a little, moderately, pretty heavily, extremely badly" },
  { key: "building_efficiency", label: "BE",  group: "Overview",  desc: "Building efficiency"                         },
  { key: "armies",      label: "Armies",      group: "Overview",  desc: "Armies currently out (SoM): count · land incoming · soonest return" },
  { key: "off_points",  label: "Off",         group: "Military",  desc: "Total modified offense (province-wide, SoT)" },
  { key: "def_points",  label: "Def",         group: "Military",  desc: "Total modified defense (province-wide, SoT)" },
  { key: "soldiers",    label: "Soldiers",    group: "Troops",    desc: "Total soldiers (SoT)"                        },
  { key: "off_specs",   label: "Off specs",   group: "Troops",    desc: "Total off specs (SoT)"                       },
  { key: "def_specs",   label: "Def specs",   group: "Troops",    desc: "Total def specs (SoT)"                       },
  { key: "elites",      label: "Elites",      group: "Troops",    desc: "Total elites (SoT)"                          },
  { key: "war_horses",  label: "Horses",      group: "Troops",    desc: "Total war horses (SoT)"                      },
  { key: "peasants",    label: "Peasants",    group: "Troops",    desc: "Peasants"                                    },
  { key: "soldiers_home",  label: "SolHome",  group: "Troops",    desc: "Soldiers at home (SoM)"                      },
  { key: "off_specs_home", label: "OSpec Home", group: "Troops",  desc: "Off specs at home (SoM)"                     },
  { key: "def_specs_home", label: "DSpec Home", group: "Troops",  desc: "Def specs at home (SoM)"                     },
  { key: "elites_home",    label: "EliHome",  group: "Troops",    desc: "Elites at home (SoM)"                        },
  { key: "off_home",       label: "OffHome",  group: "Military",  desc: "Modified offense at home (SoM)"              },
  { key: "def_home",       label: "DefHome",  group: "Military",  desc: "Modified defense at home (SoM/SoD)"          },
  { key: "good_spells", label: "Good Spells", group: "Overview",  desc: "Active good spells from latest self-throne data" },
  { key: "bad_spells",  label: "Bad Spells",  group: "Overview",  desc: "Active bad spells from latest self-throne data" },
  { key: "ome",         label: "OME",         group: "Military",  desc: "Offensive military effectiveness % (SoM)"    },
  { key: "dme",         label: "DME",         group: "Military",  desc: "Defensive military effectiveness % (SoM)"    },
  { key: "free_specialist_credits", label: "Spec Credits",  group: "Military", desc: "Free specialist credits remaining (self train_army page)" },
  { key: "free_building_credits",   label: "Build Credits", group: "Resources", desc: "Free building credits remaining (self build page)" },
  { key: "money",         label: "Gold",          group: "Resources", desc: "Gold on hand"                            },
  { key: "food",          label: "Food",          group: "Resources", desc: "Food on hand"                            },
  { key: "runes",         label: "Runes",         group: "Resources", desc: "Runes on hand"                           },
  { key: "prisoners",     label: "Prisoners",     group: "Resources", desc: "Prisoners"                               },
  { key: "trade_balance", label: "Trade bal.",    group: "Resources", desc: "Trade balance"                           },
  { key: "thieves",     label: "Thieves",     group: "Resources", desc: "Thieves"                                     },
  { key: "wizards",     label: "Wizards",     group: "Resources", desc: "Wizards"                                     },
  { key: "age",         label: "Age",         group: "Overview",  desc: "Most recent intel across all sources\nOther columns may have older data — hover them to check"    },
  { key: "rtpa",        label: "rTPA",        group: "T/M",       desc: "Raw TPA = thieves / land\nNeeds: Infiltrate Thieves' Dens + SoT (same tick)"                   },
  { key: "mtpa",        label: "mTPA",        group: "T/M",       desc: "Modified TPA = rTPA × (1 + Crime%)\nNeeds: rTPA sources + SoS (same tick)"                     },
  { key: "otpa",        label: "oTPA",        group: "T/M",       desc: "Offensive TPA = mTPA × (1 + Thieves' Den%)\nNeeds: mTPA sources + Survey (same tick)"          },
  { key: "dtpa",        label: "dTPA",        group: "T/M",       desc: "Defensive TPA = mTPA × (1 + Watch Tower prevent%)\nNeeds: mTPA sources + Survey (same tick)"   },
  { key: "rwpa",        label: "rWPA",        group: "T/M",       desc: "Raw WPA = wizards ÷ land\nSelf: direct from throne (needs same tick as land)\nEnemy: back-calc from NW residual (needs SoT+SoS+Survey+Infiltrate same tick)" },
  { key: "mwpa",        label: "mWPA",        group: "T/M",       desc: "Modified WPA = rWPA × (1 + Channeling%)\nAlso needs SoS same tick as other sources"               },
] as const;

type ColKey = (typeof COLUMNS)[number]["key"];
type SortKey = ColKey | "province" | "slot";
type SortDir = "asc" | "desc";
const DEFAULT_SORT: { key: SortKey; dir: SortDir } = { key: "slot", dir: "asc" };

const VIEWS: Record<string, ColKey[]> = {
  Overview:  ["race", "personality", "honor_title", "land", "networth", "pop_pct", "armies", "off_points", "def_points", "def_home", "good_spells", "bad_spells", "hit_status", "peasants", "building_efficiency", "age"],
  Military:  ["land", "armies", "off_points", "def_points", "off_home", "def_home", "ome", "dme", "free_specialist_credits", "soldiers_home", "off_specs_home", "def_specs_home", "elites_home", "peasants", "age"],
  Resources: ["land", "networth", "pop_pct", "money", "food", "runes", "prisoners", "trade_balance", "war_horses", "peasants", "thieves", "wizards", "free_building_credits", "age"],
  "T/M":     ["land", "rtpa", "mtpa", "otpa", "dtpa", "rwpa", "mwpa", "age"],
};
const VIEW_NAMES = Object.keys(VIEWS);

// Columns grouped for the dropdown panel
const COLUMN_GROUPS = COLUMNS.reduce((acc, col) => {
  (acc[col.group] ??= []).push(col);
  return acc;
}, {} as Record<string, (typeof COLUMNS)[number][]>);

const STORAGE_VIEW_KEY = "province-view";
const STORAGE_COLS_KEY = "province-columns";

function sortValueFor(p: ProvinceRow, key: SortKey): number | string | null {
  switch (key) {
    case "province": return p.name;
    case "slot": return p.slot;
    case "race": return p.race;
    case "personality": return p.personality;
    case "honor_title": return p.honor_title;
    case "good_spells": return p.good_spell_count ?? 0;
    case "bad_spells": return p.bad_spell_count ?? 0;
    case "armies": return p.armies_out_count ?? 0;
    case "land": return p.land;
    case "networth": return p.networth;
    case "hit_status": return p.hit_status;
    case "building_efficiency": return p.building_efficiency;
    case "off_points": return p.off_points;
    case "def_points": return p.def_points;
    case "soldiers": return p.soldiers;
    case "off_specs": return p.off_specs;
    case "def_specs": return p.def_specs;
    case "elites": return p.elites;
    case "war_horses": return p.war_horses;
    case "peasants": return p.peasants;
    case "soldiers_home": return p.soldiers_home;
    case "off_specs_home": return p.off_specs_home;
    case "def_specs_home": return p.def_specs_home;
    case "elites_home": return p.elites_home;
    case "off_home": return p.off_home;
    case "def_home": return p.def_home;
    case "ome": return p.ome;
    case "dme": return p.dme;
    case "free_specialist_credits": return p.free_specialist_credits;
    case "free_building_credits": return p.free_building_credits;
    case "money": return p.money;
    case "food": return p.food;
    case "runes": return p.runes;
    case "prisoners": return p.prisoners;
    case "trade_balance": return p.trade_balance;
    case "thieves": return p.thieves;
    case "wizards": return p.wizards;
    case "age": return ageFor(p, "age");
    case "rtpa": return computeRtpa(p);
    case "mtpa": return computeMtpa(p);
    case "otpa": return computeOtpa(p);
    case "dtpa": return computeDtpa(p);
    case "rwpa": return computeRwpa(p);
    case "mwpa": return computeMwpa(p);
    case "pop_pct": return computePopPct(p)?.pct ?? null;
  }
}

function compareSortValues(a: number | string | null, b: number | string | null): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b), undefined, { sensitivity: "base" });
}

function computeRtpa(p: ProvinceRow): number | null {
  if (p.thieves == null || !p.land) return null;
  if (!sameTick(p.thieves_age, p.overview_age)) return null;
  return p.thieves / p.land;
}

function computeMtpa(p: ProvinceRow): number | null {
  const rtpa = computeRtpa(p);
  if (rtpa == null || p.crime_effect == null) return null;
  if (!sameTick(p.thieves_age, p.overview_age, p.sciences_age)) return null;
  return rtpa * (1 + p.crime_effect / 100);
}

function computeOtpa(p: ProvinceRow): number | null {
  const mtpa = computeMtpa(p);
  if (mtpa == null || p.thieves_dens_effect == null) return null;
  if (!sameTick(p.thieves_age, p.overview_age, p.sciences_age, p.survey_age)) return null;
  return mtpa * (1 + p.thieves_dens_effect / 100);
}

function computeDtpa(p: ProvinceRow): number | null {
  const mtpa = computeMtpa(p);
  if (mtpa == null || p.watch_towers_effect == null) return null;
  if (!sameTick(p.thieves_age, p.overview_age, p.sciences_age, p.survey_age)) return null;
  return mtpa * (1 + p.watch_towers_effect / 100);
}

function computePopPct(p: ProvinceRow): { pct: number; estimated: boolean } | null {
  // Self-province: direct council state values
  if (p.total_pop != null && p.max_pop != null && p.max_pop > 0) {
    return { pct: p.total_pop / p.max_pop, estimated: false };
  }
  // Enemy: estimate from available intel
  const pop = estimatePop({
    race: p.race, honor_title: p.honor_title, personality: p.personality,
    barren_land: p.barren_land, homes_built: p.homes_built,
    buildings_built: p.buildings_built, buildings_in_progress: p.buildings_in_progress,
    survey_age: p.survey_age, housing_effect: p.housing_effect,
    sciences_age: p.sciences_age, science_total_books: p.science_total_books,
    networth: p.networth, land: p.land,
    peasants: p.peasants, soldiers: p.soldiers, off_specs: p.off_specs,
    def_specs: p.def_specs, elites: p.elites, war_horses: p.war_horses,
    money: p.money, thieves: p.thieves, thieves_age: p.thieves_age,
    wizards: p.wizards, prisoners: p.prisoners,
    troops_age: p.troops_age, resources_age: p.resources_age,
    training_off_specs: null, training_def_specs: null,
    training_elites: null, training_thieves: null, som_age: p.som_age,
  });
  if (pop.currentPop == null || pop.maxPop == null || pop.maxPop === 0) return null;
  return { pct: pop.currentPop / pop.maxPop, estimated: pop.wizardsEstimated };
}

function computeRwpa(p: ProvinceRow): number | null {
  if (!p.land) return null;
  // Direct: wizards known from throne/self-intel
  if (p.wizards != null) {
    if (!sameTick(p.resources_age, p.overview_age)) return null;
    return p.wizards / p.land;
  }
  // Back-calculate from NW residual (enemy provinces)
  if (!p.networth || !p.race) return null;
  if (!sameTick(p.thieves_age, p.overview_age, p.sciences_age, p.survey_age)) return null;
  const w = computeWizardCount(p);
  return w != null ? w / p.land : null;
}

function computeMwpa(p: ProvinceRow): number | null {
  if (!p.channeling_effect) return null;
  const rwpa = computeRwpa(p);
  if (rwpa == null) return null;
  // For direct wizard path, sciences must also be same tick as overview
  if (p.wizards != null && !sameTick(p.resources_age, p.overview_age, p.sciences_age)) return null;
  return rwpa * (1 + p.channeling_effect / 100);
}

function ageFor(p: ProvinceRow, key: ColKey): string | null {
  if (key === "age") {
    const candidates = [
      p.overview_age, p.military_age, p.troops_age, p.troops_home_age,
      p.home_mil_age, p.thieves_age, p.resources_age, p.status_age,
      p.effects_age ?? null, p.som_age, p.throne_age, p.sciences_age, p.survey_age,
    ].filter((v): v is string => v != null);
    return candidates.length ? candidates.reduce((a, b) => (a > b ? a : b)) : null;
  }
  if (key === "armies") {
    const candidates = [p.som_age, p.throne_age].filter((v): v is string => v != null);
    return candidates.length ? candidates.reduce((a, b) => (a > b ? a : b)) : null;
  }
  if (key === "good_spells" || key === "bad_spells") return p.effects_age ?? null;
  if (["soldiers", "off_specs", "def_specs", "elites", "war_horses", "peasants"].includes(key)) return p.troops_age;
  if (["soldiers_home", "off_specs_home", "def_specs_home", "elites_home"].includes(key)) return p.troops_home_age;
  if (["money", "food", "runes", "prisoners", "trade_balance", "building_efficiency", "wizards"].includes(key)) return p.resources_age;
  if (key === "hit_status") return p.status_age;
  if (key === "thieves") return p.thieves_age;
  if (["ome", "dme", "free_specialist_credits"].includes(key)) return p.free_specialist_credits_age ?? p.som_age;
  if (key === "free_building_credits") return p.free_building_credits_age;
  if (["off_points", "def_points"].includes(key)) return p.military_age;
  if (["off_home", "def_home"].includes(key)) return p.home_mil_age;
  if (key === "rtpa") return p.thieves_age ?? p.overview_age;
  if (key === "mtpa") return p.sciences_age;
  if (key === "otpa" || key === "dtpa") return p.survey_age;
  if (key === "rwpa") return p.survey_age;
  if (key === "mwpa") return p.sciences_age;
  if (key === "pop_pct") return p.resources_age ?? p.survey_age;
  return p.overview_age;
}

function sourceFor(p: ProvinceRow, key: ColKey): string | null {
  if (key === "armies") return p.som_age ? "som" : null;
  if (key === "good_spells" || key === "bad_spells") return p.effects_age ? "throne" : null;
  if (["soldiers", "off_specs", "def_specs", "elites", "war_horses", "peasants"].includes(key)) return p.troops_source;
  if (["soldiers_home", "off_specs_home", "def_specs_home", "elites_home"].includes(key)) return "som";
  if (["money", "food", "runes", "prisoners", "trade_balance", "building_efficiency", "thieves", "wizards"].includes(key)) return p.resources_source;
  if (key === "hit_status") return p.status_age ? "sot" : null;
  if (["ome", "dme"].includes(key)) return "som";
  if (["off_points", "def_points"].includes(key)) return "sot";
  if (["off_home", "def_home"].includes(key)) return p.home_mil_age ? "som/sod" : null;
  if (key === "age") return p.overview_source ?? (p.military_age ? "sot" : null);
  if (["rtpa", "mtpa", "otpa", "dtpa"].includes(key)) return null;
  return p.overview_source;
}

function tpaStaleReason(p: ProvinceRow, needSoS: boolean, needSurvey: boolean): string {
  const ages = [p.thieves_age, p.overview_age];
  if (needSoS) ages.push(p.sciences_age);
  if (needSurvey) ages.push(p.survey_age);
  if (ages.some((a) => !a)) return "missing data";
  return "data not from same tick";
}

// Returns the age of whichever source (som/throne) is actually providing army data
function armiesSourceAge(p: ProvinceRow): string | null {
  const throneNewer = !!(p.throne_age && (!p.som_age || p.throne_age > p.som_age));
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

function tipFor(p: ProvinceRow, key: ColKey): string | TooltipLine[] | React.ReactElement {
  // Special case: age column shows all intel source ages
  if (key === "age") {
    const entries: Array<{ label: string; age: string }> = [
      p.overview_age  ? { label: `overview (${p.overview_source ?? "?"})`,       age: p.overview_age  } : null,
      p.military_age  ? { label: "sot",                                           age: p.military_age  } : null,
      p.som_age       ? { label: "som",                                           age: p.som_age       } : null,
      p.throne_age    ? { label: "throne",                                        age: p.throne_age    } : null,
      p.troops_age    ? { label: `troops (${p.troops_source ?? "?"})`,            age: p.troops_age    } : null,
      p.resources_age ? { label: `resources (${p.resources_source ?? "?"})`,     age: p.resources_age } : null,
      p.home_mil_age  ? { label: "off/def home (som/sod)",                       age: p.home_mil_age  } : null,
      p.sciences_age  ? { label: "sciences",                                     age: p.sciences_age  } : null,
      p.survey_age    ? { label: "survey",                                       age: p.survey_age    } : null,
      p.effects_age   ? { label: "spells",                                       age: p.effects_age   } : null,
      p.status_age    ? { label: "status",                                       age: p.status_age    } : null,
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
    type ArmyEntry = { type: string; soldiers: number; offSpecs: number; defSpecs: number; elites: number; land: number; eta: number };
    const armies: ArmyEntry[] = p.armies_out_json ? JSON.parse(p.armies_out_json) : [];
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
        {armies.length === 0
          ? <div className="text-gray-400">All armies home</div>
          : <table>
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
                    <td className={td}>{a.soldiers ? a.soldiers.toLocaleString() : "—"}</td>
                    <td className={td}>{a.offSpecs ? a.offSpecs.toLocaleString() : "—"}</td>
                    <td className={td}>{a.defSpecs ? a.defSpecs.toLocaleString() : "—"}</td>
                    <td className={td}>{a.elites ? a.elites.toLocaleString() : "—"}</td>
                    <td className={td}>{a.land > 0 ? a.land.toLocaleString() : "—"}</td>
                    <td className={td}>{srcAge ? (adjustEta(a.eta, srcAge) > 0 ? `${adjustEta(a.eta, srcAge).toFixed(1)}d` : "ret?") : `${a.eta.toFixed(1)}d`}</td>
                    {showAmbush && <td className={td}>{ambushes[i] != null ? Math.ceil(ambushes[i]!).toLocaleString() : "—"}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
        }
        {p.som_age && <div className={`mt-1 text-xs ${toneClass(freshnessToTone(p.som_age))}`}>{`som: ${timeAgo(p.som_age)} · ${formatTimestamp(p.som_age)}`}</div>}
        {p.throne_age && <div className={`mt-0.5 text-xs ${toneClass(freshnessToTone(p.throne_age))}`}>{`throne: ${timeAgo(p.throne_age)} · ${formatTimestamp(p.throne_age)}`}</div>}
      </div>
    );
  }
  if (key === "good_spells") {
    const lines = [];
    if (p.good_spell_details) lines.push(p.good_spell_details.split(" | ").join(", "));
    if (p.effects_age) lines.push(`throne: ${timeAgo(p.effects_age)} · ${formatTimestamp(p.effects_age)}`);
    return lines.length ? lines.join("\n") : "No active good spell data";
  }
  if (key === "bad_spells") {
    const lines = [];
    if (p.bad_spell_details) lines.push(p.bad_spell_details.split(" | ").join(", "));
    if (p.effects_age) lines.push(`throne: ${timeAgo(p.effects_age)} · ${formatTimestamp(p.effects_age)}`);
    return lines.length ? lines.join("\n") : "No active bad spell data";
  }
  if (key === "rtpa") {
    if (p.thieves == null || !p.land) return "No thieves or land data";
    const ok = sameTick(p.thieves_age, p.overview_age);
    const val = ok ? (p.thieves / p.land).toFixed(2) : "—";
    return `rTPA = ${formatNum(p.thieves)} ÷ ${formatNum(p.land)} = ${val}` + (ok ? "" : `\n(${tpaStaleReason(p, false, false)})`);
  }
  if (key === "mtpa") {
    const rtpa = computeRtpa(p);
    if (rtpa == null) return tipFor(p, "rtpa");
    if (p.crime_effect == null) return `rTPA = ${rtpa.toFixed(2)}\nNo Crime science data`;
    const ok = sameTick(p.thieves_age, p.overview_age, p.sciences_age);
    const val = ok ? (rtpa * (1 + p.crime_effect / 100)).toFixed(2) : "—";
    return `mTPA = ${rtpa.toFixed(2)} × (1 + ${p.crime_effect.toFixed(1)}% Crime) = ${val}` + (ok ? "" : `\n(${tpaStaleReason(p, true, false)})`);
  }
  if (key === "otpa") {
    const mtpa = computeMtpa(p);
    if (mtpa == null) return tipFor(p, "mtpa");
    if (p.thieves_dens_effect == null) return `mTPA = ${mtpa.toFixed(2)}\nNo Survey data`;
    const ok = sameTick(p.thieves_age, p.overview_age, p.sciences_age, p.survey_age);
    const val = ok ? computeOtpa(p)?.toFixed(2) ?? "—" : "—";
    return `oTPA = ${mtpa.toFixed(2)} × (1 + ${p.thieves_dens_effect.toFixed(1)}% Thieves' Den) = ${val}` + (ok ? "" : `\n(${tpaStaleReason(p, true, true)})`);
  }
  if (key === "dtpa") {
    const mtpa = computeMtpa(p);
    if (mtpa == null) return tipFor(p, "mtpa");
    if (p.watch_towers_effect == null) return `mTPA = ${mtpa.toFixed(2)}\nNo Survey data`;
    const ok = sameTick(p.thieves_age, p.overview_age, p.sciences_age, p.survey_age);
    const val = ok ? computeDtpa(p)?.toFixed(2) ?? "—" : "—";
    return `dTPA = ${mtpa.toFixed(2)} × (1 + ${p.watch_towers_effect.toFixed(1)}% Watch Tower) = ${val}` + (ok ? "" : `\n(${tpaStaleReason(p, true, true)})`);
  }
  if (key === "rwpa") {
    if (!p.land) return "No land data";
    if (p.wizards != null) {
      const ok = sameTick(p.resources_age, p.overview_age);
      if (!ok) return "Wizards and land not from same tick";
      return `rWPA = ${formatNum(p.wizards)} ÷ ${formatNum(p.land)} = ${(p.wizards / p.land).toFixed(2)}\n(direct from throne/self-intel)`;
    }
    if (!p.networth || !p.race) return "Missing NW, land, or race data";
    const ok = sameTick(p.thieves_age, p.overview_age, p.sciences_age, p.survey_age);
    const w = ok ? computeWizardCount(p) : null;
    if (w == null) return ok ? "Missing SoT/SoS/Survey/Infiltrate data" : "data not from same tick";
    const rwpa = w / p.land;
    return `wizards ≈ (${formatNum(p.networth)} NW residual) ÷ ${NW_PER_WIZARD} = ${Math.round(w).toLocaleString()}\nrWPA = ${Math.round(w).toLocaleString()} ÷ ${formatNum(p.land)} = ${rwpa.toFixed(2)}`;
  }
  if (key === "mwpa") {
    const rwpa = computeRwpa(p);
    if (rwpa == null) return tipFor(p, "rwpa");
    if (p.channeling_effect == null) return `rWPA = ${rwpa.toFixed(2)}\nNo Channeling science data`;
    const val = computeMwpa(p)?.toFixed(2) ?? "—";
    return `mWPA = ${rwpa.toFixed(2)} × (1 + ${p.channeling_effect.toFixed(1)}% Channeling) = ${val}`;
  }
  const age = ageFor(p, key);
  const source = sourceFor(p, key);
  if (!age) return "";
  return [source, timeAgo(age), formatTimestamp(age)].filter(Boolean).join(" · ");
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
      return typeof value === "number" ? fullValueTooltip(formatNum(value), value) : null;
    }
    case "trade_balance":
      return p.trade_balance != null
        ? fullValueTooltip(
            `${p.trade_balance >= 0 ? "+" : ""}${formatNum(p.trade_balance)}`,
            p.trade_balance,
          )
        : null;
    case "ome":
      return p.ome != null ? fullValueTooltip(`${p.ome.toFixed(1)}%`, p.ome, { suffix: "%" }) : null;
    case "dme":
      return p.dme != null ? fullValueTooltip(`${p.dme.toFixed(1)}%`, p.dme, { suffix: "%" }) : null;
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

function tooltipContentFor(p: ProvinceRow, key: ColKey): string | TooltipLine[] | React.ReactElement {
  const rounded = roundedValueTipFor(p, key);
  const base = tipFor(p, key);
  if (Array.isArray(base) || typeof base === "object" && base !== null) return base;
  return [rounded, base].filter(Boolean).join("\n");
}

function cellValue(p: ProvinceRow, key: ColKey): React.ReactNode {
  switch (key) {
    case "race":        return <span className="text-gray-400">{p.race ?? "—"}</span>;
    case "personality": return <span className="text-gray-400">{p.personality ?? "—"}</span>;
    case "honor_title": return <span className="text-gray-400">{p.honor_title ?? "—"}</span>;
    case "armies": {
      const srcAge = armiesSourceAge(p);
      if (!srcAge) return "—";
      const out = p.armies_out_count ?? 0;
      if (out === 0) return <span className="text-gray-600">home</span>;
      const eta = p.earliest_return != null ? adjustEta(p.earliest_return, srcAge) : null;
      return (
        <span className="font-mono text-xs">
          {out}✦
          {p.land_incoming ? ` +${p.land_incoming.toLocaleString()}a` : ""}
          {eta != null ? (eta > 0 ? ` ${eta.toFixed(1)}d` : " ret?") : ""}
        </span>
      );
    }
    case "good_spells": return (p.good_spell_count ?? 0) > 0
      ? <span className="rounded border border-blue-500/40 bg-blue-500/10 px-1.5 py-0.5 text-[10px] font-medium text-blue-300">+{p.good_spell_count}</span>
      : "—";
    case "bad_spells": return (p.bad_spell_count ?? 0) > 0
      ? <span className="rounded border border-red-500/40 bg-red-500/10 px-1.5 py-0.5 text-[10px] font-medium text-red-300">-{p.bad_spell_count}</span>
      : "—";
    case "land":        return p.land != null ? p.land.toLocaleString() : "—";
    case "networth":    return formatNum(p.networth);
    case "hit_status":  return p.hit_status ?? "—";
    case "off_points":  return formatNum(p.off_points);
    case "def_points":  return formatNum(p.def_points);
    case "soldiers":    return formatNum(p.soldiers);
    case "off_specs":   return formatNum(p.off_specs);
    case "def_specs":   return formatNum(p.def_specs);
    case "elites":        return formatNum(p.elites);
    case "war_horses":      return formatNum(p.war_horses);
    case "peasants":        return formatNum(p.peasants);
    case "soldiers_home":   return formatNum(p.soldiers_home);
    case "off_specs_home":  return formatNum(p.off_specs_home);
    case "def_specs_home":  return formatNum(p.def_specs_home);
    case "elites_home":     return formatNum(p.elites_home);
    case "off_home":        return formatNum(p.off_home);
    case "def_home":        return formatNum(p.def_home);
    case "ome":         return p.ome != null ? p.ome.toFixed(1) + "%" : "—";
    case "dme":         return p.dme != null ? p.dme.toFixed(1) + "%" : "—";
    case "free_specialist_credits": return formatNum(p.free_specialist_credits);
    case "free_building_credits":   return formatNum(p.free_building_credits);
    case "money":         return formatNum(p.money);
    case "food":          return formatNum(p.food);
    case "runes":         return formatNum(p.runes);
    case "prisoners":     return formatNum(p.prisoners);
    case "trade_balance": return p.trade_balance != null ? (p.trade_balance >= 0 ? "+" : "") + formatNum(p.trade_balance) : "—";
    case "building_efficiency": return p.building_efficiency != null ? p.building_efficiency + "%" : "—";
    case "thieves":     return formatNum(p.thieves);
    case "wizards":     return formatNum(p.wizards);
    case "age": {
      const a = ageFor(p, "age");
      return <span className={freshnessColor(a)}>{timeAgo(a)}</span>;
    }
    case "rtpa": { const v = computeRtpa(p); return v != null ? v.toFixed(2) : "—"; }
    case "mtpa": { const v = computeMtpa(p); return v != null ? v.toFixed(2) : "—"; }
    case "otpa": { const v = computeOtpa(p); return v != null ? v.toFixed(2) : "—"; }
    case "dtpa": { const v = computeDtpa(p); return v != null ? v.toFixed(2) : "—"; }
    case "rwpa": { const v = computeRwpa(p); return v != null ? v.toFixed(2) : "—"; }
    case "mwpa": { const v = computeMwpa(p); return v != null ? v.toFixed(2) : "—"; }
    case "pop_pct": {
      const r = computePopPct(p);
      if (!r) return "—";
      const pct = (r.pct * 100).toFixed(1);
      return <span className={overpopulationTone(r.pct).textClass}>{r.estimated ? "~" : ""}{pct}%</span>;
    }
  }
}

const TEXT_LEFT = new Set<ColKey>(["race", "personality"]);

export function ProvinceTable({
  kingdom,
  initial,
}: {
  kingdom: string;
  initial: ProvinceRow[];
}) {
  const [provinces, setProvinces] = useState(initial);
  const [selectedRowId, setSelectedRowId] = useState<number | null>(null);
  const [activeView, setActiveView] = useState<string | null>("Overview");
  const [customCols, setCustomCols] = useState<Set<ColKey>>(new Set(VIEWS.Overview));
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir } | null>(DEFAULT_SORT);
  const colsBtnRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Derived: visible cols from active view or custom set
  const visible: Set<ColKey> = activeView ? new Set(VIEWS[activeView]) : customCols;

  // Load prefs from localStorage after mount (SSR-safe)
  useEffect(() => {
    try {
      const savedView = localStorage.getItem(STORAGE_VIEW_KEY);
      const savedCols = localStorage.getItem(STORAGE_COLS_KEY);
      if (savedView && VIEWS[savedView]) {
        setActiveView(savedView);
      } else if (savedCols) {
        setCustomCols(new Set(JSON.parse(savedCols) as ColKey[]));
        setActiveView(null);
      }
    } catch {}
  }, []);

  // Persist prefs
  useEffect(() => {
    localStorage.setItem(STORAGE_VIEW_KEY, activeView ?? "");
    if (!activeView) {
      localStorage.setItem(STORAGE_COLS_KEY, JSON.stringify([...customCols]));
    }
  }, [activeView, customCols]);

  // Close dropdown on outside click
  useEffect(() => {
    if (!dropdownOpen) return;
    function handleDown(e: MouseEvent) {
      if (
        dropdownRef.current?.contains(e.target as Node) ||
        colsBtnRef.current?.contains(e.target as Node)
      ) return;
      setDropdownOpen(false);
    }
    document.addEventListener("mousedown", handleDown);
    return () => document.removeEventListener("mousedown", handleDown);
  }, [dropdownOpen]);

  // Poll every 30s
  useEffect(() => {
    const id = setInterval(async () => {
      const res = await fetch(`/api/kingdom/${encodeURIComponent(kingdom)}`);
      if (res.ok) setProvinces(await res.json());
    }, 30_000);
    return () => clearInterval(id);
  }, [kingdom]);

  const selectView = (name: string) => {
    setActiveView(name);
    setDropdownOpen(false);
  };

  const toggleCustomCol = (key: ColKey) => {
    const base = activeView ? new Set(VIEWS[activeView]) : customCols;
    const next = new Set(base);
    next.has(key) ? next.delete(key) : next.add(key);
    setActiveView(null);
    setCustomCols(next);
  };

  const visibleCols = COLUMNS.filter((c) => visible.has(c.key));
  const sortedProvinces = sort
    ? [...provinces].sort((a, b) => {
        const av = sortValueFor(a, sort.key);
        const bv = sortValueFor(b, sort.key);
        // nulls always sink to the bottom regardless of direction
        if (av == null && bv == null) return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
        if (av == null) return 1;
        if (bv == null) return -1;
        const cmp = compareSortValues(av, bv);
        if (cmp !== 0) return sort.dir === "asc" ? cmp : -cmp;
        return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
      })
    : provinces;

  const btnBase = "px-2.5 py-1 rounded text-xs border transition-colors";
  const btnActive = "border-blue-500 text-blue-300 bg-blue-950/40";
  const btnInactive = "border-gray-700 text-gray-500 hover:border-gray-500 hover:text-gray-300";

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
        <div className="w-px h-4 bg-gray-700 mx-1" />
        <button
          ref={colsBtnRef}
          onClick={() => setDropdownOpen((o) => !o)}
          className={`${btnBase} ${!activeView || dropdownOpen ? btnActive : btnInactive}`}
        >
          Columns ▾
        </button>
        <Link
          href={`/kingdom/${encodeURIComponent(kingdom)}?view=gains`}
          className={`${btnBase} ${btnInactive}`}
        >
          Gains
        </Link>
        <Link
          href={`/kingdom/${encodeURIComponent(kingdom)}?view=news`}
          className={`${btnBase} ${btnInactive}`}
        >
          News
        </Link>
        <Link
          href={`/kingdom/${encodeURIComponent(kingdom)}?view=history`}
          className={`${btnBase} ${btnInactive}`}
        >
          History
        </Link>
      </div>

      {dropdownOpen && colsBtnRef.current && createPortal(
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
              <div className="px-3 py-0.5 text-xs text-gray-500 font-medium">{groupName}</div>
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
                  <span className={`text-sm ${visible.has(col.key) ? "text-gray-200" : "text-gray-500"}`}>
                    {col.label}
                  </span>
                </label>
              ))}
            </div>
          ))}
        </div>,
        document.body
      )}

      <div className="overflow-x-auto">
        <table className="min-w-max w-full text-sm">
          <thead>
            <tr className="text-left text-gray-400 border-b border-gray-700">
              <th className="py-2 pr-4 font-medium">
                <button
                  type="button"
                  onClick={() => toggleSort("province")}
                  className="inline-flex items-center gap-1 hover:text-gray-200 transition-colors"
                >
                  <span>Province</span>
                  <span className={sortIndicatorClass("province")}>{sortIndicator("province")}</span>
                </button>
              </th>
              {visibleCols.map((col) => (
                <th
                  key={col.key}
                  className={`py-2 pr-4 font-medium ${TEXT_LEFT.has(col.key) ? "" : "text-right"}`}
                >
                  <button
                    type="button"
                    onClick={() => toggleSort(col.key)}
                    className={`inline-flex items-center gap-1 hover:text-gray-200 transition-colors ${TEXT_LEFT.has(col.key) ? "" : "justify-end w-full"}`}
                  >
                    <Tooltip content={col.desc}>{col.label}</Tooltip>
                    <span className={sortIndicatorClass(col.key)}>{sortIndicator(col.key)}</span>
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
                    selectedRowId === p.id ? "bg-blue-950/25 ring-1 ring-inset ring-blue-500/50" : ""
                  }`}
                >
                  <td className="py-2 pr-4">
                    <Tooltip content={tooltipContentFor(p, "age")}>
                      <span className={`mr-1.5 ${selectedRowId === p.id ? "text-blue-300" : freshnessColor(dotAge)}`}>●</span>
                    </Tooltip>
                    {p.slot != null && (
                      <span className="mr-1.5 text-xs tabular-nums text-gray-500">#{p.slot}</span>
                    )}
                    <Link
                      href={`/kingdom/${kingdom}/${encodeURIComponent(p.name)}`}
                      className={`transition-colors ${selectedRowId === p.id ? "text-blue-100" : "hover:text-blue-400"}`}
                    >
                      {p.name}
                    </Link>
                  </td>
                  {visibleCols.map((col) => {
                    const age = ageFor(p, col.key);
                    const fc = col.key === "age" ? "" : freshnessColor(age);
                    return (
                      <td
                        key={col.key}
                        className={`py-2 pr-4 tabular-nums ${TEXT_LEFT.has(col.key) ? "" : "text-right"} ${fc}`}
                      >
                        <Tooltip content={tooltipContentFor(p, col.key)}>{cellValue(p, col.key)}</Tooltip>
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
