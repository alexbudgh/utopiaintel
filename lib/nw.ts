// NW weights sourced from utopiaguide docs (Networth.md, Race.md, Units.md)

// Verified against a known province (Undead, 2469 acres, 517,597 NW, 6,606 wizards):
// NW/wiz=7 → 6,534 computed (~1% error); NW/wiz=5 → 9,148 (way off)
export const NW_PER_WIZARD = 7;

export const RACE_NW: Record<
  string,
  { offSpecs: number; defSpecs: number; elites: number; warHorses: number }
> = {
  Avian: { offSpecs: 4.8, defSpecs: 5.0, elites: 7.0, warHorses: 0 },
  "Dark Elf": { offSpecs: 6.0, defSpecs: 5.5, elites: 7.0, warHorses: 0.6 },
  Dwarf: { offSpecs: 4.0, defSpecs: 5.0, elites: 7.0, warHorses: 0.6 },
  Elf: { offSpecs: 4.0, defSpecs: 6.5, elites: 6.0, warHorses: 0.6 },
  Faery: { offSpecs: 4.0, defSpecs: 5.0, elites: 8.5, warHorses: 0.6 },
  Halfling: { offSpecs: 4.0, defSpecs: 5.0, elites: 7.5, warHorses: 0.6 },
  Human: { offSpecs: 4.8, defSpecs: 5.0, elites: 6.5, warHorses: 0.6 },
  Orc: { offSpecs: 5.2, defSpecs: 5.0, elites: 7.0, warHorses: 0.6 },
  Undead: { offSpecs: 4.4, defSpecs: 5.0, elites: 7.0, warHorses: 0.6 },
};

export interface NwInputs {
  networth: number | null;
  land: number | null;
  race: string | null;
  personality?: string | null;
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
  if (
    p.thieves == null ||
    p.buildings_built == null ||
    p.science_total_books == null
  )
    return null;

  const offSpecNw =
    raceNw.offSpecs + (p.personality === "War Hero" ? 2 * 0.4 : 0);
  // Paladin horse NW is empirically treated as 0 for the wizard residual.
  //
  // The guide says Paladin gets "+2 War Horse Strength (affects NW)"
  // and "All lands hold and produce Horses (8 per acre)", which could
  // be read as: first 8/acre are free, but horses above that cap count
  // at boosted horse NW. Real same-tick intel from two redacted Paladin
  // provinces did not match that interpretation: charging horses above
  // 8/acre made the residual negative, while excluding all Paladin horse
  // NW matched the official intel site's rWPA within normal drift.
  // Keep this exception until we can confirm the exact official formula.
  const warHorseNw = p.personality === "Paladin" ? 0 : raceNw.warHorses;
  const prisonerNw = (p.personality === "Warrior" ? 8 + 5 : 8) * 0.2;

  const troopNw =
    (p.soldiers ?? 0) * 0.75 +
    (p.off_specs ?? 0) * offSpecNw +
    (p.def_specs ?? 0) * raceNw.defSpecs +
    (p.elites ?? 0) * raceNw.elites +
    (p.war_horses ?? 0) * warHorseNw +
    (p.peasants ?? 0) * 0.25 +
    (p.prisoners ?? 0) * prisonerNw;

  // Residual form of: barren acres * 40 + completed buildings * 60 + in-progress buildings * 50.
  // Since p.land * 40 already gives every acre its barren-land NW, completed buildings add +20
  // and in-progress buildings add only +10 more, not the full 50 again.
  const landBuildingNw =
    p.land * 40 + p.buildings_built * 20 + (p.buildings_in_progress ?? 0) * 10;

  const scienceNw = p.science_total_books * 0.000007 * p.land;

  const moneyNw = (p.money ?? 0) / 1000;

  const thievesNw = p.thieves * 5;

  const residual =
    p.networth - troopNw - thievesNw - moneyNw - landBuildingNw - scienceNw;

  if (residual < 0) return null;
  return residual / NW_PER_WIZARD;
}
