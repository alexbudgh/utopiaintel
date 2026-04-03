// Utopia game constants — races, buildings, sciences, etc.

export interface RaceData {
  name: string;
  shortName: string;
  offSpec: string;
  defSpec: string;
  elite: string;
  soldierStr: number;
  offSpecStr: number;
  defSpecStr: number;
  eliteOffStr: number;
  eliteDefStr: number;
}

// Age 114 unit stats.
export const RACES: RaceData[] = [
  { name: "Avian",    shortName: "AV", offSpec: "Griffins",              defSpec: "Harpies",            elite: "Drakes",             soldierStr: 3, offSpecStr: 13, defSpecStr:  9, eliteOffStr: 16, eliteDefStr:  6 },
  { name: "Dark Elf", shortName: "DE", offSpec: "Night Rangers",         defSpec: "Druids",             elite: "Drows",              soldierStr: 3, offSpecStr: 15, defSpecStr:  8, eliteOffStr:  4, eliteDefStr: 12 },
  { name: "Dwarf",    shortName: "DW", offSpec: "Warriors",              defSpec: "Axemen",             elite: "Berserkers",         soldierStr: 3, offSpecStr: 10, defSpecStr: 11, eliteOffStr: 15, eliteDefStr:  9 },
  { name: "Elf",      shortName: "EL", offSpec: "Rangers",               defSpec: "Archers",            elite: "Elf Lords",          soldierStr: 3, offSpecStr: 10, defSpecStr: 13, eliteOffStr: 14, eliteDefStr:  6 },
  { name: "Faery",    shortName: "FA", offSpec: "Magicians",             defSpec: "Druids",             elite: "Beastmasters",       soldierStr: 3, offSpecStr: 10, defSpecStr: 10, eliteOffStr:  8, eliteDefStr: 15 },
  { name: "Halfling", shortName: "HA", offSpec: "Strongarms",            defSpec: "Slingers",           elite: "Brutes",             soldierStr: 3, offSpecStr: 10, defSpecStr: 11, eliteOffStr: 10, eliteDefStr: 13 },
  { name: "Human",    shortName: "HU", offSpec: "Swordsmen",             defSpec: "Archers",            elite: "Knights",            soldierStr: 3, offSpecStr: 12, defSpecStr: 10, eliteOffStr: 14, eliteDefStr:  9 },
  { name: "Orc",      shortName: "OR", offSpec: "Goblins",               defSpec: "Trolls",             elite: "Ogres",              soldierStr: 3, offSpecStr: 13, defSpecStr: 10, eliteOffStr: 20, eliteDefStr:  1 },
  { name: "Undead",   shortName: "UD", offSpec: "Skeletons",             defSpec: "Zombies",            elite: "Ghouls",             soldierStr: 3, offSpecStr: 11, defSpecStr: 10, eliteOffStr: 16, eliteDefStr:  7 },
];

export const RACE_NAMES = RACES.flatMap((r) => [r.name, r.shortName]);
export const OFF_SPECS = RACES.map((r) => r.offSpec);
export const DEF_SPECS = RACES.map((r) => r.defSpec);
export const ELITES = RACES.map((r) => r.elite);

// Deduplicated groups for regex
export const RACE_GROUP = [...new Set(RACE_NAMES)].join("|");
export const OFF_SPEC_GROUP = [...new Set(OFF_SPECS)].join("|");
export const DEF_SPEC_GROUP = [...new Set(DEF_SPECS)].join("|");
export const ELITE_GROUP = [...new Set(ELITES)].join("|");

export const BUILDINGS = [
  "Barren Land", "Homes", "Farms", "Mills", "Banks",
  "Training Grounds", "Armouries", "Military Barracks",
  "Forts", "Guard Stations", "Hospitals", "Guilds",
  "Towers", "Thieves' Dens", "Watch Towers", "Libraries",
  "Schools", "Stables", "Dungeons", "Unknown",
];
export const BUILDING_GROUP = BUILDINGS.join("|");

// Current science system (18 sciences across 3 groups)
// Economy: Alchemy, Tools, Housing, Production, Bookkeeping, Artisan
// Military: Strategy, Siege, Tactics, Valor, Heroism, Resilience
// Arcane Arts: Crime, Channeling, Shielding, Cunning, Sorcery, Finesse
export const SCIENCES = [
  "Alchemy", "Tools", "Housing", "Production", "Bookkeeping", "Artisan",
  "Strategy", "Siege", "Tactics", "Valor", "Heroism", "Resilience",
  "Crime", "Channeling", "Shielding", "Cunning", "Sorcery", "Finesse",
];
// Legacy / alternate names (Angel addon format, old science names)
export const SCIENCE_ALTS: Record<string, string> = {
  Income: "Alchemy",
  "Building Effectiveness": "Tools",
  "Population Limits": "Housing",
  Food: "Production",
  "Food Production": "Production",
  "Gains in Combat": "Strategy",
  "Thievery Effectiveness": "Crime",
  "Magic Effectiveness & Rune Production": "Channeling",
  "Magic Effectiveness": "Channeling",
};
export const SCIENCE_GROUP = [...SCIENCES, ...Object.keys(SCIENCE_ALTS)].join("|");

// Age 114 personalities. "Hero" is what appears after "the " in SoT ruler text
// (the full design name is "War Hero" but the game displays just "Hero").
export const PERSONALITIES = [
  "Artisan", "Paladin", "Heretic", "Mystic",
  "Rogue", "Tactician", "Warrior", "Necromancer",
  "General", "Hero",
];
export const PERSONALITY_GROUP = PERSONALITIES.join("|");

export const HONOR_TITLES = [
  "Peasant", "Knight", "Lord", "Baron", "Viscount",
  "Count", "Marquis", "Duke", "Prince", "King",
  // Female variants
  "Mr.", "Mrs.", "Sir", "Lady", "Noble Lady",
  "Baroness", "Viscountess", "Countess", "Marchioness",
  "Duchess", "Princess", "Queen",
];
export const HONOR_TITLE_GROUP = HONOR_TITLES.join("|");

export function getRaceByName(name: string): RaceData | undefined {
  return RACES.find(
    (r) => r.name.toLowerCase() === name.toLowerCase() || r.shortName.toLowerCase() === name.toLowerCase(),
  );
}

export function normalizeScienceName(name: string): string {
  return SCIENCE_ALTS[name] ?? name;
}
