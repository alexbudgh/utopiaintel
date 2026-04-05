import { RACE_GROUP, HONOR_TITLE_GROUP } from "../game";
import type { KingdomData, KingdomProvince } from "./types";
import { INT, KDLOC, parseNum } from "./util";

const NAME_LOC_RE = new RegExp(
  `(?:kingdom of|Current kingdom is) ([^(]+)${KDLOC}`,
  "i",
);
const TOTAL_PROVS_RE = new RegExp(`Total Provinces\\s*(${INT})`);
const WAR_RE = new RegExp(`at war with ([^(]+)${KDLOC}`, "i");

// Province list pattern: name, optional marker (*+^~), race, land(a), nw(gc), nwpa(gc), honor, optional gains
const PROVINCE_RE = new RegExp(
  `\\s+(.+?)([*+^~]| \\([MS]\\)[*+^~]?)?\\s+` +
  `(${RACE_GROUP})\\s+` +
  `(${INT})a\\s+` +
  `(${INT})gc\\s+` +
  `${INT}gc\\s+` +
  `(${HONOR_TITLE_GROUP})`,
  "gi",
);

// Older format uses "acres" instead of "a"
const OLD_PROVINCE_RE = new RegExp(
  `\\d{1,2}\\s+(.+?)([*+^~]| \\([MS]\\)[*+^~]?)?\\s+` +
  `(${RACE_GROUP})\\s+` +
  `(${INT}) acres\\s+` +
  `(${INT})gc\\s+` +
  `${INT}gc\\s+` +
  `(${HONOR_TITLE_GROUP})`,
  "gi",
);

export function parseKingdom(text: string): KingdomData | null {
  const nameMatch = NAME_LOC_RE.exec(text);
  if (!nameMatch) return null;

  const kdName = nameMatch[1].trim();
  const location = nameMatch[2];

  const warMatch = WAR_RE.exec(text);
  const warTarget = warMatch ? warMatch[2] : null;

  const provinces: KingdomProvince[] = [];

  // Try new format first, then old
  let m: RegExpExecArray | null;
  while ((m = PROVINCE_RE.exec(text)) !== null) {
    const name = m[1].trim().replace(/ +/g, " ");
    if (/[/<>"]/.test(name)) continue; // invalid
    provinces.push({
      name,
      race: m[3],
      land: parseNum(m[4]),
      networth: parseNum(m[5]),
      honorTitle: m[6],
    });
  }

  if (provinces.length === 0) {
    while ((m = OLD_PROVINCE_RE.exec(text)) !== null) {
      const name = m[1].trim().replace(/ +/g, " ");
      if (/[/<>"]/.test(name)) continue;
      provinces.push({
        name,
        race: m[3],
        land: parseNum(m[4]),
        networth: parseNum(m[5]),
        honorTitle: m[6],
      });
    }
  }

  if (provinces.length === 0) return null;

  // Validate count if available
  const totalMatch = TOTAL_PROVS_RE.exec(text);
  if (totalMatch) {
    const expected = parseNum(totalMatch[1]);
    if (provinces.length !== expected) {
      console.warn(`Kingdom parse: expected ${expected} provinces, got ${provinces.length}`);
    }
  }

  return { name: kdName, location, warTarget, provinces };
}
