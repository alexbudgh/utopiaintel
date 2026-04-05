import { RACE_GROUP, HONOR_TITLE_GROUP, OFF_SPEC_GROUP, DEF_SPEC_GROUP, ELITE_GROUP } from "../game";
import type { SoTData } from "./types";
import { INT, SIGNED_INT, KDLOC, parseNum, parseAccuracy } from "./util";

const PROVINCE_RE = new RegExp(`The Province of ([^(]+)${KDLOC}`);
const RACE_SOLD_RE = new RegExp(`Race\\s*(${RACE_GROUP})\\s*Soldiers\\s*(${INT})`, "i");
const RULER_OFF_RE = new RegExp(`Ruler\\s*(.*?)\\s*(?:${OFF_SPEC_GROUP})\\s*(${INT})`, "i");
const LAND_DEF_RE = new RegExp(`Land\\s*(${INT})\\s*(?:${DEF_SPEC_GROUP})\\s*(${INT})`, "i");
const PEASANTS_ELITES_RE = new RegExp(`Peasants\\s*(${INT})(?:\\s*\\(\\d+\\.\\d+ ppa\\))?\\s*(?:${ELITE_GROUP})\\s*(${INT})`, "i");
const BE_THIEVES_RE = new RegExp(`Building Eff\\.\\s*(${INT})%\\s*Thieves\\s*(?:(${INT}) \\((\\d+)%\\)|Unknown)`, "i");
const MONEY_WIZ_RE = new RegExp(`Money\\s*(${INT})\\s*Wizards\\s*(?:(${INT}) \\((\\d+)%\\)|Unknown)`, "i");
const FOOD_HORSES_RE = new RegExp(`Food\\s*(${INT})\\s*War Horses\\s*(${INT})`, "i");
const RUNES_PRISONERS_RE = new RegExp(`Runes\\s*(${INT})\\s*Prisoners\\s*(${INT})`, "i");
const TB_OFF_RE = new RegExp(`Trade Balance\\s*(${SIGNED_INT})\\s*Off\\. Points\\s*(${INT})`, "i");
const NW_DEF_RE = new RegExp(`Networth\\s*(${INT}) gold coins\\s*(?:\\(\\d+\\.\\d+ nwpa\\))?\\s*Def\\. Points\\s*(${INT})`, "i");
const HONOR_PREFIX_RE = new RegExp(`^(${HONOR_TITLE_GROUP})\\b`, "i");
const PREFIX_PERSONALITY_MAP: Record<string, string> = {
  Conniving: "Tactician",
  Brave: "Warrior",
};
const SUFFIX_PERSONALITY_MAP: Record<string, string> = {
  Hero: "War Hero",
  Rogue: "Rogue",
  Sorcerer: "Mystic",
  Sorceress: "Mystic",
  Craftsman: "Artisan",
  Craftswoman: "Artisan",
  Skeptic: "Heretic",
  Chivalrous: "Paladin",
  Reanimator: "Necromancer",
};
const PREFIX_PERSONALITY_GROUP = Object.keys(PREFIX_PERSONALITY_MAP).join("|");
const SUFFIX_PERSONALITY_GROUP = Object.keys(SUFFIX_PERSONALITY_MAP).join("|");
const PREFIX_PERS_TITLE_RE = new RegExp(`^[tT]he (${PREFIX_PERSONALITY_GROUP})\\s+(${HONOR_TITLE_GROUP})\\b`, "i");
const SUFFIX_PERS_TITLE_RE = new RegExp(`\\bthe (${SUFFIX_PERSONALITY_GROUP})\\b`, "i");

const PLAGUE_RE = /The Plague has spread throughout our people/;
const OVERPOP_RE = /Riots due to housing shortages/;
const HIT_RE = /province has been attacked (pretty heavily|moderately|a little|extremely badly)/;
const WAR_RE = /Our Kingdom is at WAR!/;

export function parseSoT(text: string): SoTData | null {
  const provMatch = PROVINCE_RE.exec(text);
  if (!provMatch) return null;

  const name = provMatch[1].trim();
  const kingdom = provMatch[2];
  const accuracy = parseAccuracy(text);

  const raceSold = RACE_SOLD_RE.exec(text);
  if (!raceSold) return null;
  const race = raceSold[1];
  const soldiers = parseNum(raceSold[2]);

  const rulerOff = RULER_OFF_RE.exec(text);
  if (!rulerOff) return null;
  const ruler = rulerOff[1].trim();
  const offSpecs = parseNum(rulerOff[2]);

  // Parse personality and honor title from ruler string
  let personality: string | undefined;
  let honorTitle: string | undefined;
  const prefixMatch = PREFIX_PERS_TITLE_RE.exec(ruler);
  if (prefixMatch) {
    personality = PREFIX_PERSONALITY_MAP[prefixMatch[1]];
    honorTitle = prefixMatch[2]?.trim();
  } else {
    const suffixMatch = SUFFIX_PERS_TITLE_RE.exec(ruler);
    if (suffixMatch) {
      personality = SUFFIX_PERSONALITY_MAP[suffixMatch[1]];
      const honorMatch = HONOR_PREFIX_RE.exec(ruler);
      honorTitle = honorMatch?.[1]?.trim();
    }
  }

  const landDef = LAND_DEF_RE.exec(text);
  if (!landDef) return null;
  const land = parseNum(landDef[1]);
  const defSpecs = parseNum(landDef[2]);

  const pe = PEASANTS_ELITES_RE.exec(text);
  if (!pe) return null;

  const bt = BE_THIEVES_RE.exec(text);
  if (!bt) return null;

  const mw = MONEY_WIZ_RE.exec(text);
  if (!mw) return null;

  const fh = FOOD_HORSES_RE.exec(text);
  if (!fh) return null;

  const rp = RUNES_PRISONERS_RE.exec(text);
  if (!rp) return null;

  const to = TB_OFF_RE.exec(text);
  if (!to) return null;

  const nd = NW_DEF_RE.exec(text);
  if (!nd) return null;

  const hitMatch = HIT_RE.exec(text);

  return {
    name,
    kingdom,
    race,
    personality,
    honorTitle,
    ruler,
    land,
    networth: parseNum(nd[1]),
    soldiers,
    offSpecs,
    defSpecs,
    peasants: parseNum(pe[1]),
    elites: parseNum(pe[2]),
    buildingEfficiency: parseNum(bt[1]),
    thieves: bt[2] ? parseNum(bt[2]) : null,
    stealth: bt[3] ? parseInt(bt[3], 10) : null,
    money: parseNum(mw[1]),
    wizards: mw[2] ? parseNum(mw[2]) : null,
    mana: mw[3] ? parseInt(mw[3], 10) : null,
    food: parseNum(fh[1]),
    warHorses: parseNum(fh[2]),
    runes: parseNum(rp[1]),
    prisoners: parseNum(rp[2]),
    tradeBalance: parseNum(to[1]),
    offPoints: parseNum(to[2]),
    defPoints: parseNum(nd[2]),
    plagued: PLAGUE_RE.test(text),
    overpopulated: OVERPOP_RE.test(text),
    hitStatus: hitMatch ? hitMatch[1] : "",
    war: WAR_RE.test(text),
    accuracy,
  };
}
