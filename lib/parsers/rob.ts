import type { RobData, RobOp } from "./types";
import { INT, KDLOC, parseNum } from "./util";

const THIEVES_RE = new RegExp(`Number of thieves\\s+([\\d,]+)`);
const STEALTH_RE = /Stealth\s+(\d+)%/;
const SUCCESS_TOWERS_RE = new RegExp(`steal (${INT}) runes`);
const SUCCESS_VAULTS_RE = new RegExp(`returned with (${INT}) gold coins`);
const SUCCESS_GRANARIES_RE = new RegExp(`returned with (${INT}) bushels`);
const THIEVES_LOST_SUCCESS_RE = new RegExp(`We lost (${INT}) thie(?:f|ves) in the operation`);
const THIEVES_LOST_FAILURE_RE = new RegExp(`mission was foiled\\. We lost (${INT}) thie`);
const TARGET_KD_RE = new RegExp(`Target kingdom is [^(]+${KDLOC}`);
const TARGET_PROV_RE = /Select province:\t(\d+) (.+?) ---/;

export function getRobOp(url: string): RobOp | null {
  try {
    const o = new URL(url).searchParams.get("o")?.toUpperCase();
    if (o === "ROB_THE_TOWERS") return "towers";
    if (o === "ROB_THE_VAULTS") return "vaults";
    if (o === "ROB_THE_GRANARIES") return "granaries";
    return null;
  } catch {
    return null;
  }
}

export function parseRob(text: string, url: string, selfProv: string): RobData | null {
  const op = getRobOp(url);
  if (!op) return null;

  // Must have a result line — skip form-only page loads
  const isSuccess = /Early indications show that our operation was a success/.test(text);
  const isFailure = /mission was foiled/.test(text);
  if (!isSuccess && !isFailure) return null;

  const targetProvMatch = TARGET_PROV_RE.exec(text);
  const targetKdMatch = TARGET_KD_RE.exec(text);
  const thievesMatch = THIEVES_RE.exec(text);
  const stealthMatch = STEALTH_RE.exec(text);

  let amountStolen: number | null = null;
  let thievesLost = 0;

  if (isSuccess) {
    const re = op === "towers" ? SUCCESS_TOWERS_RE
             : op === "vaults" ? SUCCESS_VAULTS_RE
             : SUCCESS_GRANARIES_RE;
    const m = re.exec(text);
    if (m) amountStolen = parseNum(m[1]);
    const lostMatch = THIEVES_LOST_SUCCESS_RE.exec(text);
    if (lostMatch) thievesLost = parseNum(lostMatch[1]);
  } else {
    const lostMatch = THIEVES_LOST_FAILURE_RE.exec(text);
    if (lostMatch) thievesLost = parseNum(lostMatch[1]);
  }

  return {
    name: selfProv,
    kingdom: "",  // attacker — kingdom resolved via key binding at store time
    op,
    targetName: targetProvMatch ? targetProvMatch[2].trim() : null,
    targetSlot: targetProvMatch ? parseInt(targetProvMatch[1], 10) : null,
    targetKingdom: targetKdMatch ? targetKdMatch[1] : null,
    outcome: isSuccess ? "success" : "failure",
    amountStolen,
    thievesLost,
    thieves: thievesMatch ? parseNum(thievesMatch[1]) : null,
    stealth: stealthMatch ? parseInt(stealthMatch[1], 10) : null,
  };
}
