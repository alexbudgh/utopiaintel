// Shared types for all parsers

export type IntelType =
  | "sot"
  | "survey"
  | "som"
  | "sos"
  | "sod"
  | "infiltrate"
  | "kingdom"
  | "state"
  | "kingdom_news"
  | "province_news"
  | "train_army"
  | "build"
  | "rob"
  | "sorcery"
  | "attack";

export interface ProvinceId {
  name: string;
  kingdom: string; // e.g. "4:5"
}

export interface SoTData extends ProvinceId {
  race: string;
  personality?: string;
  honorTitle?: string;
  ruler?: string;
  land: number;
  networth: number;
  soldiers: number;
  offSpecs: number;
  defSpecs: number;
  peasants: number;
  elites: number;
  buildingEfficiency: number;
  thieves: number | null;
  stealth: number | null;
  money: number;
  wizards: number | null;
  mana: number | null;
  food: number;
  warHorses: number;
  runes: number;
  prisoners: number;
  tradeBalance: number;
  offPoints: number;
  defPoints: number;
  plagued: boolean;
  overpopulated: boolean;
  overpopDeserters: number | null;
  dragonType: string | null;
  dragonName: string | null;
  hitStatus: string;
  war: boolean;
  warTarget: string | null;
  activeEffects: Array<{
    name: string;
    kind: "spell" | "ritual" | "thievery";
    durationText: string | null;
    remainingTicks: number | null;
    effectivenessPercent: number | null;
  }>;
  accuracy: number;
  armiesOut?: { daysLeft: number; acres: number }[];
}

export interface SurveyBuilding {
  building: string;
  built: number;
  inProgress: number;
}

export interface SurveyData extends ProvinceId {
  buildings: SurveyBuilding[];
  thieveryEffectiveness: number | null; // "X% higher thievery effectiveness" (Thieves' Dens)
  thiefPreventChance: number | null; // "X% chance of preventing enemy thief missions" (Watch Towers)
  castlesEffect: number | null; // "X% lower resource and honor losses when attacked" (Castles)
  accuracy: number;
}

export interface ArmyData {
  armyType: string; // "home" | "training" | "out_1" | "out_2" ...
  generals: number;
  soldiers: number;
  offSpecs: number;
  defSpecs: number;
  elites: number;
  warHorses: number;
  thieves: number;
  landGained: number;
  returnDays: number | null;
}

export interface SoMData extends ProvinceId {
  netOffense: number;
  netDefense: number;
  ome: number;
  dme: number;
  armies: ArmyData[];
  accuracy: number;
}

export interface ScienceEntry {
  science: string;
  books: number;
  effect: number;
}

export interface SoSData extends ProvinceId {
  sciences: ScienceEntry[];
  accuracy: number;
}

export interface KingdomProvince {
  slot: number;
  name: string;
  race: string;
  land: number;
  networth: number;
  honorTitle: string;
}

export interface KingdomOpenRelation {
  name: string;
  location: string;
  status: string;
}

export interface WarDoctrine {
  race: string;
  provinces: number;
  effect: string;
  bonusPercent: number;
}

export interface KingdomData {
  name: string;
  location: string; // e.g. "4:5"
  kingdomTitle: string | null;
  totalNetworth: number | null;
  totalLand: number | null;
  totalHonor: number | null;
  warsWon: number | null;
  warLosses: number | null;
  networthRank: number | null;
  landRank: number | null;
  honorRank: number | null;
  warTarget: string | null;
  theirAttitudeToUs: string | null;
  theirAttitudePoints: number | null;
  ourAttitudeToThem: string | null;
  ourAttitudePoints: number | null;
  hostilityMeterVisibleUntil: string | null;
  openRelations: KingdomOpenRelation[];
  warDoctrines: WarDoctrine[];
  provinces: KingdomProvince[];
}

export interface SoDData extends ProvinceId {
  defPoints: number;
  accuracy: number;
}

export interface InfiltrateData extends ProvinceId {
  thieves: number;
  accuracy: number;
}

// Self-intel from council_state: land, networth, population counts
export interface StateData extends ProvinceId {
  land: number;
  networth: number;
  peasants: number;
  thieves: number;
  wizards: number;
  totalPop: number | null;
  maxPop: number | null;
}

export interface TrainArmyData extends ProvinceId {
  freeSpecialistCredits: number;
}

export interface BuildData extends ProvinceId {
  freeBuildingCredits: number;
}

export interface SorceryData extends ProvinceId {
  spell: string;
  outcome: "success" | "failure";
  runesSpent: number | null;
  wizardsLost: number;
  durationDays: number | null;
  targetName: string | null;
  targetSlot: number | null;
  targetKingdom: string | null;
  targetGameId: number | null;
  wizards: number | null;
  runes: number | null;
  mana: number | null;
}

export type RobOp =
  | "towers"
  | "vaults"
  | "granaries"
  | "night_strike"
  | "kidnap"
  | "bribe_generals"
  | "incite_riots"
  | "sabotage_wizards"
  | "arson"
  | "greater_arson"
  | "destabilize_guilds"
  | "bribe_thieves"
  | "propaganda"
  | "assassinate_wizards"
  | "free_prisoners";

export interface RobData extends ProvinceId {
  op: RobOp;
  targetName: string | null;
  targetSlot: number | null;
  targetKingdom: string | null;
  outcome: "success" | "failure";
  amountStolen: number | null;
  thievesLost: number;
  thieves: number | null;
  stealth: number | null;
  troopsAssassinated: number | null; // night_strike
  kidnapped: number | null; // kidnap
  acresBurned: number | null; // arson, greater_arson
  arsonBuilding: string | null; // greater_arson — building type from b= URL param
  effectDuration: number | null; // incite_riots, sabotage_wizards, destabilize_guilds
  deserters: number | null; // propaganda
  deserterType: string | null; // propaganda — unit type (wizards, soldiers, etc.)
  wizardsAssassinated: number | null; // assassinate_wizards
  prisonersFreed: number | null; // free_prisoners — freed from target
  prisonersCaptured: number | null; // free_prisoners — brought home
  targetGameId: number | null;
  thievesSent: number | null;
}

export type AttackType =
  | "traditional_march"
  | "conquest"
  | "ambush"
  | "plunder"
  | "learn"
  | "massacre"
  | "raze"
  | "unknown";

export interface AttackData extends ProvinceId {
  attackType: AttackType;
  outcome: "success" | "failure";
  targetName: string | null;
  targetKingdom: string | null;
  acresTaken: number | null;
  buildingsSurvived: number | null;
  specialistCredits: number | null;
  peasantsSettled: number | null;
  massacred: number | null;
  enemyKilled: number | null;
  enemyImprisoned: number | null;
  returnDays: number | null;
}

export type ParseResult =
  | { type: "sot"; data: SoTData }
  | { type: "survey"; data: SurveyData }
  | { type: "som"; data: SoMData }
  | { type: "sos"; data: SoSData }
  | { type: "sod"; data: SoDData }
  | { type: "infiltrate"; data: InfiltrateData }
  | { type: "kingdom"; data: KingdomData }
  | { type: "state"; data: StateData }
  | { type: "kingdom_news"; data: import("./kingdom_news").KingdomNewsData }
  | { type: "province_news"; data: import("./province_news").ProvinceNewsData }
  | { type: "train_army"; data: TrainArmyData }
  | { type: "build"; data: BuildData }
  | { type: "rob"; data: RobData }
  | { type: "sorcery"; data: SorceryData }
  | { type: "attack"; data: AttackData };
