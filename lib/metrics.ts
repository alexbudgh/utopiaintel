import { sameTick } from "./ui";
import type { ProvinceRow } from "./db";
import { computeWizardCount } from "./nw";

// Pure metric value helpers. Callers are responsible for ensuring their inputs
// come from a valid same-tick source set before using these.
export function rawPerAcreValue(count: number | null | undefined, land: number | null | undefined): number | null {
  if (count == null || !land) return null;
  return count / land;
}

export function tpaPersonalityEffectValue(personality: string | null): number {
  if (personality === "Rogue") return 20;
  if (personality === "Heretic") return 15;
  return 0;
}

export function tpaRaceEffectValue(race: string | null): number {
  if (race === "Halfling") return 20;
  if (race === "Elf") return -20;
  return 0;
}

export function wpaPersonalityEffectValue(personality: string | null, mana: number | null): number {
  if (personality === "Necromancer") return 35;
  if (personality === "Heretic") return 15;
  if (personality === "Mystic" && mana != null && mana > 40) return 20;
  return 0;
}

export function wpaRaceEffectValue(race: string | null): number {
  if (race === "Elf") return 40;
  if (race === "Faery") return 20;
  return 0;
}

const HONOR_WPA_EFFECT: Record<string, number> = {
  Knight: 3, Lady: 3,
  Lord: 6, "Noble Lady": 6,
  Baron: 9, Baroness: 9,
  Viscount: 12, Viscountess: 12,
  Count: 18, Countess: 18,
  Marquis: 24, Marchioness: 24,
  Duke: 30, Duchess: 30,
  Prince: 36, Princess: 36,
};

// Honor.md has separate WPA and TPA columns. They match today, but keep them
// modeled separately so a future guide change can diverge one without changing
// the other. War Hero's "Honor Effects" modifier applies to both columns.
const HONOR_TPA_EFFECT: Record<string, number> = {
  ...HONOR_WPA_EFFECT,
};

export function wpaHonorEffectValue(honorTitle: string | null, personality: string | null): number {
  const baseEffect = honorTitle ? HONOR_WPA_EFFECT[honorTitle] ?? 0 : 0;
  const honorEffectMod = personality === "War Hero" ? 1.7 : 1;
  return baseEffect * honorEffectMod;
}

export function tpaHonorEffectValue(honorTitle: string | null, personality: string | null): number {
  const baseEffect = honorTitle ? HONOR_TPA_EFFECT[honorTitle] ?? 0 : 0;
  const honorEffectMod = personality === "War Hero" ? 1.7 : 1;
  return baseEffect * honorEffectMod;
}

export function computeMtpaValue(
  rtpa: number | null,
  crimeEffect: number | null,
  race: string | null,
  honorTitle: string | null,
  personality: string | null,
): number | null {
  if (rtpa == null || crimeEffect == null) return null;
  return rtpa
    * (1 + crimeEffect / 100)
    * (1 + tpaRaceEffectValue(race) / 100)
    * (1 + tpaHonorEffectValue(honorTitle, personality) / 100)
    * (1 + tpaPersonalityEffectValue(personality) / 100);
}

export function computeOtpaValue(mtpa: number | null, thievesDensEffect: number | null): number | null {
  if (mtpa == null || thievesDensEffect == null) return null;
  return mtpa * (1 + thievesDensEffect / 100);
}

export function computeDtpaValue(mtpa: number | null, watchTowersEffect: number | null): number | null {
  if (mtpa == null || watchTowersEffect == null) return null;
  return mtpa * (1 + watchTowersEffect / 100);
}

export function computeMwpaValue(
  rwpa: number | null,
  channelingEffect: number | null,
  race: string | null,
  honorTitle: string | null,
  personality: string | null,
  mana: number | null,
): number | null {
  if (rwpa == null || channelingEffect == null) return null;
  return rwpa
    * (1 + channelingEffect / 100)
    * (1 + wpaRaceEffectValue(race) / 100)
    * (1 + wpaHonorEffectValue(honorTitle, personality) / 100)
    * (1 + wpaPersonalityEffectValue(personality, mana) / 100);
}

// ProvinceRow wrappers apply the live same-tick checks used by the table UI.
export function tpaPersonalityEffect(p: Pick<ProvinceRow, "personality">): number {
  return tpaPersonalityEffectValue(p.personality);
}

export function tpaRaceEffect(p: Pick<ProvinceRow, "race">): number {
  return tpaRaceEffectValue(p.race);
}

export function tpaHonorEffect(p: Pick<ProvinceRow, "honor_title" | "personality">): number {
  return tpaHonorEffectValue(p.honor_title, p.personality);
}

export function wpaPersonalityEffect(p: Pick<ProvinceRow, "personality" | "mana">): number {
  return wpaPersonalityEffectValue(p.personality, p.mana);
}

export function wpaRaceEffect(p: Pick<ProvinceRow, "race">): number {
  return wpaRaceEffectValue(p.race);
}

export function wpaHonorEffect(p: Pick<ProvinceRow, "honor_title" | "personality">): number {
  return wpaHonorEffectValue(p.honor_title, p.personality);
}

export function computeRtpa(p: ProvinceRow): number | null {
  if (!sameTick(p.thieves_age, p.overview_age)) return null;
  return rawPerAcreValue(p.thieves, p.land);
}

export function computeMtpa(p: ProvinceRow): number | null {
  const rtpa = computeRtpa(p);
  if (!sameTick(p.thieves_age, p.overview_age, p.sciences_age)) return null;
  return computeMtpaValue(rtpa, p.crime_effect, p.race, p.honor_title, p.personality);
}

export function computeOtpa(p: ProvinceRow): number | null {
  const mtpa = computeMtpa(p);
  if (!sameTick(p.thieves_age, p.overview_age, p.sciences_age, p.survey_age)) return null;
  return computeOtpaValue(mtpa, p.thieves_dens_effect);
}

export function computeDtpa(p: ProvinceRow): number | null {
  const mtpa = computeMtpa(p);
  if (!sameTick(p.thieves_age, p.overview_age, p.sciences_age, p.survey_age)) return null;
  return computeDtpaValue(mtpa, p.watch_towers_effect);
}

export function computeRwpa(p: ProvinceRow): number | null {
  if (p.wizards != null) {
    if (!sameTick(p.resources_age, p.overview_age)) return null;
    return rawPerAcreValue(p.wizards, p.land);
  }
  if (!p.networth || !p.race) return null;
  if (!sameTick(p.thieves_age, p.overview_age, p.sciences_age, p.survey_age, p.troops_age, p.resources_age)) return null;
  const w = computeWizardCount(p);
  return rawPerAcreValue(w, p.land);
}

export function computeMwpa(p: ProvinceRow): number | null {
  const rwpa = computeRwpa(p);
  if (p.wizards != null && !sameTick(p.resources_age, p.overview_age, p.sciences_age)) return null;
  return computeMwpaValue(rwpa, p.channeling_effect, p.race, p.honor_title, p.personality, p.mana);
}
