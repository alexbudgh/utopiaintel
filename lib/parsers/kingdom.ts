import { RACE_GROUP, HONOR_TITLE_GROUP } from "../game";
import type { KingdomData, KingdomOpenRelation, KingdomProvince } from "./types";
import { INT, KDLOC, parseNum } from "./util";

const TITLE_NAME_LOC_RE = new RegExp(`The(?: ([^(]+?))? kingdom of ([^(]+)${KDLOC}`, "i");
const CURRENT_NAME_LOC_RE = new RegExp(`Current kingdom is ([^(]+)${KDLOC}`, "i");
const TOTAL_PROVS_RE = new RegExp(`Total Provinces\\s*(${INT})`);
const WAR_RE = new RegExp(`at war with ([^(]+)${KDLOC}`, "i");
const ATTITUDES_RE = /Their Attitude To Us\t([^\t]+?) \(([-\d.]+) points\)\tOur Attitude To Them\t([^\t]+?) \(([-\d.]+) points\)/i;
const HOSTILITY_VISIBLE_RE = /Hostility meter visible until ([^\n]+)/i;
const OPEN_RELATIONS_SECTION_RE = /Open Relations\t?\n([\s\S]*?)\n(?:ThemNormalUnfriendlyHostileWarUs|Provinces)/i;
const OPEN_RELATION_LINE_RE = new RegExp(`^(.+?) ${KDLOC} - ([^\\n]+)$`, "gm");

// Province list pattern: name, optional marker (*+^~), race, land(a), nw(gc), nwpa(gc), honor, optional gains
const PROVINCE_RE = new RegExp(
  `\\b(${INT})\\s+` +
  `(.+?)([*+^~]| \\([MS]\\)[*+^~]?)?\\s+` +
  `(${RACE_GROUP})\\s+` +
  `(${INT})a\\s+` +
  `(${INT})gc\\s+` +
  `${INT}gc\\s+` +
  `(${HONOR_TITLE_GROUP})`,
  "gi",
);

// Older format uses "acres" instead of "a"
const OLD_PROVINCE_RE = new RegExp(
  `\\b(${INT})\\s+` +
  `(.+?)([*+^~]| \\([MS]\\)[*+^~]?)?\\s+` +
  `(${RACE_GROUP})\\s+` +
  `(${INT}) acres\\s+` +
  `(${INT})gc\\s+` +
  `${INT}gc\\s+` +
  `(${HONOR_TITLE_GROUP})`,
  "gi",
);

export function parseKingdom(text: string): KingdomData | null {
  const titledMatch = TITLE_NAME_LOC_RE.exec(text);
  const currentMatch = titledMatch ? null : CURRENT_NAME_LOC_RE.exec(text);
  if (!titledMatch && !currentMatch) return null;

  const kingdomTitle = titledMatch?.[1]?.trim() ?? null;
  const kdName = titledMatch ? titledMatch[2].trim() : currentMatch![1].trim();
  const location = titledMatch ? titledMatch[3] : currentMatch![2];

  const warMatch = WAR_RE.exec(text);
  const warTarget = warMatch ? warMatch[2] : null;
  const attitudesMatch = ATTITUDES_RE.exec(text);
  const hostilityVisibleMatch = HOSTILITY_VISIBLE_RE.exec(text);
  const openRelations: KingdomOpenRelation[] = [];
  const openRelationsSection = OPEN_RELATIONS_SECTION_RE.exec(text)?.[1] ?? "";
  let relationMatch: RegExpExecArray | null;
  while ((relationMatch = OPEN_RELATION_LINE_RE.exec(openRelationsSection)) !== null) {
    openRelations.push({
      name: relationMatch[1].trim(),
      location: relationMatch[2],
      status: relationMatch[3].trim(),
    });
  }

  const provinces: KingdomProvince[] = [];

  // Try new format first, then old
  let m: RegExpExecArray | null;
  while ((m = PROVINCE_RE.exec(text)) !== null) {
    const name = m[2].trim().replace(/ +/g, " ");
    if (/[/<>"]/.test(name)) continue; // invalid
    provinces.push({
      slot: parseNum(m[1]),
      name,
      race: m[4],
      land: parseNum(m[5]),
      networth: parseNum(m[6]),
      honorTitle: m[7],
    });
  }

  if (provinces.length === 0) {
    while ((m = OLD_PROVINCE_RE.exec(text)) !== null) {
      const name = m[2].trim().replace(/ +/g, " ");
      if (/[/<>"]/.test(name)) continue;
      provinces.push({
        slot: parseNum(m[1]),
        name,
        race: m[4],
        land: parseNum(m[5]),
        networth: parseNum(m[6]),
        honorTitle: m[7],
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

  return {
    name: kdName,
    location,
    kingdomTitle,
    warTarget,
    theirAttitudeToUs: attitudesMatch ? attitudesMatch[1].trim() : null,
    theirAttitudePoints: attitudesMatch ? parseFloat(attitudesMatch[2]) : null,
    ourAttitudeToThem: attitudesMatch ? attitudesMatch[3].trim() : null,
    ourAttitudePoints: attitudesMatch ? parseFloat(attitudesMatch[4]) : null,
    hostilityMeterVisibleUntil: hostilityVisibleMatch ? hostilityVisibleMatch[1].trim() : null,
    openRelations,
    provinces,
  };
}
