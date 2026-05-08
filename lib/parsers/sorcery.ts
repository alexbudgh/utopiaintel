import type { SorceryData } from "./types";
import { INT, KDLOC, parseNum } from "./util";

const WIZARDS_RE    = new RegExp(`Wizards\\s+([\\d,]+)`);
const RUNES_SELF_RE = new RegExp(`Wizards[^\\n]+\\n?[^\\n]*Runes\\s+([\\d,]+)`);
const MANA_RE       = /Mana\s+(\d+)%/;
const GATHER_RE     = new RegExp(`gather (${INT}) runes and begin casting`);
const WIZARD_LOSS_RE = new RegExp(`(${INT}) wizards? (?:was|were) killed in an explosion`);
const DURATION_RE   = /for (\d+) days/;
const TARGET_KD_RE  = new RegExp(`Target kingdom is [^(]+${KDLOC}`);
const TARGET_PROV_RE = /Select target province:\t(\d+)\s+(?:-\s*)?(.+?) ---/;
// Fallback: some spells embed target as "of ProvName (KD)" in the result sentence
const TARGET_INLINE_RE = new RegExp(
  `(?:skies of|lands of|womenfolk of|province of) ([^(\\n]+?)\\s*${KDLOC}`,
  "i",
);

function splitSlotPrefixedName(rawName: string): { name: string; slot: number | null } {
  const name = rawName.trim();
  const match = /^(\d+)\s*-\s*(.+)$/.exec(name);
  if (!match) return { name, slot: null };

  return { name: match[2].trim(), slot: parseInt(match[1], 10) };
}

export function getSpell(url: string): string | null {
  try {
    return new URL(url).searchParams.get("s")?.toUpperCase() ?? null;
  } catch {
    return null;
  }
}

export function parseSorcery(text: string, url: string, selfProv: string): SorceryData | null {
  const spell = getSpell(url);
  if (!spell) return null;

  const isSuccess = /and the spell succeeds/.test(text);
  const isFailure = /but the spell fails/.test(text);
  if (!isSuccess && !isFailure) return null;

  const gatherMatch = GATHER_RE.exec(text);
  if (!gatherMatch) return null;

  const wizardsMatch = WIZARDS_RE.exec(text);
  const runesSelfMatch = RUNES_SELF_RE.exec(text);
  const manaMatch = MANA_RE.exec(text);
  const wizardLossMatch = WIZARD_LOSS_RE.exec(text);
  const durationMatch = DURATION_RE.exec(text);
  const targetKdMatch = TARGET_KD_RE.exec(text);
  const targetProvMatch = TARGET_PROV_RE.exec(text);
  const targetInlineMatch = !targetProvMatch ? TARGET_INLINE_RE.exec(text) : null;
  const targetInline = targetInlineMatch ? splitSlotPrefixedName(targetInlineMatch[1]) : null;

  return {
    name: selfProv,
    kingdom: "",
    spell,
    outcome: isSuccess ? "success" : "failure",
    runesSpent: parseNum(gatherMatch[1]),
    wizardsLost: wizardLossMatch ? parseNum(wizardLossMatch[1]) : 0,
    durationDays: durationMatch ? parseInt(durationMatch[1], 10) : null,
    targetName: targetProvMatch
      ? targetProvMatch[2].trim()
      : targetInline
        ? targetInline.name
        : null,
    targetSlot: targetProvMatch ? parseInt(targetProvMatch[1], 10) : targetInline?.slot ?? null,
    targetKingdom: targetKdMatch ? targetKdMatch[1] : targetInlineMatch?.[2] ?? null,
    wizards: wizardsMatch ? parseNum(wizardsMatch[1]) : null,
    runes: runesSelfMatch ? parseNum(runesSelfMatch[1]) : null,
    mana: manaMatch ? parseInt(manaMatch[1], 10) : null,
  };
}
