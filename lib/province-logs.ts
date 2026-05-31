import { buildIntelOpAttempt } from "./intel-ops";
import { utopiaDateOrdToUtcTimestamp } from "./utopia-age";
import type { AsyncDbApi, GameDateStamp } from "./db-api";
import { parseAttack } from "./parsers/attack";
import { parseInfiltrate } from "./parsers/infiltrate";
import { parseRob, getRobOp } from "./parsers/rob";
import { parseSoD } from "./parsers/sod";
import { parseSoM } from "./parsers/som";
import { parseSorcery } from "./parsers/sorcery";
import type {
  AttackData,
  InfiltrateData,
  RobData,
  SoDData,
  SoMData,
  SorceryData,
} from "./parsers/types";
import { parseUtopiaDate } from "./ui";
import { parseFloat_, parseNum } from "./parsers/util";

export type ProvinceLogResult =
  | {
      type: "attack";
      data: AttackData;
      receivedAt: string;
      gameDate: GameDateStamp;
    }
  | { type: "rob"; data: RobData; receivedAt: string; gameDate: GameDateStamp }
  | {
      type: "sorcery";
      data: SorceryData;
      receivedAt: string;
      gameDate: GameDateStamp;
    }
  | { type: "som"; data: SoMData; receivedAt: string; gameDate: GameDateStamp }
  | { type: "sod"; data: SoDData; receivedAt: string; gameDate: GameDateStamp }
  | {
      type: "infiltrate";
      data: InfiltrateData;
      receivedAt: string;
      gameDate: GameDateStamp;
    };

type ProvinceLogIntelData = SoMData | SoDData | InfiltrateData;

interface ProvinceLogLine {
  gameDate: string;
  text: string;
  index: number;
}

const LOG_LINE_RE = /^([A-Za-z]+ \d+ of YR\d+)\t([\s\S]*)$/;
const TARGET_SUFFIX_RE =
  /\s+\(([^()\n]+)\s+\((\d{1,2}:\d{1,2})\), sent [\d,]+\)\s*$/;

function stripTargetSuffix(text: string): string {
  return text.replace(TARGET_SUFFIX_RE, "").trim();
}

function getTargetSuffix(text: string): {
  targetName: string;
  targetKingdom: string;
} | null {
  const match = TARGET_SUFFIX_RE.exec(text);
  if (!match) return null;
  return { targetName: match[1].trim(), targetKingdom: match[2] };
}

function splitProvinceLogLines(text: string): ProvinceLogLine[] {
  const results: ProvinceLogLine[] = [];
  let current: ProvinceLogLine | null = null;

  for (const line of text.split(/\r?\n/)) {
    const match = LOG_LINE_RE.exec(line);
    if (match) {
      if (current) results.push(current);
      current = {
        gameDate: match[1],
        text: match[2],
        index: results.length,
      };
      continue;
    }

    if (current) current.text += `\n${line}`;
  }

  if (current) results.push(current);
  return results;
}

function timestampForLogLine(
  gameDate: string,
  index: number,
): {
  receivedAt: string;
  gameDate: GameDateStamp;
} | null {
  const ord = parseUtopiaDate(gameDate);
  if (ord < 0) return null;
  // Map game tick to the start of the corresponding real-world hour, then use
  // index as seconds to keep multiple ops in the same tick distinct.
  const base = utopiaDateOrdToUtcTimestamp(ord);
  const receivedAt = base.slice(0, 17) + String(index).padStart(2, "0");
  return {
    receivedAt,
    gameDate: { gameDate, gameDateOrd: ord },
  };
}

function fakeRobUrl(op: string): string {
  return `https://utopia-game.com/wol/game/thievery?o=${op}`;
}

function inferRobOp(text: string): string | null {
  if (/returned with [\d,]+ gold coins/.test(text)) return "ROB_THE_VAULTS";
  if (/steal [\d,]+ runes/.test(text)) return "ROB_THE_TOWERS";
  if (/returned with [\d,]+ bushels/.test(text)) return "ROB_THE_GRANARIES";
  if (/assassinated [\d,]+ enemy troops/.test(text)) return "NIGHT_STRIKE";
  if (/assassinated [\d,]+ wizards/.test(text)) return "ASSASSINATE_WIZARDS";
  if (/return with [\d,]+ of them/.test(text)) return "KIDNAP";
  if (/freed [\d,]+ prisoners from enemy dungeons/.test(text))
    return "FREE_PRISONERS";
  if (/building efficiency will be reduced for \d+ ticks?/.test(text))
    return "DESTABILIZE_GUILDS";
  if (/expected to last \d+ days?/.test(text)) return "INCITE_RIOTS";
  if (/sabotage wizards|no lasting effect/.test(text))
    return "SABOTAGE_WIZARDS";
  if (/burned down [\d,]+ acres? of buildings/.test(text)) return "ARSON";
  if (/We have converted|but no enemy \w+ were converted/.test(text))
    return "PROPAGANDA";
  return null;
}

function parseRobFromLog(text: string, selfProv: string): RobData | null {
  const op = inferRobOp(text);
  if (!op || !getRobOp(fakeRobUrl(op))) return null;
  const target = getTargetSuffix(text);
  const normalized = stripTargetSuffix(text).replace(
    /building efficiency will be reduced for (\d+) ticks?/,
    "building efficiency is expected to last $1 days",
  );
  const parsed = parseRob(normalized, fakeRobUrl(op), selfProv);
  if (!parsed) return null;
  return {
    ...parsed,
    targetName: parsed.targetName ?? target?.targetName ?? null,
    targetKingdom: parsed.targetKingdom ?? target?.targetKingdom ?? null,
  };
}

function inferSpell(text: string): string {
  if (/protected from drought and storms/.test(text)) return "NATURES_BLESSING";
  if (/builders have been blessed with unnatural speed/.test(text))
    return "BUILDERS_BOON";
  if (/maintenance costs to be reduced/.test(text)) return "INSPIRATION";
  if (/increased science book generation/.test(text))
    return "SCIENTIFIC_INSIGHTS";
  if (/increasingly drawn to the sciences/.test(text))
    return "FOUNTAIN_OF_KNOWLEDGE";
  if (/protect us from the black magic/.test(text)) return "MYSTIC_AURA";
  if (/sphere of protection/.test(text)) return "MINOR_PROTECTION";
  if (/partially invisible/.test(text)) return "INVISIBILITY";
  if (/birth rates to be higher/.test(text)) return "FERTILE_LANDS";
  if (/closer to completing our ritual project/.test(text)) return "RITUAL";
  return "UNKNOWN";
}

function parseSorceryFromLog(
  text: string,
  selfProv: string,
): SorceryData | null {
  if (!/Your wizards gather [\d,]+ runes and begin casting/.test(text))
    return null;
  return parseSorcery(
    stripTargetSuffix(text),
    `https://utopia-game.com/wol/game/sorcery?s=${inferSpell(text)}`,
    selfProv,
  );
}

export function isProvinceLogsUrl(url: string): boolean {
  try {
    const pathname = new URL(url).pathname.toLowerCase();
    return (
      pathname === "/wol/game/province_logs" ||
      pathname.startsWith("/wol/game/province_logs/") ||
      pathname === "/wol/sit/game/province_logs" ||
      pathname.startsWith("/wol/sit/game/province_logs/")
    );
  } catch {
    return false;
  }
}

function parseIntelFromLog(text: string): ProvinceLogIntelData | null {
  return (
    parseSoM(text) ??
    parseSoMFromLog(text) ??
    parseSoD(text) ??
    parseInfiltrate(text)
  );
}

const LOG_SOM_NAME_RE =
  /report from the Military Elders of ([^,]+), we have ([\d,]+) generals? available/;
const LOG_SOM_OME_RE =
  /Offensive Military Effectiveness is ([\d,.]+)% with ([\d,]+) Net Offensive Points at Home/;
const LOG_SOM_DME_RE =
  /Defensive Military Effectiveness is ([\d,.]+)% with ([\d,]+) Net Defensive Points at Home/;
const LOG_SOM_TROOPS_RE =
  /We have currently ([\d,]+) soldiers, ([\d,]+) offensive specialists, ([\d,]+) defensive specialists, ([\d,]+) elites and ([\d,]+) war horses at home/;

function parseSoMFromLog(text: string): SoMData | null {
  const target = getTargetSuffix(text);
  const nameMatch = LOG_SOM_NAME_RE.exec(text);
  const omeMatch = LOG_SOM_OME_RE.exec(text);
  const dmeMatch = LOG_SOM_DME_RE.exec(text);
  const troopsMatch = LOG_SOM_TROOPS_RE.exec(text);
  if (!target || !nameMatch || !omeMatch || !dmeMatch || !troopsMatch)
    return null;

  return {
    name: target.targetName,
    kingdom: target.targetKingdom,
    netOffense: parseNum(omeMatch[2]),
    netDefense: parseNum(dmeMatch[2]),
    ome: parseFloat_(omeMatch[1]),
    dme: parseFloat_(dmeMatch[1]),
    accuracy: 100,
    armies: [
      {
        armyType: "home",
        generals: parseNum(nameMatch[2]),
        soldiers: parseNum(troopsMatch[1]),
        offSpecs: parseNum(troopsMatch[2]),
        defSpecs: parseNum(troopsMatch[3]),
        elites: parseNum(troopsMatch[4]),
        warHorses: parseNum(troopsMatch[5]),
        thieves: 0,
        landGained: 0,
        returnDays: null,
      },
      {
        armyType: "training",
        generals: 0,
        soldiers: 0,
        offSpecs: 0,
        defSpecs: 0,
        elites: 0,
        warHorses: 0,
        thieves: 0,
        landGained: 0,
        returnDays: null,
      },
    ],
  };
}

export function parseProvinceLogs(
  text: string,
  selfProv: string,
): ProvinceLogResult[] {
  const results: ProvinceLogResult[] = [];

  for (const line of splitProvinceLogLines(text)) {
    const dates = timestampForLogLine(line.gameDate, line.index);
    if (!dates) continue;
    const { receivedAt, gameDate } = dates;

    const textWithoutSuffix = stripTargetSuffix(line.text);
    const attack = parseAttack(textWithoutSuffix, selfProv);
    if (attack) {
      results.push({ type: "attack", data: attack, receivedAt, gameDate });
      continue;
    }

    const rob = parseRobFromLog(line.text, selfProv);
    if (rob) {
      results.push({ type: "rob", data: rob, receivedAt, gameDate });
      continue;
    }

    const sorcery = parseSorceryFromLog(line.text, selfProv);
    if (sorcery) {
      results.push({ type: "sorcery", data: sorcery, receivedAt, gameDate });
      continue;
    }

    const intel = parseIntelFromLog(line.text);
    if (!intel) continue;
    if ("armies" in intel) {
      results.push({ type: "som", data: intel, receivedAt, gameDate });
    } else if ("defPoints" in intel) {
      results.push({ type: "sod", data: intel, receivedAt, gameDate });
    } else if ("thieves" in intel) {
      results.push({ type: "infiltrate", data: intel, receivedAt, gameDate });
    }
  }

  return results;
}

export function buildProvinceLogIntelOp(
  result: ProvinceLogResult,
): ReturnType<typeof buildIntelOpAttempt> {
  if (result.type === "sod") {
    return buildIntelOpAttempt(fakeRobUrl("SPY_ON_DEFENSE"), "", {
      type: "sod",
      data: result.data,
    });
  }
  if (result.type === "som") {
    return buildIntelOpAttempt(fakeRobUrl("SPY_ON_MILITARY"), "", {
      type: "som",
      data: result.data,
    });
  }
  if (result.type === "infiltrate") {
    return buildIntelOpAttempt(fakeRobUrl("INFILTRATE"), "", {
      type: "infiltrate",
      data: result.data,
    });
  }
  return null;
}

export async function storeProvinceLogResult(
  db: AsyncDbApi,
  result: ProvinceLogResult,
  savedBy: string,
  keyHash: string,
) {
  const intelOpAttempt = buildProvinceLogIntelOp(result);
  if (intelOpAttempt) {
    await db.storeIntelOp(
      intelOpAttempt,
      savedBy,
      keyHash,
      result.receivedAt,
      result.gameDate,
    );
  }

  if (result.type === "attack") {
    await db.storeAttack(
      result.data,
      savedBy,
      keyHash,
      result.receivedAt,
      result.gameDate,
      "province_logs",
    );
  } else if (result.type === "rob") {
    await db.storeRob(
      result.data,
      savedBy,
      keyHash,
      result.receivedAt,
      result.gameDate,
      "province_logs",
    );
  } else if (result.type === "sorcery") {
    await db.storeSorcery(
      result.data,
      savedBy,
      keyHash,
      result.receivedAt,
      result.gameDate,
      "province_logs",
    );
  } else if (result.type === "som") {
    await db.storeSoM(result.data, savedBy, keyHash, false, result.receivedAt);
  } else if (result.type === "sod") {
    await db.storeSoD(result.data, savedBy, keyHash, result.receivedAt);
  } else if (result.type === "infiltrate") {
    await db.storeInfiltrate(result.data, savedBy, keyHash, result.receivedAt);
  }
}
