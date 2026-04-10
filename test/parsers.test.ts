import { test } from "node:test";
import assert from "node:assert/strict";
import { detectIntelType, getIntelPathname } from "../lib/parsers/detect";
import { parseSoT } from "../lib/parsers/sot";
import { parseSurvey } from "../lib/parsers/survey";
import { parseSoS } from "../lib/parsers/sos";
import { parseSoM } from "../lib/parsers/som";
import { parseSoD } from "../lib/parsers/sod";
import { parseInfiltrate } from "../lib/parsers/infiltrate";
import { parseKingdom } from "../lib/parsers/kingdom";

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
Networth\t517,597 gold coins\tDef. Points\t294,463`;

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

test("detectIntelType — unsupported thievery ops are real but NYI", () => {
  assert.equal(
    detectIntelType("https://utopia-game.com/wol/game/thievery?c=3900"),
    null,
  );
  // These are real thievery op URLs seen in traces, but we do not parse/store
  // them yet, so they should remain unrecognized until implemented.
  assert.equal(
    detectIntelType("https://utopia-game.com/wol/game/thievery?p=1842&o=SNATCH_NEWS&q=387&c=4517"),
    null,
  );
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
