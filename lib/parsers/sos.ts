import { SCIENCE_GROUP, normalizeScienceName } from "../game";
import type { SoSData, ScienceEntry } from "./types";
import { INT, FLOAT, KDLOC, parseNum, parseFloat_, parseAccuracy } from "./util";

const PROVINCE_RE = new RegExp(
  `Our thieves visit the research centers of ([^(]+)${KDLOC}`,
);
const SCIENCE_RE = new RegExp(
  `(${SCIENCE_GROUP})\\s+(${INT})\\s+[+-]?(${FLOAT})%`,
  "gi",
);

export function parseSoS(text: string): SoSData | null {
  const provMatch = PROVINCE_RE.exec(text);
  // Self-SoS won't have province — skip for now
  if (!provMatch) return null;

  const name = provMatch[1].trim();
  const kingdom = provMatch[2];
  const accuracy = parseAccuracy(text);

  const sciences: ScienceEntry[] = [];
  let m: RegExpExecArray | null;
  while ((m = SCIENCE_RE.exec(text)) !== null) {
    sciences.push({
      science: normalizeScienceName(m[1]),
      books: parseNum(m[2]),
      effect: parseFloat_(m[3]),
    });
  }

  if (sciences.length === 0) return null;

  return { name, kingdom, sciences, accuracy };
}
