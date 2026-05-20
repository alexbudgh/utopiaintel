import type { KingdomOpenRelation, WarDoctrine } from "./parsers/types";

export interface KingdomRow {
  location: string;
  province_count: number;
  last_seen: string | null;
}

export interface KingdomSnapshotProvince {
  slot: number | null;
  name: string;
  race: string;
  land: number;
  networth: number;
  honorTitle: string | null;
}

export interface KingdomSnapshot {
  id: number;
  name: string;
  location: string;
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
  receivedAt: string;
  provinces: KingdomSnapshotProvince[];
}

export interface KingdomSnapshotHistoryPoint {
  id: number;
  name: string;
  location: string;
  kingdomTitle: string | null;
  totalNetworth: number | null;
  totalLand: number | null;
  totalHonor: number | null;
  warsWon: number | null;
  warLosses: number | null;
  networthRank: number | null;
  landRank: number | null;
  honorRank: number | null;
  receivedAt: string;
}

export interface RecentOp {
  op_type: string;
  op_category: string;
  received_at: string;
  saved_by: string | null;
  province_name: string;
  kingdom: string;
  actor_name: string | null;
  actor_kingdom: string | null;
  outcome: string | null;
  summary: string | null;
  detail_value: number | null;
  detail_kind: string | null;
  slot: number | null;
  submitter_slot: number | null;
}

export interface ProvinceRow {
  id: number;
  slot: number | null;
  name: string;
  kingdom: string;
  race: string | null;
  personality: string | null;
  honor_title: string | null;
  land: number | null;
  networth: number | null;
  overview_age: string | null;
  overview_source: string | null;
  off_points: number | null;
  def_points: number | null;
  military_age: string | null;
  military_source: string | null;
  soldiers: number | null;
  off_specs: number | null;
  def_specs: number | null;
  elites: number | null;
  war_horses: number | null;
  peasants: number | null;
  troops_age: string | null;
  troops_source: string | null;
  soldiers_home: number | null;
  off_specs_home: number | null;
  def_specs_home: number | null;
  elites_home: number | null;
  troops_home_age: string | null;
  off_home: number | null;
  def_home: number | null;
  home_mil_age: string | null;
  home_mil_source: string | null;
  money: number | null;
  food: number | null;
  runes: number | null;
  prisoners: number | null;
  trade_balance: number | null;
  building_efficiency: number | null;
  thieves: number | null;
  thieves_age: string | null;
  stealth: number | null;
  wizards: number | null;
  mana: number | null;
  total_pop: number | null;
  max_pop: number | null;
  resources_age: string | null;
  resources_source: string | null;
  free_specialist_credits: number | null;
  free_specialist_credits_age: string | null;
  free_building_credits: number | null;
  free_building_credits_age: string | null;
  hit_status: string | null;
  status_age: string | null;
  effects_age?: string | null;
  good_spell_details?: string | null;
  bad_spell_details?: string | null;
  good_spell_count?: number | null;
  bad_spell_count?: number | null;
  ome: number | null;
  dme: number | null;
  som_age: string | null;
  throne_age: string | null;
  sciences_age: string | null;
  crime_effect: number | null;
  channeling_effect: number | null;
  siege_effect: number | null;
  shielding_effect: number | null;
  science_total_books: number | null;
  survey_age: string | null;
  watch_towers_effect: number | null;
  thieves_dens_effect: number | null;
  castles_effect: number | null;
  housing_effect: number | null;
  barren_land: number | null;
  homes_built: number | null;
  guilds_built: number | null;
  buildings_built: number | null;
  buildings_in_progress: number | null;
  armies_out_count: number | null;
  land_incoming: number | null;
  earliest_return: number | null;
  som_armies_json: string | null;
  throne_armies_json: string | null;
  armies_out_json: string | null;
  cached_ppa?: number | null;
  cached_ppa_age?: string | null;
  cached_rtpa?: number | null;
  cached_rtpa_age?: string | null;
  cached_mtpa?: number | null;
  cached_mtpa_age?: string | null;
  cached_otpa?: number | null;
  cached_otpa_age?: string | null;
  cached_dtpa?: number | null;
  cached_dtpa_age?: string | null;
  cached_rwpa?: number | null;
  cached_rwpa_age?: string | null;
  cached_mwpa?: number | null;
  cached_mwpa_age?: string | null;
}

export interface ArmyRow {
  armyType: string;
  generals: number | null;
  soldiers: number | null;
  offSpecs: number | null;
  defSpecs: number | null;
  elites: number | null;
  warHorses: number | null;
  thieves: number | null;
  landGained: number | null;
  returnDays: number | null;
}

export interface BuildingRow {
  building: string;
  built: number;
  inProgress: number;
}

export interface ScienceRow {
  science: string;
  books: number;
  effect: number;
}

export interface ProvinceDetail {
  province: {
    id: number;
    name: string;
    kingdom: string;
    slot: number | null;
  } | null;
  overview: {
    race: string | null;
    personality: string | null;
    honorTitle: string | null;
    ruler: string | null;
    land: number | null;
    networth: number | null;
    source: string;
    savedBy: string | null;
    receivedAt: string;
  } | null;
  totalMilitary: {
    offPoints: number | null;
    defPoints: number | null;
    source: string;
    receivedAt: string;
  } | null;
  homeMilitary: {
    modOffAtHome: number | null;
    modDefAtHome: number | null;
    source: string;
    receivedAt: string;
  } | null;
  sot: {
    soldiers: number | null;
    offSpecs: number | null;
    defSpecs: number | null;
    elites: number | null;
    warHorses: number | null;
    peasants: number | null;
    source: string;
    receivedAt: string;
  } | null;
  resources: {
    money: number | null;
    food: number | null;
    runes: number | null;
    prisoners: number | null;
    tradeBalance: number | null;
    buildingEfficiency: number | null;
    thieves: number | null;
    thievesAge: string | null;
    stealth: number | null;
    wizards: number | null;
    mana: number | null;
    totalPop: number | null;
    maxPop: number | null;
    freeSpecialistCredits: number | null;
    freeSpecialistCreditsAge: string | null;
    freeBuildingCredits: number | null;
    freeBuildingCreditsAge: string | null;
    receivedAt: string;
  } | null;
  status: {
    plagued: boolean;
    overpopulated: boolean;
    overpopDeserters: number | null;
    dragonType: string | null;
    dragonName: string | null;
    hitStatus: string | null;
    war: boolean;
    receivedAt: string;
  } | null;
  effects: {
    name: string;
    kind: string;
    durationText: string | null;
    remainingTicks: number | null;
    effectivenessPercent: number | null;
    receivedAt: string;
  }[];
  militaryIntel: {
    ome: number | null;
    dme: number | null;
    receivedAt: string;
    armies: ArmyRow[];
  } | null;
  survey: { receivedAt: string; buildings: BuildingRow[] } | null;
  sciences: { receivedAt: string; sciences: ScienceRow[] } | null;
}

export interface KingdomRitual {
  name: string;
  remainingTicks: number | null;
  effectivenessPercent: number | null;
  receivedAt: string;
}

export interface KingdomDragon {
  dragonType: string;
  dragonName: string;
  receivedAt: string;
}

export interface KingdomNewsRow {
  id: number;
  kingdom: string;
  gameDate: string;
  eventType: string;
  rawText: string;
  attackerName: string | null;
  attackerKingdom: string | null;
  defenderName: string | null;
  defenderKingdom: string | null;
  acres: number | null;
  books: number | null;
  senderName: string | null;
  receiverName: string | null;
  relationKingdom: string | null;
  dragonType: string | null;
  dragonName: string | null;
  receivedAt: string;
}

export interface HistoryEventMarker {
  id: string;
  label: string;
  at: string;
  date: string | null;
  direction?: "in" | "out" | null;
  kingdom?: string | null;
  dragonType?: string | null;
  dragonName?: string | null;
}

export interface NewsProvinceSummary {
  provinceName: string | null;
  slot: number | null;
  hitsMade: number;
  marchMade: number;
  ambushMade: number;
  razeMade: number;
  plunderMade: number;
  learnMade: number;
  failedMade: number;
  marchAcresGained: number;
  ambushAcresGained: number;
  razeAcresDealt: number;
  booksLearned: number;
  hitsTaken: number;
  marchTaken: number;
  ambushTaken: number;
  razeTaken: number;
  plunderTaken: number;
  learnTaken: number;
  failedTaken: number;
  marchAcresLost: number;
  ambushAcresLost: number;
  razeAcresLost: number;
}

export interface NewsKingdomSummary {
  kingdom: string;
  kingdomName: string | null;
  provinces: NewsProvinceSummary[];
  totalHitsMade: number;
  totalMarchMade: number;
  totalAmbushMade: number;
  totalRazeMade: number;
  totalPlunderMade: number;
  totalLearnMade: number;
  totalFailedMade: number;
  totalMarchAcresGained: number;
  totalAmbushAcresGained: number;
  totalRazeAcresDealt: number;
  totalHitsTaken: number;
  totalMarchTaken: number;
  totalAmbushTaken: number;
  totalRazeTaken: number;
  totalPlunderTaken: number;
  totalLearnTaken: number;
  totalFailedTaken: number;
  totalMarchAcresLost: number;
  totalAmbushAcresLost: number;
  totalRazeAcresLost: number;
}

export interface KingdomNewsSummary {
  ourKingdom: string;
  totalMarchAcresIn: number;
  totalRazeAcresIn: number;
  totalMarchAcresOut: number;
  totalRazeAcresOut: number;
  uniqueAttackers: number;
  byKingdom: NewsKingdomSummary[];
}

export interface ProvinceNewsRow {
  id: number;
  gameDate: string;
  gameDateOrd: number | null;
  eventType: string;
  rawText: string;
  actorName: string | null;
  actorKingdom: string | null;
  amount: number | null;
  resourceType: string | null;
  receivedAt: string;
}

export interface OpProvEntry {
  provinceName: string;
  slot: number | null;
  attempts: number;
  successes: number;
  amount: number;
  unitType: string | null;
  thievesLost: number;
}

export interface OpTypeBreakdown {
  op: string;
  outgoing: OpProvEntry[];
  incoming: OpProvEntry[];
}

export interface KingdomOpsStats {
  breakdowns: OpTypeBreakdown[];
  effectiveFrom: string | null;
}

export interface IncomingProvinceEvent {
  eventType: string;
  resourceType: string | null;
  count: number;
  totalAmount: number;
}

export interface IncomingDamageProvinceStat {
  provinceName: string;
  totalImpact: number;
  events: IncomingProvinceEvent[];
}

export interface IncomingDamageStats {
  provinces: IncomingDamageProvinceStat[];
  effectiveFrom: string | null;
}

export interface ProvinceHistoryPoint {
  receivedAt: string;
  networth: number | null;
  land: number | null;
  peasants: number | null;
  soldiers: number | null;
  offSpecs: number | null;
  defSpecs: number | null;
  elites: number | null;
  warHorses: number | null;
  offPoints: number | null;
  defPoints: number | null;
  money: number | null;
  food: number | null;
  runes: number | null;
  thieves: number | null;
  wizards: number | null;
  attacksTaken: ProvinceHistoryAttack[];
  thieveryOpsTaken: ProvinceHistoryThieveryOp[];
  sorceryOpsTaken: ProvinceHistorySorceryOp[];
  meta: Partial<Record<string, { sources: string[]; savedBy: string[] }>>;
}

export interface ProvinceHistoryAttack {
  receivedAt: string;
  attackType: string;
  attackerName: string;
  attackerKingdom: string;
  acresTaken: number | null;
  killed: number | null;
  imprisoned: number | null;
  massacred: number | null;
}

export interface ProvinceHistoryThieveryOp {
  receivedAt: string;
  op: string;
  outcome: "success" | "failure";
  amountStolen: number | null;
  thievesLost: number;
  attackerName: string;
  attackerKingdom: string;
  troopsAssassinated: number | null;
  kidnapped: number | null;
  acresBurned: number | null;
  effectDuration: number | null;
}

export interface ProvinceHistorySorceryOp {
  receivedAt: string;
  spell: string;
  outcome: "success" | "failure";
  durationDays: number | null;
  wizardsLost: number;
  casterName: string;
  casterKingdom: string;
}
