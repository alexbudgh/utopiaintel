import type { ParseResult } from "./parsers";
import { extractProvinceOperationsInfo } from "./parsers/detect";

export type IntelOpType =
  | "sot"
  | "som"
  | "sos"
  | "sod"
  | "survey"
  | "infiltrate"
  | "kingdom_news";
export type IntelOpOutcome = "success" | "failure";

export interface IntelOpAttempt {
  op: string;
  intelType: IntelOpType;
  outcome: IntelOpOutcome;
  targetName: string | null;
  targetSlot: number | null;
  targetKingdom: string | null;
  accuracy: number | null;
  thievesLost: number;
}

const THIEVERY_INTEL_OPS: Record<string, IntelOpType> = {
  SPY_ON_THRONE: "sot",
  SPY_ON_MILITARY: "som",
  SPY_ON_SCIENCES: "sos",
  SPY_ON_DEFENSE: "sod",
  SURVEY: "survey",
  INFILTRATE: "infiltrate",
  SNATCH_NEWS: "kingdom_news",
};

function getQueryOp(
  url: string,
): { op: string; intelType: IntelOpType } | null {
  try {
    const params = new URL(url).searchParams;
    const thieveryOp = params.get("o")?.toUpperCase() ?? null;
    if (thieveryOp && THIEVERY_INTEL_OPS[thieveryOp]) {
      return { op: thieveryOp, intelType: THIEVERY_INTEL_OPS[thieveryOp] };
    }
  } catch {
    return null;
  }

  return null;
}

const TARGET_KD_RE = /Target kingdom is [^(]+\((\d{1,2}:\d{1,2})\)/;
const TARGET_PROV_RE = /Select province:\t(\d+)\s+(?:-\s*)?(.+?) ---/;
const THIEVES_LOST_RE = /We lost ([\d,]+) thie(?:f|ves)(?: in the operation)?/;

function getFormTarget(text: string): {
  targetName: string | null;
  targetSlot: number | null;
  targetKingdom: string | null;
} {
  const targetProv = TARGET_PROV_RE.exec(text);
  const targetKd = TARGET_KD_RE.exec(text);
  return {
    targetName: targetProv?.[2]?.trim() ?? null,
    targetSlot: targetProv ? parseInt(targetProv[1], 10) : null,
    targetKingdom: targetKd?.[1] ?? null,
  };
}

function accuracyFromData(data: object): number | null {
  return "accuracy" in data && typeof data.accuracy === "number"
    ? data.accuracy
    : null;
}

function parseThievesLost(text: string): number {
  const match = THIEVES_LOST_RE.exec(text);
  return match ? parseInt(match[1].replace(/,/g, ""), 10) : 0;
}

function attemptFromParsed(
  op: string,
  intelType: IntelOpType,
  url: string,
  text: string,
  parsed: ParseResult,
): IntelOpAttempt | null {
  const urlTarget = extractProvinceOperationsInfo(url);
  const formTarget = getFormTarget(text);
  const thievesLost = parseThievesLost(text);

  if (parsed.type !== intelType) return null;

  if (parsed.type === "kingdom_news") {
    return {
      op,
      intelType,
      outcome: "success",
      targetName: formTarget.targetName,
      targetSlot: formTarget.targetSlot ?? urlTarget?.slot ?? null,
      targetKingdom:
        parsed.data.targetKingdom ??
        formTarget.targetKingdom ??
        urlTarget?.kingdom ??
        null,
      accuracy: null,
      thievesLost,
    };
  }

  if ("name" in parsed.data && "kingdom" in parsed.data) {
    return {
      op,
      intelType,
      outcome: "success",
      targetName: parsed.data.name,
      targetSlot: urlTarget?.slot ?? formTarget.targetSlot ?? null,
      targetKingdom:
        parsed.data.kingdom ||
        formTarget.targetKingdom ||
        urlTarget?.kingdom ||
        null,
      accuracy: accuracyFromData(parsed.data),
      thievesLost,
    };
  }

  return null;
}

export function buildIntelOpAttempt(
  url: string,
  text: string,
  parsed: ParseResult | null,
): IntelOpAttempt | null {
  const known = getQueryOp(url);
  if (!known) return null;

  const parsedAttempt = parsed
    ? attemptFromParsed(known.op, known.intelType, url, text, parsed)
    : null;
  if (parsedAttempt) return parsedAttempt;

  const urlTarget = extractProvinceOperationsInfo(url);
  const formTarget = getFormTarget(text);
  const thievesLost = parseThievesLost(text);
  return {
    op: known.op,
    intelType: known.intelType,
    outcome: "failure",
    targetName: formTarget.targetName,
    targetSlot: formTarget.targetSlot ?? urlTarget?.slot ?? null,
    targetKingdom: formTarget.targetKingdom ?? urlTarget?.kingdom ?? null,
    accuracy: null,
    thievesLost,
  };
}
