// Racial unit values for Age 114 — used to compute ambush raw offense required.
// Formula: (elites*eliteDefVal + offSpecs*defSpecDefVal + soldiers*soldierOffVal) * 0.8
// Off specs defend at the racial def spec's defense value (their own is 0).
// Def specs cannot be sent on attacks — ignored.
// Soldiers contribute their offense value (3 for all races).

interface RaceUnitDef {
  eliteDef: number;
  defSpecDef: number;
  soldierOff: number;
}

const RACE_UNIT_DEF: Record<string, RaceUnitDef> = {
  "Avian":    { eliteDef: 6,  defSpecDef: 9,  soldierOff: 3 },
  "Dark Elf": { eliteDef: 12, defSpecDef: 8,  soldierOff: 3 },
  "Dwarf":    { eliteDef: 9,  defSpecDef: 11, soldierOff: 3 },
  "Elf":      { eliteDef: 6,  defSpecDef: 13, soldierOff: 3 },
  "Faery":    { eliteDef: 15, defSpecDef: 10, soldierOff: 3 },
  "Halfling": { eliteDef: 13, defSpecDef: 11, soldierOff: 3 },
  "Human":    { eliteDef: 9,  defSpecDef: 10, soldierOff: 3 },
  "Orc":      { eliteDef: 1,  defSpecDef: 10, soldierOff: 3 },
  "Undead":   { eliteDef: 7,  defSpecDef: 10, soldierOff: 3 },
};

export function computeAmbushRawOff(
  race: string | null | undefined,
  army: { elites: number; offSpecs: number; soldiers: number },
): number | null {
  if (!race) return null;
  const stats = RACE_UNIT_DEF[race];
  if (!stats) return null;
  const totalDef =
    army.elites   * stats.eliteDef   +
    army.offSpecs * stats.defSpecDef +
    army.soldiers * stats.soldierOff;
  return totalDef * 0.8 + 1;
}
