import { detectIntelType } from "./detect";
import { parseSoT } from "./sot";
import { parseSurvey } from "./survey";
import { parseSoM } from "./som";
import { parseSoS } from "./sos";
import { parseSoD } from "./sod";
import { parseInfiltrate } from "./infiltrate";
import { parseKingdom } from "./kingdom";
import { parseState } from "./state";
import type { ParseResult } from "./types";

export type { ParseResult } from "./types";

export function parseIntel(url: string, dataSimple: string, selfProv?: string): ParseResult | null {
  const type = detectIntelType(url);
  if (!type) return null;

  switch (type) {
    case "sot": {
      const data = parseSoT(dataSimple);
      return data ? { type: "sot", data } : null;
    }
    case "survey": {
      const data = parseSurvey(dataSimple, selfProv);
      return data ? { type: "survey", data } : null;
    }
    case "som": {
      const data = parseSoM(dataSimple, selfProv);
      return data ? { type: "som", data } : null;
    }
    case "sos": {
      const data = parseSoS(dataSimple, selfProv);
      return data ? { type: "sos", data } : null;
    }
    case "sod": {
      const data = parseSoD(dataSimple);
      return data ? { type: "sod", data } : null;
    }
    case "infiltrate": {
      const data = parseInfiltrate(dataSimple);
      return data ? { type: "infiltrate", data } : null;
    }
    case "kingdom": {
      const data = parseKingdom(dataSimple);
      return data ? { type: "kingdom", data } : null;
    }
    case "state": {
      if (!selfProv) return null;
      const data = parseState(dataSimple, selfProv);
      return data ? { type: "state", data } : null;
    }
  }
}
