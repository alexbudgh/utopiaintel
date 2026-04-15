export interface KingdomTitleDetails {
  title: string;
  unlockedAtAcres: number | null;
  bonuses: string[];
}

const LAND_TITLE_MILESTONES = [
  { title: "Emerging", unlockedAtAcres: 35000, bonus: "+5% Scientist Generation" },
  { title: "Venerated", unlockedAtAcres: 50000, bonus: "+10% Book Generation" },
  { title: "Illustrious", unlockedAtAcres: 65000, bonus: "+10% Honor Bonus" },
  { title: "Glorious", unlockedAtAcres: 80000, bonus: "+5% Building Efficiency (BE)" },
  { title: "Exalted", unlockedAtAcres: 95000, bonus: "-15% Military Wages" },
  { title: "Grand", unlockedAtAcres: 110000, bonus: "+5% Science Efficiency" },
  { title: "Imperial", unlockedAtAcres: 130000, bonus: "+5% Offensive Military Efficiency (OME)" },
] as const;

export function getKingdomTitleDetails(title: string | null): KingdomTitleDetails | null {
  if (!title) return null;
  const idx = LAND_TITLE_MILESTONES.findIndex((entry) => entry.title === title);
  if (idx === -1) {
    return {
      title,
      unlockedAtAcres: null,
      bonuses: [],
    };
  }

  return {
    title,
    unlockedAtAcres: LAND_TITLE_MILESTONES[idx].unlockedAtAcres,
    bonuses: LAND_TITLE_MILESTONES.slice(0, idx + 1).map((entry) => entry.bonus),
  };
}
