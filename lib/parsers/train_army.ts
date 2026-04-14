import type { TrainArmyData } from "./types";
import { INT, parseNum } from "./util";

const FREE_CREDITS_RE = new RegExp(`Free specialist credits left\\s*(${INT})`, "i");

export function parseTrainArmy(text: string, selfProv?: string): TrainArmyData | null {
  if (!selfProv) return null; // only valid as self-intel
  const m = FREE_CREDITS_RE.exec(text);
  if (!m) return null;
  return { name: selfProv, kingdom: "", freeSpecialistCredits: parseNum(m[1]) };
}
