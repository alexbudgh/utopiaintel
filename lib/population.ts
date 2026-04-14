import { sameTick } from "./ui";
import { computeWizardCount } from "./nw";

const RACE_POP_FACTOR: Record<string, number> = {
  Halfling: 1.1,
};

// Honor title → base population bonus (from the Titles of Nobility table)
// Applied as: honorMult = 1 + honorBonus × honorEffectMod
const HONOR_POP_BONUS: Record<string, number> = {
  Knight: 0.01, Lady: 0.01,
  Lord: 0.02, "Noble Lady": 0.02,
  Baron: 0.03, Baroness: 0.03,
  Viscount: 0.04, Viscountess: 0.04,
  Count: 0.06, Countess: 0.06,
  Marquis: 0.08, Marchioness: 0.08,
  Duke: 0.10, Duchess: 0.10,
  Prince: 0.12, Princess: 0.12,
};

// Personality modifiers to honor effects (only War Hero has one)
const PERSONALITY_HONOR_EFFECT_MOD: Record<string, number> = {
  "War Hero": 1.5,
};

// Personality direct population bonuses (Paladin = "the Chivalrous" only)
const PERSONALITY_POP_BONUS: Record<string, number> = {
  "Paladin": 0.05,
};

export interface PopInputs {
  race: string | null;
  honor_title: string | null;
  personality: string | null;
  // for maxPop — from survey
  barren_land: number | null;
  homes_built: number | null;
  buildings_built: number | null;
  survey_age: string | null;
  // housing science — from SoS
  housing_effect: number | null;
  sciences_age: string | null;
  // for currentPop — from SoT
  networth: number | null;
  land: number | null;
  peasants: number | null;
  soldiers: number | null;
  off_specs: number | null;
  def_specs: number | null;
  elites: number | null;
  war_horses: number | null;
  money: number | null;
  // thieves come from Infiltrate op (enemy) or self-state; separate age from SoT resources
  thieves: number | null;
  thieves_age: string | null;
  // wizards: directly known for self; estimated via NW residual for enemies
  wizards: number | null;
  prisoners: number | null;
  buildings_in_progress: number | null;
  science_total_books: number | null;
  troops_age: string | null;
  resources_age: string | null;
  // SoM training queue — required for enemy estimates to avoid undercounting
  // (soldiers are drafted, not trained, so no training_soldiers)
  training_off_specs: number | null;
  training_def_specs: number | null;
  training_elites: number | null;
  training_thieves: number | null;
  som_age: string | null;
}

export interface PopEstimate {
  maxPop: number | null;
  currentPop: number | null;
  wizardsEstimated: boolean;  // true when wizard count was inferred from NW residual
  // What ops are needed to compute each half
  needsForMax: string[];
  needsForCurrent: string[];
}

export function estimatePop(p: PopInputs): PopEstimate {
  const needsForMax: string[] = [];
  const needsForCurrent: string[] = [];
  let wizardsEstimated = false;

  // --- Max population ---
  let maxPop: number | null = null;
  const hasSurvey = p.buildings_built != null;
  const hasHousing = p.housing_effect != null;
  const surveyAndSciSameTick = sameTick(p.survey_age, p.sciences_age);

  if (!hasSurvey) needsForMax.push("Survey (growth page)");
  if (!hasHousing) needsForMax.push("Science spy (SoS)");
  if (hasSurvey && hasHousing && !surveyAndSciSameTick) {
    needsForMax.push("Survey + SoS from the same tick");
  }

  if (hasSurvey && hasHousing && surveyAndSciSameTick) {
    const barren = p.barren_land ?? 0;
    const homes = p.homes_built ?? 0;
    // Economy.md: Raw Living Space = (Built + In Progress) * 25 + Barren * 15 + Homes * 10
    // buildings_built already excludes barren; homes bonus (10 extra) on top of the 25 already in built
    const rawCap = (p.buildings_built ?? 0) * 25
                 + (p.buildings_in_progress ?? 0) * 25
                 + barren * 15
                 + homes * 10;
    const raceFactor = (p.race && RACE_POP_FACTOR[p.race]) ? RACE_POP_FACTOR[p.race] : 1.0;
    const housingMult = 1 + (p.housing_effect ?? 0) / 100;
    const honorBonus = (p.honor_title && HONOR_POP_BONUS[p.honor_title]) ? HONOR_POP_BONUS[p.honor_title] : 0;
    const honorEffectMod = (p.personality && PERSONALITY_HONOR_EFFECT_MOD[p.personality]) ? PERSONALITY_HONOR_EFFECT_MOD[p.personality] : 1.0;
    const personalityPopBonus = (p.personality && PERSONALITY_POP_BONUS[p.personality]) ? PERSONALITY_POP_BONUS[p.personality] : 0;
    const honorMult = 1 + honorBonus * honorEffectMod + personalityPopBonus;
    maxPop = Math.round(rawCap * raceFactor * housingMult * honorMult);
  }

  // --- Current population ---
  // SoT gives troops + prisoners (same row/tick). Thieves come from Infiltrate (separate tick).
  // SoM is required to capture units in training (not visible on SoT).
  // Wizards are never directly visible on enemy provinces (NW residual only).
  let currentPop: number | null = null;
  const hasTroops = p.peasants != null || p.soldiers != null || p.off_specs != null ||
                    p.def_specs != null || p.elites != null;
  const hasTraining = p.training_off_specs != null ||
                      p.training_def_specs != null || p.training_elites != null ||
                      p.training_thieves != null;
  const troopsSameTick = sameTick(p.troops_age, p.resources_age);
  const somSameTick = sameTick(p.troops_age, p.som_age);

  if (!hasTroops) needsForCurrent.push("Spy on Throne (SoT)");
  if (!hasTraining) needsForCurrent.push("Spy on Military (SoM)");
  if (hasTroops && !troopsSameTick) {
    needsForCurrent.push("SoT troops and resources from the same tick");
  }
  if (hasTroops && hasTraining && !somSameTick) {
    needsForCurrent.push("SoT and SoM from the same tick");
  }

  if (hasTroops && hasTraining && troopsSameTick && somSameTick) {
    // Wizards: use direct value if known (self), else estimate from NW residual
    let wizards = p.wizards;
    if (wizards == null) {
      const est = computeWizardCount({
        networth: p.networth, land: p.land, race: p.race,
        soldiers: p.soldiers, off_specs: p.off_specs, def_specs: p.def_specs,
        elites: p.elites, war_horses: p.war_horses, peasants: p.peasants,
        prisoners: p.prisoners, thieves: p.thieves, money: p.money,
        buildings_built: p.buildings_built, buildings_in_progress: p.buildings_in_progress,
        science_total_books: p.science_total_books,
      });
      if (est != null) {
        wizards = Math.round(est);
        wizardsEstimated = true;
      }
    }

    currentPop =
      (p.peasants          ?? 0) +
      (p.soldiers          ?? 0) +
      (p.off_specs         ?? 0) +
      (p.def_specs         ?? 0) +
      (p.elites            ?? 0) +
      // Training units from SoM
      (p.training_off_specs ?? 0) +
      (p.training_def_specs ?? 0) +
      (p.training_elites   ?? 0) +
      (p.training_thieves  ?? 0) +
      // Thieves from Infiltrate op — included when available, even if different tick
      (p.thieves           ?? 0) +
      (wizards             ?? 0);
  }

  return { maxPop, currentPop, wizardsEstimated, needsForMax, needsForCurrent };
}
