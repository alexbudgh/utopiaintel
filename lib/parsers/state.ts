import type { StateData } from "./types";
import { INT, parseNum } from "./util";

const NETWORTH_RE = new RegExp(`Current Networth\\s*(${INT}) gold coins`);
const LAND_RE = new RegExp(`Current Land\\s*(${INT}) acres`);
const PEASANTS_RE = new RegExp(`\\bPeasants\\s+(${INT})`);
const THIEVES_RE = new RegExp(`\\bThieves\\s+(${INT})`);
const WIZARDS_RE = new RegExp(`\\bWizards\\s+(${INT})`);

export function parseState(text: string, selfProv: string): StateData | null {
  const nwMatch = NETWORTH_RE.exec(text);
  const landMatch = LAND_RE.exec(text);
  if (!nwMatch || !landMatch) return null;

  const peasantsMatch = PEASANTS_RE.exec(text);
  const thievesMatch = THIEVES_RE.exec(text);
  const wizardsMatch = WIZARDS_RE.exec(text);

  return {
    name: selfProv,
    kingdom: "",
    land: parseNum(landMatch[1]),
    networth: parseNum(nwMatch[1]),
    peasants: peasantsMatch ? parseNum(peasantsMatch[1]) : 0,
    thieves: thievesMatch ? parseNum(thievesMatch[1]) : 0,
    wizards: wizardsMatch ? parseNum(wizardsMatch[1]) : 0,
  };
}
