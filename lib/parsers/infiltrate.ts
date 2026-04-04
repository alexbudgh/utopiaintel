import type { InfiltrateData } from "./types";
import { KDLOC, INT, parseNum, parseAccuracy } from "./util";

const PROVINCE_RE = new RegExp(`infiltrated the Thieves' Guilds of ([^(]+)${KDLOC}`);
const THIEVES_RE = new RegExp(`about (${INT}) thieves employed`);

export function parseInfiltrate(text: string): InfiltrateData | null {
  const provMatch = PROVINCE_RE.exec(text);
  if (!provMatch) return null;

  const thievesMatch = THIEVES_RE.exec(text);
  if (!thievesMatch) return null;

  return {
    name: provMatch[1].trim(),
    kingdom: provMatch[2],
    thieves: parseNum(thievesMatch[1]),
    accuracy: parseAccuracy(text),
  };
}
