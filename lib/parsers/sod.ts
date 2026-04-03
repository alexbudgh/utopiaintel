import type { SoDData } from "./types";
import { INT, KDLOC, parseNum, parseAccuracy } from "./util";

// Example: "Our thieves have infiltrated the military ranks of Grimhilde (1:11).
//           We were able to determine there is currently 27,191 defense points defending their lands."
const PROVINCE_RE = new RegExp(
  `military ranks of ([^(]+)${KDLOC}`,
);
const DEF_RE = new RegExp(`(${INT}) defense points defending`);

export function parseSoD(text: string): SoDData | null {
  const provMatch = PROVINCE_RE.exec(text);
  if (!provMatch) return null;

  const defMatch = DEF_RE.exec(text);
  if (!defMatch) return null;

  return {
    name: provMatch[1].trim(),
    kingdom: provMatch[2],
    defPoints: parseNum(defMatch[1]),
    accuracy: parseAccuracy(text),
  };
}
