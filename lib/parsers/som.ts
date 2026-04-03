import { OFF_SPEC_GROUP, DEF_SPEC_GROUP, ELITE_GROUP } from "../game";
import type { SoMData, ArmyData } from "./types";
import { INT, FLOAT, KDLOC, parseNum, parseFloat_, parseAccuracy } from "./util";

const PROVINCE_RE = new RegExp(
  `Our thieves listen in on a report from the Military Elders of ([^(]+)${KDLOC}`,
);
const NET_OFF_RE = new RegExp(`Net Offensive Points at Home\\s*(${INT})`);
const NET_DEF_RE = new RegExp(`Net Defensive Points at Home\\s*(${INT})`);
const OME_RE = new RegExp(`Offensive Military Effectiveness\\s*(${FLOAT})`);
const DME_RE = new RegExp(`Defensive Military Effectiveness\\s*(${FLOAT})`);
const RETURN_RE = new RegExp(`(${FLOAT}) days left`, "g");
const GENERALS_RE = /Generals\s+((?:\d\s+)+)/;
const SOLDIERS_RE = new RegExp(`Soldiers\\s+((?:${INT}\\s+)+)`);
const OFF_RE = new RegExp(`(?:${OFF_SPEC_GROUP})\\s+((?:${INT}\\s+)+)`, "gi");
const DEF_RE = new RegExp(`(?:${DEF_SPEC_GROUP})\\s+((?:(?:-|${INT})\\s+)+)`, "gi");
const ELITE_RE = new RegExp(`(?:${ELITE_GROUP})\\s+((?:${INT}\\s+)+)`, "gi");
const HORSES_RE = new RegExp(`War Horses\\s+((?:${INT}\\s+)+)`);
const THIEVES_RE = new RegExp(`Thieves\\s+((?:${INT}\\s+)+)`);
const LAND_RE = new RegExp(`Captured Land\\s+((?:(?:-|${INT})\\s+)+)`);

function splitNums(s: string): number[] {
  return s.trim().split(/\s+/).map((v) => (v === "-" ? 0 : parseNum(v)));
}

export function parseSoM(text: string): SoMData | null {
  const provMatch = PROVINCE_RE.exec(text);
  // Self-SoM won't have province match
  if (!provMatch) return null;

  const name = provMatch[1].trim();
  const kingdom = provMatch[2];
  const accuracy = parseAccuracy(text);

  const netOffMatch = NET_OFF_RE.exec(text);
  const netDefMatch = NET_DEF_RE.exec(text);
  const omeMatch = OME_RE.exec(text);
  const dmeMatch = DME_RE.exec(text);
  if (!netOffMatch || !netDefMatch || !omeMatch || !dmeMatch) return null;

  // Count armies out by return times
  const returnTimes: number[] = [];
  let rm: RegExpExecArray | null;
  while ((rm = RETURN_RE.exec(text)) !== null) {
    returnTimes.push(parseFloat_(rm[1]));
  }

  // Build army slots: home + out armies
  const armyCount = 1 + returnTimes.length; // home + out
  const armies: ArmyData[] = [];

  // Home army
  const home: ArmyData = {
    armyType: "home", generals: 0, soldiers: 0, offSpecs: 0,
    defSpecs: 0, elites: 0, warHorses: 0, thieves: 0, landGained: 0, returnDays: null,
  };
  armies.push(home);

  // Out armies
  for (let i = 0; i < returnTimes.length; i++) {
    armies.push({
      armyType: `out_${i + 1}`, generals: 0, soldiers: 0, offSpecs: 0,
      defSpecs: 0, elites: 0, warHorses: 0, thieves: 0, landGained: 0, returnDays: returnTimes[i],
    });
  }

  // Training army
  const training: ArmyData = {
    armyType: "training", generals: 0, soldiers: 0, offSpecs: 0,
    defSpecs: 0, elites: 0, warHorses: 0, thieves: 0, landGained: 0, returnDays: null,
  };

  // Parse each row — values are columns: home, out_1, out_2, ...
  const genMatch = GENERALS_RE.exec(text);
  if (genMatch) {
    const vals = splitNums(genMatch[1]);
    if (vals[0] !== undefined) home.generals = vals[0];
    for (let i = 1; i < vals.length && i < armyCount; i++) {
      armies[i].generals = vals[i];
    }
  }

  const soldMatch = SOLDIERS_RE.exec(text);
  if (soldMatch) {
    const vals = splitNums(soldMatch[1]);
    if (vals[0] !== undefined) home.soldiers = vals[0];
    for (let i = 1; i < vals.length && i < armyCount; i++) {
      armies[i].soldiers = vals[i];
    }
  }

  // Off specs — first match is home/out, second is training
  const offMatches: RegExpExecArray[] = [];
  let offM: RegExpExecArray | null;
  while ((offM = OFF_RE.exec(text)) !== null) offMatches.push(offM);
  if (offMatches[0]) {
    const vals = splitNums(offMatches[0][1]);
    if (vals[0] !== undefined) home.offSpecs = vals[0];
    for (let i = 1; i < vals.length && i < armyCount; i++) {
      armies[i].offSpecs = vals[i];
    }
  }
  if (offMatches[1]) {
    const vals = splitNums(offMatches[1][1]);
    training.offSpecs = vals.reduce((a, b) => a + b, 0);
  }

  // Def specs
  const defMatches: RegExpExecArray[] = [];
  let defM: RegExpExecArray | null;
  while ((defM = DEF_RE.exec(text)) !== null) defMatches.push(defM);
  if (defMatches[0]) {
    const vals = splitNums(defMatches[0][1]);
    if (vals[0] !== undefined) home.defSpecs = vals[0];
  }
  if (defMatches[1]) {
    const vals = splitNums(defMatches[1][1]);
    training.defSpecs = vals.reduce((a, b) => a + b, 0);
  }

  // Elites
  const eliteMatches: RegExpExecArray[] = [];
  let elM: RegExpExecArray | null;
  while ((elM = ELITE_RE.exec(text)) !== null) eliteMatches.push(elM);
  if (eliteMatches[0]) {
    const vals = splitNums(eliteMatches[0][1]);
    if (vals[0] !== undefined) home.elites = vals[0];
    for (let i = 1; i < vals.length && i < armyCount; i++) {
      armies[i].elites = vals[i];
    }
  }
  if (eliteMatches[1]) {
    const vals = splitNums(eliteMatches[1][1]);
    training.elites = vals.reduce((a, b) => a + b, 0);
  }

  // War horses
  const horsesMatch = HORSES_RE.exec(text);
  if (horsesMatch) {
    const vals = splitNums(horsesMatch[1]);
    if (vals[0] !== undefined) home.warHorses = vals[0];
    for (let i = 1; i < vals.length && i < armyCount; i++) {
      armies[i].warHorses = vals[i];
    }
  }

  // Thieves (training only)
  const thievesMatch = THIEVES_RE.exec(text);
  if (thievesMatch) {
    const vals = splitNums(thievesMatch[1]);
    training.thieves = vals.reduce((a, b) => a + b, 0);
  }

  // Captured land
  const landMatch = LAND_RE.exec(text);
  if (landMatch) {
    const vals = splitNums(landMatch[1]);
    for (let i = 1; i < vals.length && i < armyCount; i++) {
      armies[i].landGained = vals[i];
    }
  }

  armies.push(training);

  return {
    name,
    kingdom,
    netOffense: parseNum(netOffMatch[1]),
    netDefense: parseNum(netDefMatch[1]),
    ome: parseFloat_(omeMatch[1]),
    dme: parseFloat_(dmeMatch[1]),
    armies,
    accuracy,
  };
}
