import type { AttackData, AttackType } from "./types";
import { KDLOC, parseNum } from "./util";

const ARRIVE_RE         = new RegExp(`Your forces arrive at ([^(]+?)\\s*${KDLOC}`);
const SUCCESS_TAKEN_RE  = /Your army has taken ([\d,]+) acres!/;
const RECAPTURED_RE     = /Your army has recaptured ([\d,]+) acres from our enemy!/;
const BUILDINGS_RE      = /([\d,]+) acres? of buildings survived/;
const CREDITS_RE        = /We also gained ([\d,]+) specialist training credits/;
const PEASANTS_RE       = /([\d,]+) peasants settled/;
const MASSACRED_RE      = /massacred (?:a total of )?([\d,]+)/i;
const ENEMY_KILL_RE     = /We killed about ([\d,]+) enemy troops/;
const IMPRISONED_RE     = /We also imprisoned ([\d,]+) additional troops/;
const RETURN_RE         = /Our forces will be available again in ([\d.]+) days/;
const SELECTED_ATTACK_RE = /Select Attack Type[\t ]+([^\r\n\t]+)/;

function attackTypeFromLabel(label: string): AttackType {
  const normalized = label.trim().toLowerCase();
  if (normalized === "traditional march") return "traditional_march";
  if (normalized === "conquest") return "conquest";
  if (normalized === "ambush") return "ambush";
  if (normalized === "plunder") return "plunder";
  if (normalized === "learn attack") return "learn";
  if (normalized === "massacre") return "massacre";
  if (normalized === "raze") return "raze";
  return "unknown";
}

function detectAttackType(text: string, isSuccess: boolean): AttackType {
  if (!isSuccess) return "unknown";
  if (/massacred/i.test(text))       return "massacre";
  if (/razed/i.test(text))           return "raze";
  if (/ambush|from the shadows/i.test(text)) return "ambush";
  if (RECAPTURED_RE.test(text))      return "ambush";

  const selectedMatch = SELECTED_ATTACK_RE.exec(text);
  if (selectedMatch) {
    const selectedType = attackTypeFromLabel(selectedMatch[1]);
    if (selectedType !== "unknown") return selectedType;
  }

  if (SUCCESS_TAKEN_RE.test(text))   return "traditional_march";
  return "unknown";
}

export function parseAttack(text: string, selfProv: string | undefined): AttackData | null {
  if (!selfProv) return null;

  const arriveMatch = ARRIVE_RE.exec(text);
  if (!arriveMatch) return null;

  const isSuccess = /managed a victory|emerged victorious/i.test(text);
  const isFailure = /suffered defeat|failed to breach|our attack has failed/i.test(text);
  if (!isSuccess && !isFailure) return null;

  const acresMatch      = SUCCESS_TAKEN_RE.exec(text) ?? RECAPTURED_RE.exec(text);
  const buildingsMatch  = BUILDINGS_RE.exec(text);
  const creditsMatch    = CREDITS_RE.exec(text);
  const peasantsMatch   = PEASANTS_RE.exec(text);
  const massacredMatch  = MASSACRED_RE.exec(text);
  const killMatch       = ENEMY_KILL_RE.exec(text);
  const imprisonedMatch = IMPRISONED_RE.exec(text);
  const returnMatch     = RETURN_RE.exec(text);

  return {
    name: selfProv,
    kingdom: "",
    attackType: detectAttackType(text, isSuccess),
    outcome: isSuccess ? "success" : "failure",
    targetName: arriveMatch[1].trim(),
    targetKingdom: arriveMatch[2],
    acresTaken:        acresMatch      ? parseNum(acresMatch[1])        : null,
    buildingsSurvived: buildingsMatch  ? parseNum(buildingsMatch[1])   : null,
    specialistCredits: creditsMatch    ? parseNum(creditsMatch[1])     : null,
    peasantsSettled:   peasantsMatch   ? parseNum(peasantsMatch[1])    : null,
    massacred:         massacredMatch  ? parseNum(massacredMatch[1])   : null,
    enemyKilled:       killMatch       ? parseNum(killMatch[1])        : null,
    enemyImprisoned:   imprisonedMatch ? parseNum(imprisonedMatch[1])  : null,
    returnDays:        returnMatch     ? parseFloat(returnMatch[1])    : null,
  };
}
