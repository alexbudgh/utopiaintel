import { test } from "node:test";
import assert from "node:assert/strict";
import { detectIntelType, getIntelPathname } from "../lib/parsers/detect";
import { parseIntel } from "../lib/parsers";
import { parseSoT } from "../lib/parsers/sot";
import { parseSurvey } from "../lib/parsers/survey";
import { parseSoS } from "../lib/parsers/sos";
import { parseSoM } from "../lib/parsers/som";
import { parseSoD } from "../lib/parsers/sod";
import { parseInfiltrate } from "../lib/parsers/infiltrate";
import { parseKingdom } from "../lib/parsers/kingdom";
import { parseTrainArmy } from "../lib/parsers/train_army";
import { parseBuild } from "../lib/parsers/build";
import { parseKingdomNews } from "../lib/parsers/kingdom_news";
import { parseState } from "../lib/parsers/state";
import { parseUtopiaDate, formatUtopiaDate } from "../lib/ui";

// ---------------------------------------------------------------------------
// Fixture texts extracted from ~/intel_debug.jsonl
// ---------------------------------------------------------------------------

const SOT_TEXT = `You descend into an underground area of your castle and enter the Guild of Thieves. An organization created under your leadership, the Guild trains the lowest classes of people to learn the tools of the trade. Trained by your military, your thieves stand ready at your service to do what is needed.

The Province of Obsidian (7:5)
February 24 of YR8 (next tick: 32 minutes)
Race\tAvian\tSoldiers\t10,574
Ruler\tThe Conniving Knight etienne\tGriffins\t5,221
Land\t1,576\tHarpies\t6,065
Peasants\t7,843\tDrakes\t2,294
Building Eff.\t85%\tThieves\tUnknown
Money\t1,669,066\tWizards\tUnknown
Food\t0\tWar Horses\t0
Runes\t158,132\tPrisoners\t0
Trade Balance\t0\tOff. Points\t198,347
Networth\t226,798 gold coins\tDef. Points\t92,910
Number of thieves\t7,725 (3.129 per acre)\tStealth\t98%
Uniques -
Activation
Plaguebearers - Race Passive Effect
Honor and Glory - Personality Passive Effect


We lost 3 thieves in the operation.
Early indications show that our operation was a success and we have 100% confidence in the information retrieved.
Target kingdom is Unnamed kingdom (7:5)`;

const SOS_TEXT = `You descend into an underground area of your castle and enter the Guild of Thieves. An organization created under your leadership, the Guild trains the lowest classes of people to learn the tools of the trade. Trained by your military, your thieves stand ready at your service to do what is needed.

Our thieves visit the research centers of Obsidian (7:5). They find this recent report...
Current Effects of Science
Science Type\tNumber of books\tEffect
Economy - 17 scientists - 105,020 books available
Alchemy\t93,526\t 15.8% Income
Tools\t100,631\t 11.8% Building Effectiveness
Housing\t131,094\t 6.7% Population Limits
Production\t103,416\t 49.7% Food & Rune Production
Bookkeeping\t132,865\t-17.5% Wage Reduction
Artisan\t798\t-1.2% Construction Time & -1.2% Construction & Raze Cost
Military - 12 scientists - 121,620 books available
Strategy\t186,282\t 11.1% Defensive Military Efficiency
Siege\t87,822\t 6.4% Battle Gains
Tactics\t201,850\t 11.5% Offensive Military Efficiency
Valor\t1,369\t-1.8% Military Train Time &  1.8% Dragon Slaying Strength
Heroism\t89,489\t 9.0% Draft Speed & -9.0% Draft Costs
Resilience\t99,403\t-11.0% Military Casualties
Arcane Arts - 2 scientists - 20,400 books available
Crime\t2,515\t 6.5% Thief Effectiveness (TPA)
Channeling\t1,577\t 6.3% Wizard Effectiveness (WPA)
Shielding\t211,755\t-10.1% Damage from Enemy Thievery and Magic Instant Operations
Cunning\t1,154\t 0.9% Thievery Sabotage Operation Damage
Sorcery\t205\t 0.4% Magic Instant Spell Damage
Finesse\t1,049\t-2.7% Wizard and Thief losses on failed attempts
Science Book Recovery Schedule
...
Early indications show that our operation was a success and we have 100% confidence in the information retrieved.`;

const SURVEY_TEXT = `You descend into an underground area of your castle and enter the Guild of Thieves. An organization created under your leadership, the Guild trains the lowest classes of people to learn the tools of the trade. Trained by your military, your thieves stand ready at your service to do what is needed.

Our thieves scour the lands of Obsidian (7:5) and learn...
Statistics
Available Workers\t7,843\tBuilding Efficiency\t85.2%
Available Jobs\t23,575\tWorkers Needed for Max. Efficiency\t15,795
Building Effects
You will find that as we build more of certain building types, many new structures will be less effective. The Next 1% in parentheses below refers to the benefits of dedicating 1% more of your land to a particular building type.

Building type\tQuantity\t% of Total\tCurrent Effects (effect of next 1%)
Barren Land\t471\t29.9%\t
Homes\t162\t10.3%\tIncrease max population by 1,620
48.6 additional peasants per day
Farms\t101\t6.4%\tProduce 5,161 bushels per day
Mills\t0\t0.0%\tLower building costs by 0.0% (3.37%)
Reduce exploration costs in gold by 0.0% (2.53%)
Reduce exploration costs in men by 0.0% (1.69%)
Banks\t156\t9.9%\tProduce 3,321 gold coins per day
11.39% higher income (1.01%)
Training Grounds\t215\t13.6%\t10.03% reduced train time (0.61%)
15.05% higher offensive efficiency (0.92%)
Armouries\t72\t4.6%\t5.57% lower military training costs (1.15%)
7.43% lower military wages & draft costs (1.53%)
Military Barracks\t0\t0.0%\t0.0% lower attack times (1.26%)
0.0% reduced mercenary costs (1.69%)
Forts\t119\t7.6%\t8.92% higher defensive efficiency (1.07%)
Castles\t0\t0.0%\t0.0% lower resource and honor losses when attacked (1.9%)
Hospitals\t0\t0.0%\tIncrease birth rates by 0.0% (1.69%)
0.0% chance to cure the plague each day (2.53%)
0.0% lower military casualties (2.53%)
Guilds\t131\t8.3%\t2.6 wizards trained per day
Towers\t149\t9.5%\tProduce 1,522 runes per day
Thieves' Dens\t0\t0.0%\t0.0% higher thievery effectiveness (2.53%)
0.0% lower losses in thievery operations (3.04%)
Watch Towers\t0\t0.0%\t0.0% less damage caused by enemy thieves (2.11%)
0.0% chance of preventing enemy thief missions (1.69%)
Universities\t0\t0.0%\t0.0% higher generation of science books (0.99%)
0.0% increase in new scientists (1.49%)
Libraries\t0\t0.0%\t0.0% higher science efficiency (1.49%)
Dungeons\t0\t0.0%\tHouse 0 prisoners
Exploration/Construction Schedules
Building type\tSchedule (number of days)
1\t2\t3\t4\t5\t6\t7\t8\t9\t10\t11\t12\t13\t14\t15\t16\t17\t18\t19\t20\t21\t22\t23\t24
Barren Land\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t
Homes\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t
Farms\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t
Early indications show that our operation was a success and we have 100% confidence in the information retrieved.`;

const SOM_TEXT = `You descend into an underground area of your castle and enter the Guild of Thieves. An organization created under your leadership, the Guild trains the lowest classes of people to learn the tools of the trade. Trained by your military, your thieves stand ready at your service to do what is needed.

Our thieves listen in on a report from the Military Elders of Obsidian (7:5)...
The Conniving Knight etienne, we have 5 generals available to lead our armies. One must always stay here to lead our forces in defense, but you may send the others out to combat at any time.
Our Generals' current activities and our military strength is detailed below.

Wage Rate
Our military effectiveness is determined by the wage rates of our armed forces. Higher wages can drive up productivity. Any changes to pay will take time to change our efficiency.

At this time, approximately 79.7% of our maximum population is allocated to non-peasant roles. Our wage rate is 200.0% of normal levels, and our military is functioning at 113.5% efficiency.

Military Strength
In addition, our military strength is affected by a number of other factors including buildings, honor, spells, and more. Our net military effectiveness is as follows:

Offensive Military Effectiveness\t145.5%\tNet Offensive Points at Home\t198,347
Defensive Military Effectiveness\t135.9%\tNet Defensive Points at Home\t92,910
Army Availability
Standing Army\tUndeployed Army\tUndeployed Army\tUndeployed Army\tUndeployed Army
Generals\t5\t\t\t\t
Soldiers\t10,574\t\t\t\t
Griffins\t5,221\t\t\t\t
Harpies\t6,065\t\t\t\t
Drakes\t2,294\t\t\t\t
War Horses\t0\t\t\t\t
Captured Land\t-\t\t\t\t
Early indications show that our operation was a success and we have 100% confidence in the information retrieved.`;

const SOD_TEXT = `You descend into an underground area of your castle and enter the Guild of Thieves. An organization created under your leadership, the Guild trains the lowest classes of people to learn the tools of the trade. Trained by your military, your thieves stand ready at your service to do what is needed.

Number of thieves\t7,728 (3.13 per acre)\tStealth\t99%
Uniques -
Activation
Plaguebearers - Race Passive Effect
Honor and Glory - Personality Passive Effect


Early indications show that our operation was a success and we have 100% confidence in the information retrieved. Our thieves have infiltrated the military ranks of Obsidian (7:5). We were able to determine there is currently 92,910 defense points defending their lands.
Target kingdom is Unnamed kingdom (7:5)`;

const INFILTRATE_TEXT = `You descend into an underground area of your castle and enter the Guild of Thieves. An organization created under your leadership, the Guild trains the lowest classes of people to learn the tools of the trade. Trained by your military, your thieves stand ready at your service to do what is needed.

Number of thieves\t7,713 (3.124 per acre)\tStealth\t88%
Uniques -
Activation
Plaguebearers - Race Passive Effect
Honor and Glory - Personality Passive Effect


Early indications show that our operation was a success and we have 100% confidence in the information retrieved. Our thieves have infiltrated the Thieves' Guilds of Obsidian (7:5). They appear to have about 4,038 thieves employed across their lands.
Target kingdom is Unnamed kingdom (7:5)`;

const KINGDOM_TEXT = `
The Glorious kingdom of Space (5:9)
< Previous Random Next >

Total Provinces\t25\tStance\tNormal
Total Networth\t25,600,865gc (avg: 1,024,034gc)\tNet Worth Rank\t3 of 86
Total Land\t95,368 acres (avg: 3,814 acres)\tLand Rank\t5 of 86
Provinces
Legend: Protection^ Monarch (M) Steward (S) You Online*

Slot\tProvince\tRace\tLand\tNet Worth\tNet Worth/Acre\tNobility
1\tOrion\tUndead\t3,235 acres\t871,841gc\t269gc\tViscountess
2\tAndromeda*\tHuman\t5,223 acres\t1,390,751gc\t266gc\tCount
3\tMY Camelopardalis\tElf\t3,251 acres\t908,612gc\t279gc\tCountess
4\tCassiopeia (M)\tAvian\t3,357 acres\t948,576gc\t282gc\tQueen
5\tBlack hole (S)\tElf\t3,797 acres\t1,063,889gc\t280gc\tCountess
6\tPrams nova (S)*\tFaery\t1,493 acres\t316,475gc\t211gc\tLady
`;

const KINGDOM_RELATION_TEXT = `
The Venerated kingdom of Champions of Endevours (1:6)
< Previous Random Next >

Total Provinces\t21\tStance\tNormal
Total Networth\t13,198,771gc (avg: 628,512gc)\tNet Worth Rank\t33 of 86
Total Land\t58,961 acres (avg: 2,807 acres)\tLand Rank\t37 of 86
Total Honor\t24,810\tHonor Rank\t51 of 86
Wars Won / War Score\t2 / 0.5\tAverage Opponent Relative Size\t102%
War History\t
Pirates AAAARRRrrrr (4:7) Loss
Luke no warrring 311 kthxbye (2:5) Win
always looking for eowcf (2:8) Win
Clownosaurus Need more clowns (4:2) Loss
Open Relations\t
Ghetto Nightmare (2:3) - Unfriendly
ThemNormalUnfriendlyHostileWarUs
Their Attitude To Us\tNon Aggression Pact (0.00 points)\tOur Attitude To Them\tNon Aggression Pact (0.00 points)
Taunt into battle\tHostility meter visible until Mon, 20 Apr
Provinces
Legend: Protection^ Monarch (M) Steward (S) You Online*

Slot\tProvince\tRace\tLand\tNet Worth\tNet Worth/Acre\tNobility
1\tImperator Margok (S)\tDark Elf\t2,862 acres\t664,532gc\t232gc\tKnight
2\tEarth of exotic\tOrc\t2,707 acres\t596,200gc\t220gc\tKnight
3\tKefka Palazzo\tHuman\t3,026 acres\t677,134gc\t223gc\tKnight
`;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

const THRONE_TEXT = `The Province of TestProv (2:6)
February 24 of YR8 (next tick: 40 minutes)
Race\tUndead\tSoldiers\t0
Ruler\tLord Plague Bearer the Hero\tSkeletons\t2,085
Land\t2,469\tZombies\t16,510
Peasants\t15,858\tGhouls\t19,651
Building Eff.\t113%\tThieves\t7,728 (100%)
Money\t278,911\tWizards\t6,606 (100%)
Food\t21,199\tWar Horses\t398
Runes\t36,020\tPrisoners\t0
Trade Balance\t494,370\tOff. Points\t366,485
Networth\t517,597 gold coins\tDef. Points\t294,463
Our Kingdom has concluded WAR with Example (1:11)! Our post war ceasefire state will expire on June 15 of YR8!

We are covered by the Onslaught ritual with 91.7% effectiveness left! The ritual will be lifted in 56 days.

Info
Duration: Builders Boon ( 1 day ) Inspire Army ( - )

Armies : (1.00 days left) (0) (1.05 days left) (0)`;

function throneTextWithRuler(ruler: string): string {
  return THRONE_TEXT.replace(
    "Ruler\tLord Plague Bearer the Hero\tSkeletons\t2,085",
    `Ruler\t${ruler}\tSkeletons\t2,085`,
  );
}

test("detectIntelType — /throne detected as sot", () => {
  assert.equal(detectIntelType("https://utopia-game.com/wol/game/throne"), "sot");
});

test("detectIntelType — thievery query op URLs detected", () => {
  assert.equal(
    detectIntelType("https://utopia-game.com/wol/game/thievery?p=1842&o=SPY_ON_THRONE&q=402&c=1241"),
    "sot",
  );
  assert.equal(
    detectIntelType("https://utopia-game.com/wol/game/thievery?p=1842&o=SPY_ON_DEFENSE&q=402&c=4157"),
    "sod",
  );
  assert.equal(
    detectIntelType("https://utopia-game.com/wol/game/thievery?p=1842&o=SPY_ON_MILITARY&q=387&c=5692"),
    "som",
  );
  assert.equal(
    detectIntelType("https://utopia-game.com/wol/game/thievery?p=1842&o=SPY_ON_SCIENCES&q=387&c=9534"),
    "sos",
  );
  assert.equal(
    detectIntelType("https://utopia-game.com/wol/game/thievery?p=1842&o=SURVEY&q=387&c=7894"),
    "survey",
  );
  assert.equal(
    detectIntelType("https://utopia-game.com/wol/game/thievery?p=1842&o=INFILTRATE&q=387&c=6471"),
    "infiltrate",
  );
});

test("detectIntelType — thievery query op detection is case-insensitive", () => {
  assert.equal(
    detectIntelType("https://utopia-game.com/wol/game/thievery?p=1842&o=spy_on_throne&q=402&c=1241"),
    "sot",
  );
  assert.equal(
    detectIntelType("https://utopia-game.com/wol/game/thievery?p=1842&o=survey&q=387&c=7894"),
    "survey",
  );
  assert.equal(
    detectIntelType("https://utopia-game.com/wol/game/thievery?p=1842&o=infiltrate&q=387&c=6471"),
    "infiltrate",
  );
});

test("detectIntelType — SNATCH_NEWS detected as kingdom_news", () => {
  assert.equal(
    detectIntelType("https://utopia-game.com/wol/game/thievery?p=1842&o=SNATCH_NEWS&q=387&c=4517"),
    "kingdom_news",
  );
});

test("detectIntelType — build page detected as build", () => {
  assert.equal(
    detectIntelType("https://utopia-game.com/wol/game/build"),
    "build",
  );
});

test("parseIntel — dispatches SoT URLs to parseSoT", () => {
  const result = parseIntel("https://utopia-game.com/wol/game/throne", THRONE_TEXT);
  assert.ok(result);
  assert.equal(result.type, "sot");
  assert.equal(result.data.name, "TestProv");
  assert.equal(result.data.kingdom, "2:6");
});

test("parseIntel — state intel requires selfProv", () => {
  const stateText = `Current Networth\t123,456 gold coins
Current Land\t1,234 acres
Peasants\t7,890
`;

  assert.equal(parseIntel("https://utopia-game.com/wol/game/council_state", stateText), null);

  const result = parseIntel("https://utopia-game.com/wol/game/council_state", stateText, "TestProv");
  assert.ok(result);
  assert.equal(result.type, "state");
  assert.equal(result.data.name, "TestProv");
  assert.equal(result.data.kingdom, "");
});

test("parseIntel — build intel requires selfProv", () => {
  const buildText = `Free Building Credits\t56`;

  assert.equal(parseIntel("https://utopia-game.com/wol/game/build", buildText), null);

  const result = parseIntel("https://utopia-game.com/wol/game/build", buildText, "TestProv");
  assert.ok(result);
  assert.equal(result.type, "build");
  assert.equal(result.data.name, "TestProv");
  assert.equal(result.data.freeBuildingCredits, 56);
});

test("detectIntelType — train_army and army_training detected as train_army", () => {
  assert.equal(
    detectIntelType("https://utopia-game.com/wol/game/train_army"),
    "train_army",
  );
  assert.equal(
    detectIntelType("https://utopia-game.com/wol/game/army_training"),
    "train_army",
  );
});

test("detectIntelType — unsupported thievery ops return null", () => {
  assert.equal(
    detectIntelType("https://utopia-game.com/wol/game/thievery?c=3900"),
    null,
  );
  // Real but not-yet-implemented op
  assert.equal(
    detectIntelType("https://utopia-game.com/wol/game/thievery?p=1842&o=SPY_ON_EXPLORATION&q=387&c=236"),
    null,
  );
});

test("detectIntelType — kingdom_details with coordinates detected as kingdom", () => {
  assert.equal(detectIntelType("https://utopia-game.com/wol/game/kingdom_details/2/8"), "kingdom");
  assert.equal(detectIntelType("https://utopia-game.com/wol/game/kingdom_details/1/11"), "kingdom");
});

test("getIntelPathname — extracts lowercased pathname", () => {
  assert.equal(getIntelPathname("https://utopia-game.com/WOL/GAME/THRONE?foo=1"), "/wol/game/throne");
});

test("getIntelPathname — invalid URL returns null", () => {
  assert.equal(getIntelPathname("not-a-url"), null);
});

test("parseSoT — throne page (self-intel)", () => {
  const r = parseSoT(THRONE_TEXT);
  assert.ok(r, "should parse successfully");
  assert.equal(r.name, "TestProv");
  assert.equal(r.kingdom, "2:6");
  assert.equal(r.race, "Undead");
  assert.equal(r.personality, "War Hero");
  assert.equal(r.honorTitle, "Lord");
  assert.equal(r.land, 2469);
  assert.equal(r.networth, 517597);
  assert.equal(r.soldiers, 0);
  assert.equal(r.offSpecs, 2085);   // Skeletons
  assert.equal(r.defSpecs, 16510);  // Zombies
  assert.equal(r.elites, 19651);    // Ghouls
  assert.equal(r.thieves, 7728);
  assert.equal(r.wizards, 6606);
  assert.equal(r.offPoints, 366485);
  assert.equal(r.defPoints, 294463);
  assert.equal(r.money, 278911);
  assert.deepEqual(r.activeEffects, [
    { name: "Builders Boon", kind: "spell", durationText: "1 day", remainingTicks: 1, effectivenessPercent: null },
    { name: "Onslaught ritual", kind: "ritual", durationText: "91.7%, 56 days", remainingTicks: 56, effectivenessPercent: 91.7 },
  ]);
  assert.equal(r.accuracy, 100);
});

test("parseSoT — Obsidian (7:5)", () => {
  const r = parseSoT(SOT_TEXT);
  assert.ok(r, "should parse successfully");
  assert.equal(r.name, "Obsidian");
  assert.equal(r.kingdom, "7:5");
  assert.equal(r.race, "Avian");
  assert.equal(r.personality, "Tactician");
  assert.equal(r.honorTitle, "Knight");
  assert.equal(r.land, 1576);
  assert.equal(r.networth, 226798);
  assert.equal(r.soldiers, 10574);
  assert.equal(r.offSpecs, 5221);  // Griffins
  assert.equal(r.defSpecs, 6065);  // Harpies
  assert.equal(r.elites, 2294);    // Drakes
  assert.equal(r.peasants, 7843);
  assert.equal(r.offPoints, 198347);
  assert.equal(r.defPoints, 92910);
  assert.equal(r.money, 1669066);
  assert.equal(r.food, 0);
  assert.equal(r.runes, 158132);
  assert.equal(r.accuracy, 100);
});

for (const { ruler, personality, honorTitle } of [
  { ruler: "Lord Plague Bearer the Hero", personality: "War Hero", honorTitle: "Lord" },
  { ruler: "The Conniving Knight etienne", personality: "Tactician", honorTitle: "Knight" },
  { ruler: "The Brave Knight etienne", personality: "Warrior", honorTitle: "Knight" },
  { ruler: "The Great Knight etienne", personality: "General", honorTitle: "Knight" },
  { ruler: "Lord Nightblade the Rogue", personality: "Rogue", honorTitle: "Lord" },
  { ruler: "Lady Spellweaver the Sorcerer", personality: "Mystic", honorTitle: "Lady" },
  { ruler: "Lady Spellweaver the Sorceress", personality: "Mystic", honorTitle: "Lady" },
  { ruler: "Lord Builder the Craftsman", personality: "Artisan", honorTitle: "Lord" },
  { ruler: "Lady Builder the Craftswoman", personality: "Artisan", honorTitle: "Lady" },
  { ruler: "Lord Doubter the Skeptic", personality: "Heretic", honorTitle: "Lord" },
  { ruler: "Lady Valor the Chivalrous", personality: "Paladin", honorTitle: "Lady" },
  { ruler: "Lord Graveborn the Reanimator", personality: "Necromancer", honorTitle: "Lord" },
]) {
  test(`parseSoT — ruler title mapping for ${ruler}`, () => {
    const r = parseSoT(throneTextWithRuler(ruler));
    assert.ok(r, "should parse successfully");
    assert.equal(r.personality, personality);
    assert.equal(r.honorTitle, honorTitle);
  });
}

test("parseSoS — Obsidian (7:5)", () => {
  const r = parseSoS(SOS_TEXT);
  assert.ok(r, "should parse successfully");
  assert.equal(r.name, "Obsidian");
  assert.equal(r.kingdom, "7:5");
  assert.equal(r.accuracy, 100);

  const crime = r.sciences.find((s) => s.science === "Crime");
  assert.ok(crime, "should find Crime science");
  assert.equal(crime.books, 2515);
  assert.equal(crime.effect, 6.5);

  const channeling = r.sciences.find((s) => s.science === "Channeling");
  assert.ok(channeling);
  assert.equal(channeling.effect, 6.3);

  assert.equal(r.sciences.length, 18);
});

test("parseSurvey — Obsidian (7:5) — buildings", () => {
  const r = parseSurvey(SURVEY_TEXT);
  assert.ok(r, "should parse successfully");
  assert.equal(r.name, "Obsidian");
  assert.equal(r.kingdom, "7:5");
  assert.equal(r.accuracy, 100);

  const homes = r.buildings.find((b) => b.building === "Homes");
  assert.ok(homes, "should find Homes");
  assert.equal(homes.built, 162);

  const trainingGrounds = r.buildings.find((b) => b.building === "Training Grounds");
  assert.ok(trainingGrounds);
  assert.equal(trainingGrounds.built, 215);

  const forts = r.buildings.find((b) => b.building === "Forts");
  assert.ok(forts);
  assert.equal(forts.built, 119);
});

const SELF_SURVEY_TEXT = `Building Effectiveness
Statistics
Available Workers\t15,858\tBuilding Efficiency\t113.3%
Available Jobs\t9,400\tWorkers Needed for Max. Efficiency\t6,298
Building type\tQuantity\t% of Total\tCurrent Effects (effect of next 1%)
Barren Land\t0\t0.0%\t
Homes\t77\t3.1%\tIncrease max population by 770
Banks\t178\t7.2%\tProduce 5,043 gold coins per day
Guilds\t131\t5.3%\t2.6 wizards trained per day
Towers\t67\t2.7%\tProduce 911 runes per day
Thieves' Dens\t0\t0.0%\t0.0% higher thievery effectiveness (3.37%)
Watch Towers\t0\t0.0%\t0.0% chance of preventing enemy thief missions (2.24%)
Exploration/Construction Schedules
Building type\tSchedule (number of days)
1\t2\t3\t4\t5\t6\t7\t8\t9\t10
Homes\t\t\t293\t\t\t\t\t\t\t
Banks\t\t\t563\t\t\t\t\t\t\t
Guilds\t\t\t610\t\t\t\t\t\t\t
`;

test("parseSurvey — self (council_internal) — uses selfProv, kingdom empty, built+inProgress correct", () => {
  const r = parseSurvey(SELF_SURVEY_TEXT, "TestProv");
  assert.ok(r, "should parse successfully");
  assert.equal(r.name, "TestProv");
  assert.equal(r.kingdom, "");
  assert.equal(r.accuracy, 100);

  const homes = r.buildings.find((b) => b.building === "Homes");
  assert.ok(homes, "should find Homes");
  assert.equal(homes.built, 77);
  assert.equal(homes.inProgress, 293);

  const banks = r.buildings.find((b) => b.building === "Banks");
  assert.ok(banks);
  assert.equal(banks.built, 178);
  assert.equal(banks.inProgress, 563);
});

test("parseSurvey — self survey emits 0-built entries so razed buildings overwrite stale DB data", () => {
  const r = parseSurvey(SELF_SURVEY_TEXT, "TestProv");
  assert.ok(r);
  // Barren Land and Thieves' Dens appear at 0 in the fixture — must be present for self surveys
  const barren = r.buildings.find((b) => b.building === "Barren Land");
  assert.ok(barren, "Barren Land should be present even at 0");
  assert.equal(barren.built, 0);
  const dens = r.buildings.find((b) => b.building === "Thieves' Dens");
  assert.ok(dens, "Thieves' Dens should be present even at 0");
  assert.equal(dens.built, 0);
});

test("parseSurvey — enemy survey does not emit 0-built entries", () => {
  const r = parseSurvey(SURVEY_TEXT);
  assert.ok(r);
  // Universities is 0 in SURVEY_TEXT — should be absent for enemy surveys
  const unis = r.buildings.find((b) => b.building === "Universities");
  assert.equal(unis, undefined, "0-built Universities should not appear in enemy survey");
});

test("parseSurvey — Universities recognized when in progress", () => {
  const textWithUnis = SELF_SURVEY_TEXT.replace(
    "Exploration/Construction Schedules",
    "Universities\t0\t0.0%\t0.0% higher generation of science books (0.99%)\nExploration/Construction Schedules"
  ).replace(
    "Guilds\t\t\t610",
    "Universities\t\t\t922\nGuilds\t\t\t610"
  );
  const r = parseSurvey(textWithUnis, "TestProv");
  assert.ok(r);
  const unis = r.buildings.find((b) => b.building === "Universities");
  assert.ok(unis, "Universities should be recognised");
  assert.equal(unis.built, 0);
  assert.equal(unis.inProgress, 922);
});

test("parseSurvey — TPA effects — 0% when no Thieves' Dens or Watch Towers", () => {
  const r = parseSurvey(SURVEY_TEXT);
  assert.ok(r, "should parse successfully");
  // Both are 0 in this province
  assert.equal(r.thieveryEffectiveness, 0);
  assert.equal(r.thiefPreventChance, 0);
  assert.equal(r.castlesEffect, 0);
});

test("parseSurvey — TPA effects — non-zero values parsed correctly", () => {
  const textWithBuildings = SURVEY_TEXT
    .replace("Thieves' Dens\t0\t0.0%\t0.0% higher thievery effectiveness (2.53%)", "Thieves' Dens\t50\t3.2%\t8.10% higher thievery effectiveness (2.53%)")
    .replace("Castles\t0\t0.0%\t0.0% lower resource and honor losses when attacked (1.9%)", "Castles\t70\t4.4%\t7.35% lower resource and honor losses when attacked (1.9%)")
    .replace("Watch Towers\t0\t0.0%\t0.0% less damage caused by enemy thieves (2.11%)\n0.0% chance of preventing enemy thief missions (1.69%)",
              "Watch Towers\t30\t1.9%\t3.21% less damage caused by enemy thieves (2.11%)\n3.21% chance of preventing enemy thief missions (1.69%)");
  const r = parseSurvey(textWithBuildings);
  assert.ok(r);
  assert.equal(r.thieveryEffectiveness, 8.1);
  assert.equal(r.thiefPreventChance, 3.21);
  assert.equal(r.castlesEffect, 7.35);
});

test("parseSoM — Obsidian (7:5)", () => {
  const r = parseSoM(SOM_TEXT);
  assert.ok(r, "should parse successfully");
  assert.equal(r.name, "Obsidian");
  assert.equal(r.kingdom, "7:5");
  assert.equal(r.ome, 145.5);
  assert.equal(r.dme, 135.9);
  assert.equal(r.netOffense, 198347);
  assert.equal(r.netDefense, 92910);

  // Standing army (home)
  const home = r.armies.find((a) => a.armyType === "home");
  assert.ok(home, "should find home army");
  assert.equal(home.generals, 5);
  assert.equal(home.soldiers, 10574);
  assert.equal(home.offSpecs, 5221);  // Griffins
  assert.equal(home.defSpecs, 6065);  // Harpies
  assert.equal(home.elites, 2294);    // Drakes
});

test("parseSoD — Obsidian (7:5)", () => {
  const r = parseSoD(SOD_TEXT);
  assert.ok(r, "should parse successfully");
  assert.equal(r.name, "Obsidian");
  assert.equal(r.kingdom, "7:5");
  assert.equal(r.defPoints, 92910);
  assert.equal(r.accuracy, 100);
});

test("parseInfiltrate — Obsidian (7:5)", () => {
  const r = parseInfiltrate(INFILTRATE_TEXT);
  assert.ok(r, "should parse successfully");
  assert.equal(r.name, "Obsidian");
  assert.equal(r.kingdom, "7:5");
  assert.equal(r.thieves, 4038);
  assert.equal(r.accuracy, 100);
});

test("parseKingdom — Space (5:9)", () => {
  const r = parseKingdom(KINGDOM_TEXT);
  assert.ok(r, "should parse successfully");
  assert.equal(r.location, "5:9");
  assert.equal(r.kingdomTitle, "Glorious");
  assert.equal(r.totalNetworth, 25600865);
  assert.equal(r.networthRank, 3);
  assert.equal(r.totalLand, 95368);
  assert.equal(r.landRank, 5);
  assert.equal(r.totalHonor, null);
  assert.equal(r.warsWon, null);
  assert.ok(r.provinces.length >= 3, "should find provinces");

  const orion = r.provinces.find((p) => p.name === "Orion");
  assert.ok(orion, "should find Orion");
  assert.equal(orion.slot, 1);
  assert.equal(orion.race, "Undead");
  assert.equal(orion.land, 3235);
  assert.equal(orion.networth, 871841);

  const andromeda = r.provinces.find((p) => p.name === "Andromeda");
  assert.ok(andromeda, "should find Andromeda");
  assert.equal(andromeda.slot, 2);
});

test("parseKingdom — monarch/steward markers stripped from province names", () => {
  const r = parseKingdom(KINGDOM_TEXT);
  assert.ok(r, "should parse successfully");

  // (M) alone
  const monarch = r.provinces.find((p) => p.name === "Cassiopeia");
  assert.ok(monarch, "monarch name should not include (M)");

  // (S) alone
  const steward = r.provinces.find((p) => p.name === "Black hole");
  assert.ok(steward, "steward name should not include (S)");

  // (S) combined with online marker *
  const stewardOnline = r.provinces.find((p) => p.name === "Prams nova");
  assert.ok(stewardOnline, "steward+online name should not include (S) or *");

  // No false positives — names with markers must not appear
  assert.ok(!r.provinces.find((p) => p.name.includes("(M)")), "no province name should contain (M)");
  assert.ok(!r.provinces.find((p) => p.name.includes("(S)")), "no province name should contain (S)");
});

test("parseKingdom — directional relations and hostility timer", () => {
  const r = parseKingdom(KINGDOM_RELATION_TEXT);
  assert.ok(r, "should parse successfully");
  assert.equal(r.location, "1:6");
  assert.equal(r.kingdomTitle, "Venerated");
  assert.equal(r.totalNetworth, 13198771);
  assert.equal(r.networthRank, 33);
  assert.equal(r.totalLand, 58961);
  assert.equal(r.landRank, 37);
  assert.equal(r.totalHonor, 24810);
  assert.equal(r.warsWon, 2);
  assert.equal(r.theirAttitudeToUs, "Non Aggression Pact");
  assert.equal(r.theirAttitudePoints, 0);
  assert.equal(r.ourAttitudeToThem, "Non Aggression Pact");
  assert.equal(r.ourAttitudePoints, 0);
  assert.equal(r.hostilityMeterVisibleUntil, "Mon, 20 Apr");
  assert.equal(r.warTarget, null);
});

test("parseKingdom — open relations list", () => {
  const r = parseKingdom(KINGDOM_RELATION_TEXT);
  assert.ok(r, "should parse successfully");
  assert.deepEqual(r.openRelations, [
    {
      name: "Ghetto Nightmare",
      location: "2:3",
      status: "Unfriendly",
    },
  ]);
});

// ---------------------------------------------------------------------------
// parseTrainArmy
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// parseBuild
// ---------------------------------------------------------------------------

test("parseBuild — parses free building credits", () => {
  const text = `Build page\nFree Building Credits\t223\nTotal Land\t3,334 acres`;
  const r = parseBuild(text, "SelfProv");
  assert.ok(r, "should parse successfully");
  assert.equal(r.name, "SelfProv");
  assert.equal(r.freeBuildingCredits, 223);
});

test("parseBuild — returns null without selfProv", () => {
  assert.equal(parseBuild("Free Building Credits\t223", undefined), null);
});

test("parseBuild — returns null when credits line absent", () => {
  assert.equal(parseBuild("Total Land\t3,334 acres", "SelfProv"), null);
});

// ---------------------------------------------------------------------------
// parseTrainArmy
// ---------------------------------------------------------------------------

test("parseTrainArmy — parses free specialist credits", () => {
  const text = `Army Training
TestProv
Free specialist credits left\t42
Soldiers: 1,000`;
  const r = parseTrainArmy(text, "TestProv");
  assert.ok(r, "should parse successfully");
  assert.equal(r.name, "TestProv");
  assert.equal(r.freeSpecialistCredits, 42);
});

test("parseTrainArmy — returns null without selfProv", () => {
  const text = "Free specialist credits left\t42";
  assert.equal(parseTrainArmy(text, undefined), null);
});

test("parseTrainArmy — returns null when credits line absent", () => {
  const text = "Some other army page content";
  assert.equal(parseTrainArmy(text, "TestProv"), null);
});

// ---------------------------------------------------------------------------
// formatUtopiaDate / parseUtopiaDate round-trip
// ---------------------------------------------------------------------------

test("formatUtopiaDate — round-trips through parseUtopiaDate", () => {
  const dates = [
    "January 1 of YR0",
    "July 24 of YR0",
    "January 1 of YR1",
    "February 24 of YR8",
    "May 1 of YR9",
    "July 1 of YR10",
  ];
  for (const d of dates) {
    const ord = parseUtopiaDate(d);
    assert.ok(ord >= 0, `parseUtopiaDate should parse "${d}"`);
    assert.equal(formatUtopiaDate(ord), d, `round-trip failed for "${d}"`);
  }
});

test("formatUtopiaDate — last day of last month is July 24", () => {
  // YR1 = ordinals 168..335; last day of YR1 = ord 335
  const ord = parseUtopiaDate("July 24 of YR1");
  assert.equal(ord, 2 * 7 * 24 - 1);
  assert.equal(formatUtopiaDate(ord), "July 24 of YR1");
});

// ---------------------------------------------------------------------------
// parseKingdomNews
// ---------------------------------------------------------------------------

// Helpers
function mkLine(date: string, text: string) { return `${date}\t${text}`; }
function parseOne(text: string) {
  const r = parseKingdomNews(text);
  assert.ok(r && r.events.length === 1, "expected exactly one event");
  return r!.events[0];
}

test("parseKingdomNews — invasion (march) with slot prefix", () => {
  const e = parseOne(mkLine("May 1 of YR9", "12 - Napoleon Dynamite (4:9) captured 501 acres of land from 3 - Who Knows (2:6)"));
  assert.equal(e.eventType, "march");
  assert.equal(e.attackerName, "Napoleon Dynamite");
  assert.equal(e.attackerKingdom, "4:9");
  assert.equal(e.defenderName, "Who Knows");
  assert.equal(e.defenderKingdom, "2:6");
  assert.equal(e.acres, 501);
  assert.equal(e.gameDate, "May 1 of YR9");
});

test("parseKingdomNews — invasion (march) without slot prefix", () => {
  const e = parseOne(mkLine("March 3 of YR9", "Attacker Province (1:2) captured 300 acres of land from Defender Province (3:4)"));
  assert.equal(e.eventType, "march");
  assert.equal(e.attackerKingdom, "1:2");
  assert.equal(e.defenderKingdom, "3:4");
  assert.equal(e.acres, 300);
});

test("parseKingdomNews — 'invaded and captured' variant (INVASION_RE)", () => {
  const e = parseOne(mkLine("June 10 of YR9", "Storm Rider (5:1) invaded Quiet Hamlet (7:3) and captured 425 acres"));
  assert.equal(e.eventType, "march");
  assert.equal(e.attackerKingdom, "5:1");
  assert.equal(e.defenderKingdom, "7:3");
  assert.equal(e.acres, 425);
});

test("parseKingdomNews — unknown province march", () => {
  const e = parseOne(mkLine("April 5 of YR9", "An unknown province from Dark Kingdom (6:2) captured 200 acres of land from Border Watch (2:8)"));
  assert.equal(e.eventType, "march");
  assert.equal(e.attackerName, null);
  assert.equal(e.attackerKingdom, "6:2");
  assert.equal(e.defenderName, "Border Watch");
  assert.equal(e.acres, 200);
});

test("parseKingdomNews — ambush (ambushed armies from)", () => {
  const e = parseOne(mkLine("February 8 of YR9", "Swift Strike (3:3) ambushed armies from Slow Guard (4:4) and took 150 acres"));
  assert.equal(e.eventType, "ambush");
  assert.equal(e.attackerKingdom, "3:3");
  assert.equal(e.defenderKingdom, "4:4");
  assert.equal(e.acres, 150);
});

test("parseKingdomNews — raze", () => {
  const e = parseOne(mkLine("January 12 of YR9", "Fire Brigade (8:1) razed 80 acres of Ash Province (9:2)"));
  assert.equal(e.eventType, "raze");
  assert.equal(e.attackerKingdom, "8:1");
  assert.equal(e.defenderKingdom, "9:2");
  assert.equal(e.acres, 80);
});

test("parseKingdomNews — loot", () => {
  const e = parseOne(mkLine("March 15 of YR9", "Book Thief (2:2) invaded and looted 500 books from Scholar's Rest (5:5)"));
  assert.equal(e.eventType, "loot");
  assert.equal(e.books, 500);
  assert.equal(e.acres, null);
  assert.equal(e.attackerKingdom, "2:2");
  assert.equal(e.defenderKingdom, "5:5");
});

test("parseKingdomNews — failed attack (unknown province)", () => {
  const e = parseOne(mkLine("April 20 of YR9", "An unknown province from Shadow Realm (7:7) attempted to invade Fortress (1:1)"));
  assert.equal(e.eventType, "failed_attack");
  assert.equal(e.attackerName, null);
  assert.equal(e.attackerKingdom, "7:7");
  assert.equal(e.defenderName, "Fortress");
  assert.equal(e.acres, null);
});

test("parseKingdomNews — failed attack (known province)", () => {
  const e = parseOne(mkLine("May 5 of YR9", "Bold Charger (3:1) attempted to invade Stone Wall (1:3)"));
  assert.equal(e.eventType, "failed_attack");
  assert.equal(e.attackerName, "Bold Charger");
  assert.equal(e.attackerKingdom, "3:1");
  assert.equal(e.defenderName, "Stone Wall");
});

test("parseKingdomNews — war declared", () => {
  const e = parseOne(mkLine("June 1 of YR9", "We have declared WAR on Iron Fist (4:6)!"));
  assert.equal(e.eventType, "war_declared");
  assert.equal(e.relationKingdom, "4:6");
});

test("parseKingdomNews — ceasefire accepted", () => {
  const e = parseOne(mkLine("July 3 of YR9", "Peaceful Realm (2:1) has accepted our ceasefire proposal!"));
  assert.equal(e.eventType, "ceasefire_accepted");
  assert.equal(e.relationKingdom, "2:1");
});

test("parseKingdomNews — dragon against us", () => {
  const e = parseOne(mkLine("March 7 of YR9", "A Fire Dragon, Ignis, from Flame Kingdom (6:6) has begun ravaging our lands!"));
  assert.equal(e.eventType, "dragon_against_us");
  assert.equal(e.dragonType, "Fire");
  assert.equal(e.dragonName, "Ignis");
  assert.equal(e.relationKingdom, "6:6");
});

test("parseKingdomNews — aid event", () => {
  const e = parseOne(mkLine("January 1 of YR9", "Generous Soul has sent an aid shipment to Needy Province."));
  assert.equal(e.eventType, "aid");
  assert.equal(e.senderName, "Generous Soul");
  assert.equal(e.receiverName, "Needy Province");
});

test("parseKingdomNews — unrecognized event falls through to 'other'", () => {
  const e = parseOne(mkLine("April 1 of YR9", "Something completely unexpected happened in the kingdom."));
  assert.equal(e.eventType, "other");
  assert.equal(e.attackerKingdom, null);
});

test("parseKingdomNews — multi-line input, skips blank lines", () => {
  const text = [
    mkLine("May 1 of YR9", "Storm Rider (5:1) invaded Quiet Hamlet (7:3) and captured 425 acres"),
    "",
    mkLine("May 2 of YR9", "We have declared WAR on Iron Fist (4:6)!"),
  ].join("\n");
  const r = parseKingdomNews(text);
  assert.ok(r);
  assert.equal(r.events.length, 2);
  assert.equal(r.events[0].eventType, "march");
  assert.equal(r.events[1].eventType, "war_declared");
});

test("parseKingdomNews — returns null for empty/whitespace-only input", () => {
  assert.equal(parseKingdomNews(""), null);
  assert.equal(parseKingdomNews("   \n\n  "), null);
});

test("parseKingdomNews — lines without tab separator are skipped", () => {
  const text = "no tab here at all\n" + mkLine("May 1 of YR9", "Storm Rider (5:1) invaded Quiet Hamlet (7:3) and captured 425 acres");
  const r = parseKingdomNews(text);
  assert.ok(r);
  assert.equal(r.events.length, 1);
});

test("parseKingdomNews — unknown province invasion ('invaded ... and captured')", () => {
  const e = parseOne(mkLine("June 2 of YR9", "An unknown province from Shadow Realm (7:7) invaded Border Watch (2:8) and captured 300 acres"));
  assert.equal(e.eventType, "march");
  assert.equal(e.attackerName, null);
  assert.equal(e.attackerKingdom, "7:7");
  assert.equal(e.defenderName, "Border Watch");
  assert.equal(e.defenderKingdom, "2:8");
  assert.equal(e.acres, 300);
});

test("parseKingdomNews — unknown province ambush", () => {
  const e = parseOne(mkLine("March 10 of YR9", "An unknown province from Night Riders (8:2) ambushed armies from Daywatch (3:5) and took 120 acres"));
  assert.equal(e.eventType, "ambush");
  assert.equal(e.attackerName, null);
  assert.equal(e.attackerKingdom, "8:2");
  assert.equal(e.defenderName, "Daywatch");
  assert.equal(e.acres, 120);
});

test("parseKingdomNews — ambush 'recaptured' variant", () => {
  const e = parseOne(mkLine("April 14 of YR9", "Comeback Kid (4:1) recaptured 90 acres of land from Raider (9:3)"));
  assert.equal(e.eventType, "ambush");
  assert.equal(e.attackerName, "Comeback Kid");
  assert.equal(e.attackerKingdom, "4:1");
  assert.equal(e.defenderName, "Raider");
  assert.equal(e.defenderKingdom, "9:3");
  assert.equal(e.acres, 90);
});

test("parseKingdomNews — raze 'invaded and razed' variant", () => {
  const e = parseOne(mkLine("May 20 of YR9", "Torch Bearer (2:4) invaded Timber Town (6:1) and razed 60 acres"));
  assert.equal(e.eventType, "raze");
  assert.equal(e.attackerKingdom, "2:4");
  assert.equal(e.defenderKingdom, "6:1");
  assert.equal(e.acres, 60);
});

test("parseKingdomNews — pillage", () => {
  const e = parseOne(mkLine("February 3 of YR9", "Plunderer (5:2) attacked and pillaged the lands of Harvest Field (1:7)"));
  assert.equal(e.eventType, "pillage");
  assert.equal(e.attackerKingdom, "5:2");
  assert.equal(e.defenderKingdom, "1:7");
  assert.equal(e.acres, null);
  assert.equal(e.books, null);
});

test("parseKingdomNews — failed attack with 'attempted an invasion of' variant", () => {
  const e = parseOne(mkLine("July 5 of YR9", "Bold Charger (3:1) attempted an invasion of Stone Wall (1:3)"));
  assert.equal(e.eventType, "failed_attack");
  assert.equal(e.attackerName, "Bold Charger");
  assert.equal(e.attackerKingdom, "3:1");
  assert.equal(e.defenderName, "Stone Wall");
});

test("parseKingdomNews — failed attack with 'In intra-kingdom war' prefix", () => {
  const e = parseOne(mkLine("June 8 of YR9", "In intra-kingdom war An unknown province from Dark Realm (6:6) attempted to invade Citadel (4:4)"));
  assert.equal(e.eventType, "failed_attack");
  assert.equal(e.attackerKingdom, "6:6");
  assert.equal(e.defenderName, "Citadel");
});

test("parseKingdomNews — dragon launched by us", () => {
  const e = parseOne(mkLine("January 5 of YR9", "Dragonmaster has completed our dragon, Ember, and it sets flight to ravage Target Kingdom (5:8)!"));
  assert.equal(e.eventType, "dragon_by_us");
  assert.equal(e.dragonName, "Ember");
  assert.equal(e.relationKingdom, "5:8");
});

test("parseKingdomNews — dragon project started by us", () => {
  const e = parseOne(mkLine("February 10 of YR9", "Our kingdom has begun the Ice Dragon project, Frost, targeted at Warm Kingdom (3:7)"));
  assert.equal(e.eventType, "dragon_by_us");
  assert.equal(e.dragonType, "Ice");
  assert.equal(e.dragonName, "Frost");
  assert.equal(e.relationKingdom, "3:7");
});

test("parseKingdomNews — dragon slain", () => {
  const e = parseOne(mkLine("March 12 of YR9", "Heroic Knight has slain the dragon, Ignis, ravaging our lands!"));
  assert.equal(e.eventType, "dragon_slain");
  assert.equal(e.dragonName, "Ignis");
});

test("parseKingdomNews — ritual started", () => {
  const e = parseOne(mkLine("April 3 of YR9", "We have started developing a ritual! (Barrier of Eternity)!"));
  assert.equal(e.eventType, "ritual_started");
  assert.equal(e.dragonName, "Barrier of Eternity");
});

test("parseKingdomNews — ceasefire proposed", () => {
  const e = parseOne(mkLine("May 15 of YR9", "We have proposed a ceasefire offer to Rival Kingdom (4:6)."));
  assert.equal(e.eventType, "ceasefire_proposed");
  assert.equal(e.relationKingdom, "4:6");
});

test("parseKingdomNews — ceasefire broken", () => {
  const e = parseOne(mkLine("June 20 of YR9", "Rival Kingdom (4:6) has broken their ceasefire agreement with us!"));
  assert.equal(e.eventType, "ceasefire_broken");
  assert.equal(e.relationKingdom, "4:6");
});

test("parseKingdomNews — ceasefire withdrawn", () => {
  const e = parseOne(mkLine("July 10 of YR9", "We have withdrawn our ceasefire proposal to Rival Kingdom (4:6)"));
  assert.equal(e.eventType, "ceasefire_withdrawn");
  assert.equal(e.relationKingdom, "4:6");
});

// ---------------------------------------------------------------------------
// parseState
// ---------------------------------------------------------------------------

const STATE_TEXT = `Council of State
Current Networth\t1,234,567 gold coins
Current Land\t850 acres
Peasants\t12,000
Thieves\t450
Wizards\t380
Total\t25,600
Max Population\t28,000`;

test("parseState — parses land, networth, population fields", () => {
  const r = parseState(STATE_TEXT, "SelfProv");
  assert.ok(r, "should parse successfully");
  assert.equal(r.name, "SelfProv");
  assert.equal(r.land, 850);
  assert.equal(r.networth, 1234567);
  assert.equal(r.peasants, 12000);
  assert.equal(r.thieves, 450);
  assert.equal(r.wizards, 380);
  assert.equal(r.totalPop, 25600);
  assert.equal(r.maxPop, 28000);
});

test("parseState — returns null when networth or land absent", () => {
  assert.equal(parseState("Current Land\t850 acres\nPeasants\t100", "SelfProv"), null, "missing networth → null");
  assert.equal(parseState("Current Networth\t500,000 gold coins\nPeasants\t100", "SelfProv"), null, "missing land → null");
});

test("parseState — optional fields default to 0 or null when absent", () => {
  const minimal = "Current Networth\t500,000 gold coins\nCurrent Land\t400 acres";
  const r = parseState(minimal, "SelfProv");
  assert.ok(r);
  assert.equal(r.peasants, 0);
  assert.equal(r.thieves, 0);
  assert.equal(r.wizards, 0);
  assert.equal(r.totalPop, null);
  assert.equal(r.maxPop, null);
});
