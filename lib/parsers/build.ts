import type { BuildData } from "./types";
import { INT, parseNum } from "./util";

const FREE_CREDITS_RE = new RegExp(`Free Building Credits\\s*(${INT})`, "i");

export function parseBuild(text: string, selfProv?: string): BuildData | null {
  if (!selfProv) return null;
  const m = FREE_CREDITS_RE.exec(text);
  if (!m) return null;
  return { name: selfProv, kingdom: "", freeBuildingCredits: parseNum(m[1]) };
}
