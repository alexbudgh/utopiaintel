import { BUILDING_GROUP } from "../game";
import type { SurveyData, SurveyBuilding } from "./types";
import { INT, KDLOC, parseNum, parseFloat_, parseAccuracy } from "./util";

const PROVINCE_RE = new RegExp(`Our thieves scour the lands of ([^(]+)${KDLOC}`);
const BUILDING_RE = new RegExp(`(${BUILDING_GROUP})\\s+((?:${INT}(?:\\s+|\\*))+)`, "gi");

export function parseSurvey(text: string, selfProv?: string): SurveyData | null {
  const provMatch = PROVINCE_RE.exec(text);
  if (!provMatch && !selfProv) return null;

  const name = provMatch ? provMatch[1].trim() : selfProv!;
  const kingdom = provMatch ? provMatch[2] : "";
  const accuracy = provMatch ? parseAccuracy(text) : 100;

  const seen = new Set<string>();
  const buildings: SurveyBuilding[] = [];

  let m: RegExpExecArray | null;
  while ((m = BUILDING_RE.exec(text)) !== null) {
    const building = m[1];
    const amounts = m[2].trim().split(/[\s*]+/).map(parseNum);
    const total = amounts.reduce((a, b) => a + b, 0);

    if (total === 0) continue;

    // First occurrence = built, second = in progress
    const existing = buildings.find((b) => b.building === building);
    if (existing) {
      existing.inProgress = total;
    } else {
      seen.add(building);
      buildings.push({ building, built: total, inProgress: 0 });
    }
  }

  const THIEF_EFFECT_RE = /([\d.]+)% higher thievery effectiveness/i;
  const PREVENT_RE = /([\d.]+)% chance of preventing enemy thief missions/i;
  const CASTLES_RE = /([\d.]+)% lower resource and honor losses when attacked/i;
  const thieveryMatch = THIEF_EFFECT_RE.exec(text);
  const preventMatch = PREVENT_RE.exec(text);
  const castlesMatch = CASTLES_RE.exec(text);
  const thieveryEffectiveness = thieveryMatch ? parseFloat_(thieveryMatch[1]) : null;
  const thiefPreventChance = preventMatch ? parseFloat_(preventMatch[1]) : null;
  const castlesEffect = castlesMatch ? parseFloat_(castlesMatch[1]) : null;

  return { name, kingdom, buildings, thieveryEffectiveness, thiefPreventChance, castlesEffect, accuracy };
}
