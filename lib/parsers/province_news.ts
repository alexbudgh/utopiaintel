import { INT, KDLOC, GAME_DATE_RE, parseNum } from "./util";

export type ProvinceNewsEventType =
  // Combat
  | "attack_trad_march"
  | "attack_conquest"
  | "attack_razed"
  | "attack_massacre"
  | "attack_loot"
  | "attack_plunder"
  | "attack_ambush"
  | "attack_failed"
  // Thievery
  | "thief_detected"
  | "thief_detected_unknown"
  | "thief_foiled"
  | "thief_foiled_shadowlight"
  | "thief_propaganda"
  | "arson"
  | "resource_stolen"
  | "troops_killed"
  | "peasants_kidnapped"
  | "desertions"
  | "rioting"
  | "turncoat_general"
  | "turncoat_thieves"
  | "thief_sabotage_wizards"
  // Sorcery
  | "spell_detected"
  | "spell_fireball"
  | "spell_lightning"
  | "spell_meteor_start"
  | "spell_meteor"
  | "spell_blizzard"
  | "spell_gluttony"
  | "spell_greed"
  | "spell_explosions"
  | "spell_tornado"
  | "spell_land_lust"
  | "spell_mystic_vortex"
  | "spell_drought"
  | "spell_pitfalls"
  | "spell_chastity"
  | "spell_nightmares"
  | "spell_animate_dead"
  | "spell_vermin"
  | "spell_storms"
  | "spell_expose_thieves"
  | "spell_fools_gold"
  // Dragon
  | "dragon_damage"
  // Aid
  | "aid_received"
  // Misc
  | "exploration"
  | "monthly_dedication"
  | "war_ended"
  | "war_loss_penalty"
  | "war_victory_reward"
  | "starvation"
  | "ritual_shortened"
  | "plague_ended"
  | "utopian_lords_reward"
  | "new_scientist"
  | "inactivity_penalty"
  | "other";

export interface ProvinceNewsEvent {
  gameDate: string;
  eventType: ProvinceNewsEventType;
  rawText: string;
  actorName: string | null;
  actorKingdom: string | null;
  acres: number | null;
  amount: number | null;
  resourceType: string | null;
}

export interface ProvinceNewsData {
  events: ProvinceNewsEvent[];
}

const nil: Pick<ProvinceNewsEvent, "actorName" | "actorKingdom" | "acres" | "amount" | "resourceType"> =
  { actorName: null, actorKingdom: null, acres: null, amount: null, resourceType: null };

function normUnit(raw: string): string {
  const lower = raw.toLowerCase();
  if (lower === "thieves" || lower === "thieve") return "Thief";
  const singular = raw.length > 2 && raw.endsWith("s") ? raw.slice(0, -1) : raw;
  return singular.charAt(0).toUpperCase() + singular.slice(1);
}

// ── Combat ────────────────────────────────────────────────────────────────────

// Optional prefixes that can precede the "Forces from" line
const ATTACK_PREFIX = `(?:(?:Enemy forces|Multiple enemy generals)[^.]+\\.\\s+)?`;

// "Forces from N - Name (X:Y) came through and ravaged our lands! They captured N acres!" (standard march)
const ATTACK_CAPTURED_RE = new RegExp(
  `^${ATTACK_PREFIX}Forces from \\d+ - ([^(]+?)\\s*${KDLOC} came through and ravaged our lands! They captured (${INT}) acres`,
);
// "Forces from N - Name (X:Y) came through... They were able to capture N acres before we could turn them away!" (conquest)
const ATTACK_CONQUEST_RE = new RegExp(
  `^${ATTACK_PREFIX}Forces from \\d+ - ([^(]+?)\\s*${KDLOC} came through and ravaged our lands! They were able to capture (${INT}) acres`,
);
// Unknown-province variants
const ATTACK_CAPTURED_UNKNOWN_RE = new RegExp(
  `^${ATTACK_PREFIX}Forces from An unknown province from ([^(]+?)\\s*${KDLOC} came through and ravaged our lands! They captured (${INT}) acres`,
);
const ATTACK_CONQUEST_UNKNOWN_RE = new RegExp(
  `^${ATTACK_PREFIX}Forces from An unknown province from ([^(]+?)\\s*${KDLOC} came through and ravaged our lands! They were able to capture (${INT}) acres`,
);
// "Forces from N - Name (X:Y) came through and ravaged our lands! They looted N books!" (Learn/Loot)
const ATTACK_LOOT_RE = new RegExp(
  `^${ATTACK_PREFIX}Forces from \\d+ - ([^(]+?)\\s*${KDLOC} came through and ravaged our lands! They looted (${INT}) books`,
);
// "Forces from N - Name (X:Y) came through and ravaged our lands! They looted N gold coins..." (Plunder)
const ATTACK_PLUNDER_RE = new RegExp(
  `^${ATTACK_PREFIX}Forces from \\d+ - ([^(]+?)\\s*${KDLOC} came through and ravaged our lands! They looted (${INT}) gold`,
);
// "Forces from N - Name (X:Y) came through and ravaged our lands! Their armies razed N acres of buildings!"
const ATTACK_RAZED_RE = new RegExp(
  `^${ATTACK_PREFIX}Forces from \\d+ - ([^(]+?)\\s*${KDLOC} came through and ravaged our lands! Their armies razed (${INT}) acres of buildings!`,
);
// "Forces from N - Name (X:Y) attempted to attack us, but failed miserably!"
const ATTACK_FAILED_RE = new RegExp(
  `^Forces from \\d+ - ([^(]+?)\\s*${KDLOC} attempted to attack us`,
);
// "Forces from N - Name (X:Y) came through... Their armies killed N of our..." (Massacre)
const ATTACK_MASSACRE_RE = new RegExp(
  `^${ATTACK_PREFIX}Forces from \\d+ - ([^(]+?)\\s*${KDLOC} came through and ravaged our lands! Their armies killed`,
);
// "Forces from N - Name (X:Y) ambushed one of our armies. They recaptured N acres from our army!" (Ambush)
const ATTACK_AMBUSH_RE = new RegExp(
  `^Forces from \\d+ - ([^(]+?)\\s*${KDLOC} ambushed one of our armies. They recaptured (${INT}) acres`,
);

// ── Thievery ──────────────────────────────────────────────────────────────────

// "We have found thieves from Name (X:Y) causing trouble within our lands!"
const THIEF_DETECTED_RE = new RegExp(
  `^We have found thieves from ([^(]+?)\\s*${KDLOC} causing trouble`,
);
const THIEF_UNKNOWN_RE = /^We have found thieves causing trouble within our lands\. Unfortunately/;

// "Shadowlight has revealed thieves from Name (X:Y) causing trouble and prevented..."
const SHADOWLIGHT_FOILED_RE = new RegExp(
  `^Shadowlight has revealed thieves from ([^(]+?)\\s*${KDLOC} causing trouble`,
);
// "Thieves attempted to assassinate our troops, but failed." etc.
const THIEF_FOILED_RE = /^Thieves attempted to /;

// "Name (province) descends in flames! N buildings are reduced to ash and rubble."
// (Arson thievery — province name is the attacker, no (X:Y) in this event format)
const ARSON_RE = new RegExp(`^(.+?) descends in flames! (${INT}) buildings are reduced to ash and rubble\\.`);

// N gold/runes/food/horses stolen (thief op outcomes, no actor visible in province news)
// "N gold coins were stolen from our coffers!" (Rob the Vaults thievery)
const GOLD_STOLEN_RE  = new RegExp(`^(${INT}) gold coins? were stolen from our coffers`);
// "N gold coins have been turned into worthless lead." (Fool's Gold spell)
const FOOLS_GOLD_RE   = new RegExp(`^(${INT}) gold coins? have been turned into worthless lead`);
const RUNES_STOLEN_RE = new RegExp(`^(${INT}) runes of our runes were stolen`);
const FOOD_STOLEN_RE  = new RegExp(`^(${INT}) bushels were stolen from our granaries`);
const HORSES_STOLEN_RE = new RegExp(`^(${INT}) horses have been stolen`);

// "N of our troops were found dead today!" (Night Strike)
const TROOPS_KILLED_RE = new RegExp(`^(${INT}) of our troops were found dead today`);
// "N peasants were kidnapped!" (Kidnap)
const KIDNAPPED_RE = new RegExp(`^(${INT}) peasants? (?:were|was) kidnapped`);
// "N men deserted our military due to housing shortages!" (Bribe Generals trigger — overpopulation)
const DESERTIONS_RE = new RegExp(`^(${INT}) men deserted our military due to housing shortages`);
// "Rioting has started amongst our people. Our tax collection efforts will be hampered for N days!" (Incite Riots)
const RIOTING_RE = /^Rioting has started amongst our people/;
// "We have discovered a turncoat general leading our military. He has been executed for treason!"
const TURNCOAT_GENERAL_RE = /^We have discovered a turncoat general/;
// "We have discovered turncoats amongst our thieves' guild."
const TURNCOAT_THIEVES_RE = /^We have discovered turncoats amongst our thieves/;
// "Many of our thieves have been exposed by magic! This will result in slower recovery for N days." (Expose Thieves spell)
const THIEVES_EXPOSED_RE = /^Many of our thieves have been exposed by magic/;
// "N wizards of our wizards abandoned us hoping for a better life!" (Propaganda thievery — may also affect other unit types)
const PROPAGANDA_RE = new RegExp(`^(${INT}) (\\w+) of our \\w+ abandoned us hoping for a better life`);

// ── Sorcery ───────────────────────────────────────────────────────────────────

// "Our mages noticed a possible spell attempt by Name (X:Y) causing trouble on our lands!"
const SPELL_DETECTED_RE = new RegExp(
  `^Our mages noticed a possible spell attempt by ([^(]+?)\\s*${KDLOC} causing trouble`,
);
// Fireball: "A massive fireball crashed into our lands and killed N peasants!"
const FIREBALL_RE = new RegExp(`^A massive fireball crashed into our lands and killed (${INT}) peasants`);
// Lightning Strike: "A sudden lightning storm struck our towers and destroyed N runes!"
const LIGHTNING_RE = new RegExp(`^A sudden lightning storm struck our towers and destroyed (${INT}) runes`);
// Meteor Showers arrival: "Meteors rain across our lands, and are not expected to stop for N days."
const METEOR_START_RE = new RegExp(`^Meteors rain across our lands, and are not expected to stop for (${INT}) days`);
// Meteor Showers tick: "Meteors rain across the lands and kill N peasants/soldiers..."
const METEOR_STRIKE_RE = new RegExp(`^Meteors rain across the lands and kill (${INT})`);
// Blizzard: "Blizzards are besetting our works, and our building efficiency will be crippled by 10% for for N days!"
const BLIZZARD_RE = new RegExp(`^Blizzards are besetting our works.*for for (${INT}) days`);
// Gluttony: "A fit of gluttony has descended upon our people, and they will not be sated for N days."
const GLUTTONY_RE = new RegExp(`^A fit of gluttony has descended upon our people.*for (${INT}) days`);
// Greed: "Enemies have convinced our soldiers to demand more money for upkeep for N days."
const GREED_RE = new RegExp(`^Enemies have convinced our soldiers to demand more money for upkeep for (${INT}) days`);
// Explosions: "Explosions are hampering aid shipments from other provinces for N days."
const EXPLOSIONS_RE = new RegExp(`^Explosions are hampering aid shipments.*for (${INT}) days`);
// Tornadoes: "Tornadoes scour the lands, causing the destruction of N acres of buildings!"
const TORNADO_RE = new RegExp(`^Tornadoes scour the lands, causing the destruction of (${INT}) acres`);
const TORNADO_NODMG_RE = /^Tornadoes scour the lands, but destroy no buildings/;
// Land Lust: "N acres of land have disappeared from our control!"
const LAND_LUST_RE = new RegExp(`^(${INT}) acres? of land have disappeared from our control`);
// Mystic Vortex: "A magic vortex encircled our lands, and rendered N of our spells (...) inactive!"
const MYSTIC_VORTEX_RE = /^A magic vortex encircled our lands/;
// Drought: "Droughts are reducing our daily harvests and slowing our soldier draft! This will last for N days."
const DROUGHT_RE = new RegExp(`^Droughts are reducing our daily harvests.*for (${INT}) days`);
// Pitfalls: "Pitfalls are haunting our lands for N days, causing increased defensive losses during battle."
const PITFALLS_RE = new RegExp(`^Pitfalls are haunting our lands for (${INT}) days`);
// Chastity: "The womenfolk's vow of chastity is reducing our population growth for N days!"
const CHASTITY_RE = new RegExp(`^The womenfolk.s vow of chastity is reducing our population growth for (${INT}) days`);
// Also: "Your peasants become unmotivated and less willing to join the army for N days"
const CHASTITY2_RE = new RegExp(`^Your peasants become unmotivated and less willing to join the army for (${INT}) days`);
// Nightmares: "This morning, N of our men from our armies and thieves' guild turned up unfit."
const NIGHTMARES_RE = new RegExp(`^This morning, (${INT}) of our men from our armies`);
// Animate Dead / Soul Blight / similar "dark magic converts peasants to undead" spells
const ANIMATE_DEAD_RE = new RegExp(`^(?:Dark magic consumed|The curse of Soul Blight claimed|The land was cursed,) (${INT}) peasants`);
// "Our Wizards' ability to regain their mana has been disrupted! Our mana recovery will be affected for N days!" (Sabotage Wizards thievery)
const SABOTAGE_WIZARDS_RE = new RegExp(`^Our Wizards. ability to regain their mana has been disrupted.*for (${INT}) days`);
// Vermin: "Vermin have been discovered eating away our food supplies and could not be exterminated before they devoured N bushels!"
const VERMIN_RE = new RegExp(`^Vermin have been discovered.*devoured (${INT}) bushels`);
// Storms
const STORMS_RE = /^Storms are ravaging our lands/;

// ── Dragon ────────────────────────────────────────────────────────────────────

// "[DragonName] ravages our troops! N soldiers slain." or "[Name] strikes! N soldiers at home fall to tooth and claw."
const DRAGON_DAMAGE_RE = new RegExp(`^(.+?) (?:ravages our troops!|strikes!) (${INT}) soldiers`);
const DRAGON_DAMAGE_CLAW_RE = /^strikes! \d+ soldiers at home fall to tooth and claw/;

// ── Aid ───────────────────────────────────────────────────────────────────────

// "We have received a shipment of N resource from Name (X:Y)."
const AID_RECEIVED_RE = new RegExp(
  `^We have received a shipment of (.+?) from ([^(]+?)\\s*${KDLOC}`,
);

function parseAidResource(text: string): { amount: number; resourceType: string } | null {
  const goldM = /^([\d,]+) gold/.exec(text);
  if (goldM) return { amount: parseNum(goldM[1]), resourceType: "gold" };
  const bushM = /^([\d,]+) bushels?/.exec(text);
  if (bushM) return { amount: parseNum(bushM[1]), resourceType: "food" };
  const runeM = /^([\d,]+) runes?/.exec(text);
  if (runeM) return { amount: parseNum(runeM[1]), resourceType: "runes" };
  const soldM = /^([\d,]+) soldiers?/.exec(text);
  if (soldM) return { amount: parseNum(soldM[1]), resourceType: "soldiers" };
  const horsM = /^([\d,]+) horses?/.exec(text);
  if (horsM) return { amount: parseNum(horsM[1]), resourceType: "horses" };
  return null;
}

// ── Misc ──────────────────────────────────────────────────────────────────────

// "Our people decided to explore new territories and have settled N acres of new land."
const EXPLORATION_RE = new RegExp(`^Our people decided to explore.*settled (${INT}) acres`);
// "Your people appreciate the ... dedication ... generate N gold coins. ... contributing N books ..."
const MONTHLY_DEDICATION_RE = new RegExp(`^Your people appreciate the .+ dedication.*generate (${INT}) gold coins`);
// "Alas, our war has ended! N acres were instantly returned to us from our marching armies!!"
const WAR_ENDED_RE = new RegExp(`^Alas, our war has ended! (${INT}) acres were instantly returned`);
// "My, Liege, as a result of our failed war we must give up some land..."
const WAR_LOSS_RE = /^My, Liege, as a result of our failed war/;
// "My, Liege, as a result of our war we have been provided an amalgam of resources."
const WAR_VICTORY_RE = /^My, Liege, as a result of our war we have been provided/;
// "Our people are starving! We have lost N peasants..."
const STARVATION_RE = /^Our people are starving!/;
// "Our ritual lifespan has been shortened!"
const RITUAL_SHORTENED_RE = /^Our ritual lifespan has been shortened/;
// "The plague has finally been swept away from our lands!"
const PLAGUE_ENDED_RE = /^The plague has finally been swept away/;
// "The Utopian Lords have bestowed upon us N [resource] for recruiting new leaders..."
const UTOPIAN_LORDS_RE = new RegExp(`^The Utopian Lords have bestowed upon us (${INT}) (.+?) for recruiting`);
// "A new scientist, Recruit Name (Specialty), has emerged and has joined our academic ranks."
const NEW_SCIENTIST_RE = /^A new scientist, /;
// "Due to your lackluster activity, only checking in on us N days..."
const INACTIVITY_RE = /^Due to your lackluster activity/;
// "N wizards of our wizards abandoned us hoping for a better life!"
// (already declared above)

function classifyEvent(text: string): Omit<ProvinceNewsEvent, "gameDate" | "rawText"> {
  let m: RegExpExecArray | null;

  // ── Combat ──
  m = ATTACK_CAPTURED_UNKNOWN_RE.exec(text);
  if (m) return { eventType: "attack_trad_march", actorName: null, actorKingdom: m[2], acres: parseNum(m[3]), amount: null, resourceType: null };

  m = ATTACK_CONQUEST_UNKNOWN_RE.exec(text);
  if (m) return { eventType: "attack_conquest", actorName: null, actorKingdom: m[2], acres: parseNum(m[3]), amount: null, resourceType: null };

  m = ATTACK_CAPTURED_RE.exec(text);
  if (m) return { eventType: "attack_trad_march", actorName: m[1].trim(), actorKingdom: m[2], acres: parseNum(m[3]), amount: null, resourceType: null };

  m = ATTACK_CONQUEST_RE.exec(text);
  if (m) return { eventType: "attack_conquest", actorName: m[1].trim(), actorKingdom: m[2], acres: parseNum(m[3]), amount: null, resourceType: null };

  m = ATTACK_LOOT_RE.exec(text);
  if (m) return { eventType: "attack_loot", actorName: m[1].trim(), actorKingdom: m[2], acres: null, amount: parseNum(m[3]), resourceType: "books" };

  m = ATTACK_PLUNDER_RE.exec(text);
  if (m) return { eventType: "attack_plunder", actorName: m[1].trim(), actorKingdom: m[2], acres: null, amount: parseNum(m[3]), resourceType: "gold" };

  m = ATTACK_RAZED_RE.exec(text);
  if (m) return { eventType: "attack_razed", actorName: m[1].trim(), actorKingdom: m[2], acres: parseNum(m[3]), amount: null, resourceType: null };

  m = ATTACK_AMBUSH_RE.exec(text);
  if (m) return { eventType: "attack_ambush", actorName: m[1].trim(), actorKingdom: m[2], acres: parseNum(m[3]), amount: null, resourceType: null };

  m = ATTACK_FAILED_RE.exec(text);
  if (m) return { eventType: "attack_failed", actorName: m[1].trim(), actorKingdom: m[2], acres: null, amount: null, resourceType: null };

  m = ATTACK_MASSACRE_RE.exec(text);
  if (m) return { eventType: "attack_massacre", actorName: m[1].trim(), actorKingdom: m[2], acres: null, amount: null, resourceType: null };

  // ── Thievery ──
  m = SHADOWLIGHT_FOILED_RE.exec(text);
  if (m) return { eventType: "thief_foiled_shadowlight", actorName: m[1].trim(), actorKingdom: m[2], acres: null, amount: null, resourceType: null };

  m = THIEF_DETECTED_RE.exec(text);
  if (m) return { eventType: "thief_detected", actorName: m[1].trim(), actorKingdom: m[2], acres: null, amount: null, resourceType: null };

  if (THIEF_UNKNOWN_RE.test(text)) return { ...nil, eventType: "thief_detected_unknown" };
  if (THIEF_FOILED_RE.test(text)) return { ...nil, eventType: "thief_foiled" };

  m = ARSON_RE.exec(text);
  if (m) return { eventType: "arson", actorName: m[1].trim(), actorKingdom: null, acres: parseNum(m[2]), amount: null, resourceType: null };

  m = FOOLS_GOLD_RE.exec(text);
  if (m) return { ...nil, eventType: "spell_fools_gold", amount: parseNum(m[1]), resourceType: "gold" };

  m = GOLD_STOLEN_RE.exec(text);
  if (m) return { ...nil, eventType: "resource_stolen", amount: parseNum(m[1]), resourceType: "gold" };

  m = RUNES_STOLEN_RE.exec(text);
  if (m) return { ...nil, eventType: "resource_stolen", amount: parseNum(m[1]), resourceType: "runes" };

  m = FOOD_STOLEN_RE.exec(text);
  if (m) return { ...nil, eventType: "resource_stolen", amount: parseNum(m[1]), resourceType: "food" };

  m = HORSES_STOLEN_RE.exec(text);
  if (m) return { ...nil, eventType: "resource_stolen", amount: parseNum(m[1]), resourceType: "horses" };

  m = TROOPS_KILLED_RE.exec(text);
  if (m) return { ...nil, eventType: "troops_killed", amount: parseNum(m[1]) };

  m = KIDNAPPED_RE.exec(text);
  if (m) return { ...nil, eventType: "peasants_kidnapped", amount: parseNum(m[1]) };

  m = DESERTIONS_RE.exec(text);
  if (m) return { ...nil, eventType: "desertions", amount: parseNum(m[1]) };

  if (RIOTING_RE.test(text)) return { ...nil, eventType: "rioting" };
  if (TURNCOAT_GENERAL_RE.test(text)) return { ...nil, eventType: "turncoat_general" };
  if (TURNCOAT_THIEVES_RE.test(text)) return { ...nil, eventType: "turncoat_thieves" };
  if (THIEVES_EXPOSED_RE.test(text)) return { ...nil, eventType: "spell_expose_thieves" };

  m = PROPAGANDA_RE.exec(text);
  if (m) return { ...nil, eventType: "thief_propaganda", amount: parseNum(m[1]), resourceType: normUnit(m[2]) };

  // ── Sorcery ──
  m = SPELL_DETECTED_RE.exec(text);
  if (m) return { eventType: "spell_detected", actorName: m[1].trim(), actorKingdom: m[2], acres: null, amount: null, resourceType: null };

  m = FIREBALL_RE.exec(text);
  if (m) return { ...nil, eventType: "spell_fireball", amount: parseNum(m[1]) };

  m = LIGHTNING_RE.exec(text);
  if (m) return { ...nil, eventType: "spell_lightning", amount: parseNum(m[1]), resourceType: "runes" };

  m = METEOR_START_RE.exec(text);
  if (m) return { ...nil, eventType: "spell_meteor_start", amount: parseNum(m[1]) };

  m = METEOR_STRIKE_RE.exec(text);
  if (m) return { ...nil, eventType: "spell_meteor", amount: parseNum(m[1]) };

  m = BLIZZARD_RE.exec(text);
  if (m) return { ...nil, eventType: "spell_blizzard", amount: parseNum(m[1]) };

  m = GLUTTONY_RE.exec(text);
  if (m) return { ...nil, eventType: "spell_gluttony", amount: parseNum(m[1]) };

  m = GREED_RE.exec(text);
  if (m) return { ...nil, eventType: "spell_greed", amount: parseNum(m[1]) };

  m = EXPLOSIONS_RE.exec(text);
  if (m) return { ...nil, eventType: "spell_explosions", amount: parseNum(m[1]) };

  m = TORNADO_RE.exec(text);
  if (m) return { ...nil, eventType: "spell_tornado", acres: parseNum(m[1]) };

  if (TORNADO_NODMG_RE.test(text)) return { ...nil, eventType: "spell_tornado" };

  m = LAND_LUST_RE.exec(text);
  if (m) return { ...nil, eventType: "spell_land_lust", acres: parseNum(m[1]) };

  if (MYSTIC_VORTEX_RE.test(text)) return { ...nil, eventType: "spell_mystic_vortex" };

  m = DROUGHT_RE.exec(text);
  if (m) return { ...nil, eventType: "spell_drought", amount: parseNum(m[1]) };

  m = PITFALLS_RE.exec(text);
  if (m) return { ...nil, eventType: "spell_pitfalls", amount: parseNum(m[1]) };

  m = CHASTITY_RE.exec(text);
  if (m) return { ...nil, eventType: "spell_chastity", amount: parseNum(m[1]) };

  m = CHASTITY2_RE.exec(text);
  if (m) return { ...nil, eventType: "spell_chastity", amount: parseNum(m[1]) };

  m = NIGHTMARES_RE.exec(text);
  if (m) return { ...nil, eventType: "spell_nightmares", amount: parseNum(m[1]) };

  m = ANIMATE_DEAD_RE.exec(text);
  if (m) return { ...nil, eventType: "spell_animate_dead", amount: parseNum(m[1]) };

  m = SABOTAGE_WIZARDS_RE.exec(text);
  if (m) return { ...nil, eventType: "thief_sabotage_wizards", amount: parseNum(m[1]) };

  m = VERMIN_RE.exec(text);
  if (m) return { ...nil, eventType: "spell_vermin", amount: parseNum(m[1]), resourceType: "food" };

  if (STORMS_RE.test(text)) return { ...nil, eventType: "spell_storms" };

  // ── Dragon ──
  if (DRAGON_DAMAGE_CLAW_RE.test(text)) return { ...nil, eventType: "dragon_damage" };
  m = DRAGON_DAMAGE_RE.exec(text);
  if (m) return { eventType: "dragon_damage", actorName: m[1].trim(), actorKingdom: null, acres: null, amount: parseNum(m[2]), resourceType: null };

  // ── Aid ──
  m = AID_RECEIVED_RE.exec(text);
  if (m) {
    const parsed = parseAidResource(m[1].trim());
    return { eventType: "aid_received", actorName: m[2].trim(), actorKingdom: m[3], acres: null, amount: parsed?.amount ?? null, resourceType: parsed?.resourceType ?? null };
  }

  // ── Misc ──
  m = EXPLORATION_RE.exec(text);
  if (m) return { ...nil, eventType: "exploration", acres: parseNum(m[1]) };

  m = MONTHLY_DEDICATION_RE.exec(text);
  if (m) return { ...nil, eventType: "monthly_dedication", amount: parseNum(m[1]), resourceType: "gold" };

  m = WAR_ENDED_RE.exec(text);
  if (m) return { ...nil, eventType: "war_ended", acres: parseNum(m[1]) };

  if (WAR_LOSS_RE.test(text)) return { ...nil, eventType: "war_loss_penalty" };
  if (WAR_VICTORY_RE.test(text)) return { ...nil, eventType: "war_victory_reward" };
  if (STARVATION_RE.test(text)) return { ...nil, eventType: "starvation" };
  if (RITUAL_SHORTENED_RE.test(text)) return { ...nil, eventType: "ritual_shortened" };
  if (PLAGUE_ENDED_RE.test(text)) return { ...nil, eventType: "plague_ended" };

  m = UTOPIAN_LORDS_RE.exec(text);
  if (m) {
    const parsed = parseAidResource(`${m[1]} ${m[2]}`);
    return { ...nil, eventType: "utopian_lords_reward", amount: parsed?.amount ?? parseNum(m[1]), resourceType: parsed?.resourceType ?? null };
  }

  if (NEW_SCIENTIST_RE.test(text)) return { ...nil, eventType: "new_scientist" };
  if (INACTIVITY_RE.test(text)) return { ...nil, eventType: "inactivity_penalty" };

  return { ...nil, eventType: "other" };
}

export function parseProvinceNews(text: string): ProvinceNewsData | null {
  if (!text.includes("The Province Reporter")) return null;

  const events: ProvinceNewsEvent[] = [];

  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const tabIdx = trimmed.indexOf("\t");
    if (tabIdx === -1) continue;

    const gameDate = trimmed.slice(0, tabIdx).trim();
    const rawText = trimmed.slice(tabIdx + 1).trim();
    if (!GAME_DATE_RE.test(gameDate) || !rawText) continue;

    const classified = classifyEvent(rawText);
    events.push({ gameDate, rawText, ...classified });
  }

  if (events.length === 0) return null;
  return { events };
}
