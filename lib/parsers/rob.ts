import type { RobData, RobOp } from "./types";
import { INT, KDLOC, parseNum } from "./util";

const THIEVES_RE = new RegExp(`Number of thieves\\s+([\\d,]+)`);
const STEALTH_RE = /Stealth\s+(\d+)%/;
const SUCCESS_TOWERS_RE = new RegExp(`steal (${INT}) runes`);
const SUCCESS_VAULTS_RE = new RegExp(`returned with (${INT}) gold coins`);
const SUCCESS_GRANARIES_RE = new RegExp(`returned with (${INT}) bushels`);
const THIEVES_LOST_SUCCESS_RE = new RegExp(
  `We lost (${INT}) thie(?:f|ves) in the operation`,
);
const THIEVES_LOST_FAILURE_RE = new RegExp(
  `mission was foiled\\. We lost (${INT}) thie`,
);
const TARGET_KD_RE = new RegExp(`Target kingdom is [^(]+${KDLOC}`);
const TARGET_PROV_RE = /Select province:\t(\d+) (.+?) ---/;
const ASSASSINATED_RE = new RegExp(`assassinated (${INT}) enemy troops`);
const WIZARDS_ASSASSINATED_RE = new RegExp(`assassinated (${INT}) wizards`);
const KIDNAPPED_RE = new RegExp(`return with (${INT}) of them`);
const PRISONERS_FREED_RE = new RegExp(
  `freed (${INT}) prisoners from enemy dungeons`,
);
const PRISONERS_CAPTURED_RE = new RegExp(
  `freedom was brief for (${INT}) prisoners as we forced them into our own dungeons`,
);
const EFFECT_DAYS_RE = /expected to last (\d+) days?/;
const ACRES_BURNED_RE = new RegExp(`burned down (${INT}) acres? of buildings`);
const BUILDINGS_BURNED_RE = new RegExp(`burned down (${INT}) [\\w ]+\\.`);
const PROPAGANDA_RE = new RegExp(
  `We have converted (${INT}) (?:of the enemy's )?(\\w+) (?:troops to our army|from the enemy)`,
);
const PROPAGANDA_ZERO_RE = /but no enemy (\w+) were converted/;

function normUnit(raw: string): string {
  const lower = raw.toLowerCase();
  if (lower === "thieves" || lower === "thieve") return "Thief";
  const singular = raw.length > 2 && raw.endsWith("s") ? raw.slice(0, -1) : raw;
  return singular.charAt(0).toUpperCase() + singular.slice(1);
}

export function getRobOp(url: string): RobOp | null {
  try {
    const o = new URL(url).searchParams.get("o")?.toUpperCase();
    if (o === "ROB_THE_TOWERS") return "towers";
    if (o === "ROB_THE_VAULTS") return "vaults";
    if (o === "ROB_THE_GRANARIES") return "granaries";
    if (o === "NIGHT_STRIKE") return "night_strike";
    if (o === "KIDNAP") return "kidnap";
    if (o === "BRIBE_GENERALS") return "bribe_generals";
    if (o === "INCITE_RIOTS") return "incite_riots";
    if (o === "SABOTAGE_WIZARDS") return "sabotage_wizards";
    if (o === "ARSON") return "arson";
    if (o === "GREATER_ARSON") return "greater_arson";
    if (o === "DESTABILIZE_GUILDS") return "destabilize_guilds";
    if (o === "BRIBE_THIEVES") return "bribe_thieves";
    if (o === "PROPAGANDA") return "propaganda";
    if (o === "ASSASSINATE_WIZARDS") return "assassinate_wizards";
    if (o === "FREE_PRISONERS") return "free_prisoners";
    return null;
  } catch {
    return null;
  }
}

export function parseRob(
  text: string,
  url: string,
  selfProv: string,
): RobData | null {
  const op = getRobOp(url);
  if (!op) return null;

  let params: URLSearchParams;
  try {
    params = new URL(url).searchParams;
  } catch {
    params = new URLSearchParams();
  }
  const targetGameId = params.has("p") ? parseInt(params.get("p")!, 10) : null;
  const thievesSent = params.has("q") ? parseInt(params.get("q")!, 10) : null;
  const arsonBuilding =
    op === "greater_arson" ? (params.get("b") ?? null) : null;

  // Must have a result line — skip form-only page loads
  const isSuccess =
    /Early indications show that our operation was a success/.test(text);
  const isFailure = /mission was foiled/.test(text);
  if (!isSuccess && !isFailure) return null;

  const targetProvMatch = TARGET_PROV_RE.exec(text);
  const targetKdMatch = TARGET_KD_RE.exec(text);
  const thievesMatch = THIEVES_RE.exec(text);
  const stealthMatch = STEALTH_RE.exec(text);

  let amountStolen: number | null = null;
  let thievesLost = 0;
  let troopsAssassinated: number | null = null;
  let kidnapped: number | null = null;
  let acresBurned: number | null = null;
  let effectDuration: number | null = null;
  let deserters: number | null = null;
  let deserterType: string | null = null;
  let wizardsAssassinated: number | null = null;
  let prisonersFreed: number | null = null;
  let prisonersCaptured: number | null = null;

  if (isSuccess) {
    if (op === "towers" || op === "vaults" || op === "granaries") {
      const re =
        op === "towers"
          ? SUCCESS_TOWERS_RE
          : op === "vaults"
            ? SUCCESS_VAULTS_RE
            : SUCCESS_GRANARIES_RE;
      const m = re.exec(text);
      if (m) amountStolen = parseNum(m[1]);
    } else if (op === "night_strike") {
      const m = ASSASSINATED_RE.exec(text);
      if (m) troopsAssassinated = parseNum(m[1]);
    } else if (op === "kidnap") {
      const m = KIDNAPPED_RE.exec(text);
      if (m) kidnapped = parseNum(m[1]);
    } else if (op === "arson" || op === "greater_arson") {
      if (/too few in number to find any buildings to burn/.test(text)) {
        acresBurned = 0;
      } else if (op === "greater_arson") {
        const m = BUILDINGS_BURNED_RE.exec(text);
        if (m) acresBurned = parseNum(m[1]);
      } else {
        const m = ACRES_BURNED_RE.exec(text);
        if (m) acresBurned = parseNum(m[1]);
      }
    } else if (op === "incite_riots" || op === "destabilize_guilds") {
      const m = EFFECT_DAYS_RE.exec(text);
      if (m) effectDuration = parseInt(m[1], 10);
    } else if (op === "sabotage_wizards") {
      if (/no lasting effect/.test(text)) {
        effectDuration = 0;
      } else {
        const m = EFFECT_DAYS_RE.exec(text);
        if (m) effectDuration = parseInt(m[1], 10);
      }
    } else if (op === "propaganda") {
      const m = PROPAGANDA_RE.exec(text);
      if (m) {
        deserters = parseNum(m[1]);
        deserterType = normUnit(m[2]);
      } else {
        const z = PROPAGANDA_ZERO_RE.exec(text);
        if (z) {
          deserters = 0;
          deserterType = normUnit(z[1]);
        }
      }
    } else if (op === "assassinate_wizards") {
      const m = WIZARDS_ASSASSINATED_RE.exec(text);
      if (m) wizardsAssassinated = parseNum(m[1]);
    } else if (op === "free_prisoners") {
      const freed = PRISONERS_FREED_RE.exec(text);
      const captured = PRISONERS_CAPTURED_RE.exec(text);
      if (freed) prisonersFreed = parseNum(freed[1]);
      if (captured) prisonersCaptured = parseNum(captured[1]);
    }
    const lostMatch = THIEVES_LOST_SUCCESS_RE.exec(text);
    if (lostMatch) thievesLost = parseNum(lostMatch[1]);
  } else {
    const lostMatch = THIEVES_LOST_FAILURE_RE.exec(text);
    if (lostMatch) thievesLost = parseNum(lostMatch[1]);
  }

  return {
    name: selfProv,
    kingdom: "", // attacker — kingdom resolved via key binding at store time
    op,
    targetName: targetProvMatch ? targetProvMatch[2].trim() : null,
    targetSlot: targetProvMatch ? parseInt(targetProvMatch[1], 10) : null,
    targetKingdom: targetKdMatch ? targetKdMatch[1] : null,
    targetGameId,
    outcome: isSuccess ? "success" : "failure",
    amountStolen,
    thievesLost,
    thieves: thievesMatch ? parseNum(thievesMatch[1]) : null,
    stealth: stealthMatch ? parseInt(stealthMatch[1], 10) : null,
    troopsAssassinated,
    kidnapped,
    acresBurned,
    arsonBuilding,
    effectDuration,
    deserters,
    deserterType,
    wizardsAssassinated,
    prisonersFreed,
    prisonersCaptured,
    thievesSent,
  };
}
