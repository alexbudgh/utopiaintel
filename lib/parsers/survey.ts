import { BUILDING_GROUP } from "../game";
import type { SurveyData, SurveyBuilding } from "./types";
import { INT, KDLOC, parseNum, parseAccuracy } from "./util";

const PROVINCE_RE = new RegExp(`Our thieves scour the lands of ([^(]+)${KDLOC}`);
const BUILDING_RE = new RegExp(`(${BUILDING_GROUP})\\s+((?:${INT}(?:\\s+|\\*))+)`, "gi");

export function parseSurvey(text: string): SurveyData | null {
  const provMatch = PROVINCE_RE.exec(text);
  // Self-survey won't have province match — skip for now (need user context)
  if (!provMatch) return null;

  const name = provMatch[1].trim();
  const kingdom = provMatch[2];
  const accuracy = parseAccuracy(text);

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

  return { name, kingdom, buildings, accuracy };
}
