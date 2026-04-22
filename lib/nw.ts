// NW weights sourced from utopiaguide docs (Networth.md, Race.md, Units.md)

// Verified against a known province (Undead, 2469 acres, 517,597 NW, 6,606 wizards):
// NW/wiz=7 → 6,534 computed (~1% error); NW/wiz=5 → 9,148 (way off)
export const NW_PER_WIZARD = 7;

// TODO Age 115: War Hero grants +2 off-spec strength (affects NW); personality-aware NW weights not yet modeled.
// TODO Age 115: Paladin grants +2 war-horse strength (affects NW); personality-aware NW weights not yet modeled.
export const RACE_NW: Record<string, { offSpecs: number; defSpecs: number; elites: number; warHorses: number }> = {
  Avian:      { offSpecs: 4.8, defSpecs: 5.0, elites: 7.0, warHorses: 0   },
  "Dark Elf": { offSpecs: 6.0, defSpecs: 5.5, elites: 7.0, warHorses: 0.6 },
  Dwarf:      { offSpecs: 4.0, defSpecs: 5.0, elites: 7.0, warHorses: 0.6 },
  Elf:        { offSpecs: 4.0, defSpecs: 6.5, elites: 6.0, warHorses: 0.6 },
  Faery:      { offSpecs: 4.0, defSpecs: 5.0, elites: 8.5, warHorses: 0.6 },
  Halfling:   { offSpecs: 4.0, defSpecs: 5.0, elites: 7.5, warHorses: 0.6 },
  Human:      { offSpecs: 4.8, defSpecs: 5.0, elites: 6.5, warHorses: 0.6 },
  Orc:        { offSpecs: 5.2, defSpecs: 5.0, elites: 7.0, warHorses: 0.6 },
  Undead:     { offSpecs: 4.4, defSpecs: 5.0, elites: 7.0, warHorses: 0.6 },
};

export interface NwInputs {
  networth: number | null;
  land: number | null;
  race: string | null;
  soldiers: number | null;
  off_specs: number | null;
  def_specs: number | null;
  elites: number | null;
  war_horses: number | null;
  peasants: number | null;
  prisoners: number | null;
  thieves: number | null;
  money: number | null;
  buildings_built: number | null;
  buildings_in_progress: number | null;
  science_total_books: number | null;
}

export function computeWizardCount(p: NwInputs): number | null {
  if (!p.networth || !p.land || !p.race) return null;
  const raceNw = RACE_NW[p.race];
  if (!raceNw) return null;
  if (p.thieves == null || p.buildings_built == null || p.science_total_books == null) return null;

  const troopNw =
    (p.soldiers ?? 0) * 0.75 +
    (p.off_specs ?? 0) * raceNw.offSpecs +
    (p.def_specs ?? 0) * raceNw.defSpecs +
    (p.elites ?? 0) * raceNw.elites +
    (p.war_horses ?? 0) * raceNw.warHorses +
    (p.peasants ?? 0) * 0.25 +
    (p.prisoners ?? 0) * 1.6;

  const landBuildingNw = p.land * 40
    + p.buildings_built * 20
    + (p.buildings_in_progress ?? 0) * 10;

  const scienceNw = p.science_total_books * 0.000007 * p.land;

  const moneyNw = (p.money ?? 0) / 1000;

  const thievesNw = p.thieves * 5;

  const residual = p.networth - troopNw - thievesNw - moneyNw - landBuildingNw - scienceNw;

  if (residual < 0) return null;
  return residual / NW_PER_WIZARD;
}
