// Shared types for all parsers

export type IntelType = "sot" | "survey" | "som" | "sos" | "sod" | "kingdom";

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
  hitStatus: string;
  war: boolean;
  accuracy: number;
}

export interface SurveyBuilding {
  building: string;
  built: number;
  inProgress: number;
}

export interface SurveyData extends ProvinceId {
  buildings: SurveyBuilding[];
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
  name: string;
  race: string;
  land: number;
  networth: number;
  honorTitle: string;
}

export interface KingdomData {
  name: string;
  location: string; // e.g. "4:5"
  warTarget: string | null;
  provinces: KingdomProvince[];
}

export interface SoDData extends ProvinceId {
  defPoints: number;
  accuracy: number;
}

export type ParseResult =
  | { type: "sot"; data: SoTData }
  | { type: "survey"; data: SurveyData }
  | { type: "som"; data: SoMData }
  | { type: "sos"; data: SoSData }
  | { type: "sod"; data: SoDData }
  | { type: "kingdom"; data: KingdomData };
