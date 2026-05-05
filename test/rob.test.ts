import { test } from "node:test";
import assert from "node:assert/strict";
import { parseRob } from "../lib/parsers/rob";

const PREAMBLE = `You descend into an underground area of your castle and enter the Guild of Thieves. An organization created under your leadership, the Guild trains the lowest classes of people to learn the tools of the trade. Trained by your military, your thieves stand ready at your service to do what is needed.`;

const TOWERS_URL  = "https://utopia-game.com/wol/game/thievery?p=834&o=ROB_THE_TOWERS&q=52&c=4572";
const VAULTS_URL  = "https://utopia-game.com/wol/game/thievery?p=408&o=ROB_THE_VAULTS&q=230&c=9990";
const GRANARIES_URL = "https://utopia-game.com/wol/game/thievery?p=1102&o=ROB_THE_GRANARIES&q=100&c=6741";

const TOWERS_STATS   = `Number of thieves\t582 (1.104 per acre)\tStealth\t66%`;
const VAULTS_STATS   = `Number of thieves\t2,847 (5.444 per acre)\tStealth\t24%`;
const GRANARIES_STATS = `Number of thieves\t2,851 (5.451 per acre)\tStealth\t39%`;

const TARGET_FOOTER = `Target kingdom is Time For A Book (3:9)\nSelect province:\t18 A Song Of Ice and Fire --- ( 118% )\nSelect operation:\tRob the Towers`;

test("parseRob — towers clean success", () => {
  const text = `${PREAMBLE}\n\n${TOWERS_STATS}\n\n\nEarly indications show that our operation was a success. Our thieves were able to steal 882 runes.\n${TARGET_FOOTER}`;
  const r = parseRob(text, TOWERS_URL, "TestProvince");
  assert.ok(r);
  assert.equal(r.op, "towers");
  assert.equal(r.outcome, "success");
  assert.equal(r.amountStolen, 882);
  assert.equal(r.thievesLost, 0);
  assert.equal(r.thieves, 582);
  assert.equal(r.stealth, 66);
  assert.equal(r.targetKingdom, "3:9");
  assert.equal(r.targetName, "A Song Of Ice and Fire");
  assert.equal(r.targetSlot, 18);
  assert.equal(r.name, "TestProvince");
});

test("parseRob — towers success with thief loss", () => {
  const text = `${PREAMBLE}\n\n${TOWERS_STATS}\n\n\nWe lost 1 thief in the operation.\nEarly indications show that our operation was a success. Our thieves were able to steal 3,006 runes.\n${TARGET_FOOTER}`;
  const r = parseRob(text, TOWERS_URL, "TestProvince");
  assert.ok(r);
  assert.equal(r.outcome, "success");
  assert.equal(r.amountStolen, 3006);
  assert.equal(r.thievesLost, 1);
});

test("parseRob — towers failure lost 0 thieves", () => {
  const text = `${PREAMBLE}\n\n${TOWERS_STATS}\n\n\nSources have indicated the mission was foiled. We lost 0 thieves. I am sorry, we will train harder for the next mission.\nTarget kingdom is Time For A Book (3:9)`;
  const r = parseRob(text, TOWERS_URL, "TestProvince");
  assert.ok(r);
  assert.equal(r.outcome, "failure");
  assert.equal(r.amountStolen, null);
  assert.equal(r.thievesLost, 0);
  assert.equal(r.targetKingdom, "3:9");
});

test("parseRob — towers failure lost N thieves", () => {
  const text = `${PREAMBLE}\n\n${TOWERS_STATS}\n\n\nSources have indicated the mission was foiled. We lost 5 thieves. If we are lucky, they will not rat on who sent them. I am sorry, we will train harder for the next mission.\nTarget kingdom is Time For A Book (3:9)`;
  const r = parseRob(text, TOWERS_URL, "TestProvince");
  assert.ok(r);
  assert.equal(r.outcome, "failure");
  assert.equal(r.thievesLost, 5);
});

test("parseRob — vaults clean success", () => {
  const text = `${PREAMBLE}\n\n${VAULTS_STATS}\n\n\nEarly indications show that our operation was a success. Our thieves have returned with 14,427 gold coins.\nTarget kingdom is Time For A Book (3:9)`;
  const r = parseRob(text, VAULTS_URL, "TestProvince");
  assert.ok(r);
  assert.equal(r.op, "vaults");
  assert.equal(r.outcome, "success");
  assert.equal(r.amountStolen, 14427);
  assert.equal(r.thieves, 2847);
  assert.equal(r.stealth, 24);
});

test("parseRob — vaults failure lost 1 thief", () => {
  const text = `${PREAMBLE}\n\n${VAULTS_STATS}\n\n\nSources have indicated the mission was foiled. We lost 1 thief. If we are lucky, he will not rat on who sent him. I am sorry, we will train harder for the next mission.\nTarget kingdom is Time For A Book (3:9)`;
  const r = parseRob(text, VAULTS_URL, "TestProvince");
  assert.ok(r);
  assert.equal(r.outcome, "failure");
  assert.equal(r.thievesLost, 1);
});

test("parseRob — granaries clean success", () => {
  const text = `${PREAMBLE}\n\n${GRANARIES_STATS}\n\n\nEarly indications show that our operation was a success. Our thieves have returned with 8,574 bushels.\nTarget kingdom is Time For A Book (3:9)`;
  const r = parseRob(text, GRANARIES_URL, "TestProvince");
  assert.ok(r);
  assert.equal(r.op, "granaries");
  assert.equal(r.outcome, "success");
  assert.equal(r.amountStolen, 8574);
});

test("parseRob — granaries failure", () => {
  const text = `${PREAMBLE}\n\n${GRANARIES_STATS}\n\n\nSources have indicated the mission was foiled. We lost 3 thieves. If we are lucky, they will not rat on who sent them. I am sorry, we will train harder for the next mission.\nTarget kingdom is Time For A Book (3:9)`;
  const r = parseRob(text, GRANARIES_URL, "TestProvince");
  assert.ok(r);
  assert.equal(r.op, "granaries");
  assert.equal(r.outcome, "failure");
  assert.equal(r.thievesLost, 3);
});

test("parseRob — form page (no result) returns null", () => {
  const text = `${PREAMBLE}\n\nNumber of thieves\t335 (0.653 per acre)\tStealth\t70%`;
  const r = parseRob(text, TOWERS_URL, "TestProvince");
  assert.equal(r, null);
});

test("parseRob — wrong op returns null", () => {
  const text = `${PREAMBLE}\n\n${TOWERS_STATS}\n\n\nEarly indications show that our operation was a success. Our thieves were able to steal 882 runes.\n${TARGET_FOOTER}`;
  const r = parseRob(text, "https://utopia-game.com/wol/game/thievery?o=SPY_ON_THRONE", "TestProvince");
  assert.equal(r, null);
});

const STATS     = `Number of thieves\t2,421 (5.229 per acre)\tStealth\t54%`;
const KD_FOOTER = `Target kingdom is Time For A Book (3:9)\nSelect province:\t16 On Basilisk Station --- ( 70% )`;
const FOILED    = `Sources have indicated the mission was foiled. We lost 1 thief. If we are lucky, he will not rat on who sent him. I am sorry, we will train harder for the next mission.\n${KD_FOOTER}`;

// Night Strike
test("parseRob — night_strike success", () => {
  const url = "https://utopia-game.com/wol/game/thievery?p=740&o=NIGHT_STRIKE&q=125&c=5435";
  const text = `${PREAMBLE}\n\n${STATS}\n\nEarly indications show that our operation was a success. Our thieves assassinated 63 enemy troops.\n${KD_FOOTER}`;
  const r = parseRob(text, url, "TestProvince");
  assert.ok(r);
  assert.equal(r.op, "night_strike");
  assert.equal(r.outcome, "success");
  assert.equal(r.troopsAssassinated, 63);
  assert.equal(r.thievesLost, 0);
  assert.equal(r.targetKingdom, "3:9");
  assert.equal(r.targetName, "On Basilisk Station");
});

test("parseRob — night_strike failure", () => {
  const url = "https://utopia-game.com/wol/game/thievery?p=502&o=NIGHT_STRIKE&q=123&c=1247";
  const text = `${PREAMBLE}\n\n${STATS}\n\n${FOILED}`;
  const r = parseRob(text, url, "TestProvince");
  assert.ok(r);
  assert.equal(r.op, "night_strike");
  assert.equal(r.outcome, "failure");
  assert.equal(r.troopsAssassinated, null);
  assert.equal(r.thievesLost, 1);
});

// Kidnap
test("parseRob — kidnap success", () => {
  const url = "https://utopia-game.com/wol/game/thievery?p=289&o=KIDNAP&q=583&c=2725";
  const text = `${PREAMBLE}\n\n${STATS}\n\nEarly indications show that our operation was a success. Our thieves kidnapped many people, but only were able to return with 116 of them.\n${KD_FOOTER}`;
  const r = parseRob(text, url, "TestProvince");
  assert.ok(r);
  assert.equal(r.op, "kidnap");
  assert.equal(r.outcome, "success");
  assert.equal(r.kidnapped, 116);
  assert.equal(r.thievesLost, 0);
});

test("parseRob — kidnap failure", () => {
  const url = "https://utopia-game.com/wol/game/thievery?p=319&o=KIDNAP&q=580&c=8374";
  const text = `${PREAMBLE}\n\n${STATS}\n\nSources have indicated the mission was foiled. We lost 7 thieves. If we are lucky, they will not rat on who sent them. I am sorry, we will train harder for the next mission.\n${KD_FOOTER}`;
  const r = parseRob(text, url, "TestProvince");
  assert.ok(r);
  assert.equal(r.op, "kidnap");
  assert.equal(r.outcome, "failure");
  assert.equal(r.kidnapped, null);
  assert.equal(r.thievesLost, 7);
});

// Bribe Generals
test("parseRob — bribe_generals success", () => {
  const url = "https://utopia-game.com/wol/game/thievery?p=808&o=BRIBE_GENERALS&q=25&c=9504";
  const text = `${PREAMBLE}\n\n${STATS}\n\nEarly indications show that our operation was a success. Our thieves have bribed an enemy general!\n${KD_FOOTER}`;
  const r = parseRob(text, url, "TestProvince");
  assert.ok(r);
  assert.equal(r.op, "bribe_generals");
  assert.equal(r.outcome, "success");
  assert.equal(r.thievesLost, 0);
});

test("parseRob — bribe_generals failure", () => {
  const url = "https://utopia-game.com/wol/game/thievery?p=808&o=BRIBE_GENERALS&q=25&c=7126";
  const text = `${PREAMBLE}\n\n${STATS}\n\nSources have indicated the mission was foiled. We lost 0 thieves. I am sorry, we will train harder for the next mission.\n${KD_FOOTER}`;
  const r = parseRob(text, url, "TestProvince");
  assert.ok(r);
  assert.equal(r.op, "bribe_generals");
  assert.equal(r.outcome, "failure");
  assert.equal(r.thievesLost, 0);
});

// Incite Riots
test("parseRob — incite_riots success", () => {
  const url = "https://utopia-game.com/wol/game/thievery?p=808&o=INCITE_RIOTS&q=795&c=6343";
  const text = `${PREAMBLE}\n\n${STATS}\n\nEarly indications show that our operation was a success. Our thieves have caused rioting. It is expected to last 2 days.\n${KD_FOOTER}`;
  const r = parseRob(text, url, "TestProvince");
  assert.ok(r);
  assert.equal(r.op, "incite_riots");
  assert.equal(r.outcome, "success");
  assert.equal(r.effectDuration, 2);
  assert.equal(r.thievesLost, 0);
});

test("parseRob — incite_riots failure", () => {
  const url = "https://utopia-game.com/wol/game/thievery?p=808&o=INCITE_RIOTS&q=121&c=1266";
  const text = `${PREAMBLE}\n\n${STATS}\n\n${FOILED}`;
  const r = parseRob(text, url, "TestProvince");
  assert.ok(r);
  assert.equal(r.op, "incite_riots");
  assert.equal(r.outcome, "failure");
  assert.equal(r.effectDuration, null);
  assert.equal(r.thievesLost, 1);
});

// Sabotage Wizards
test("parseRob — sabotage_wizards success (1 day, singular)", () => {
  const url = "https://utopia-game.com/wol/game/thievery?p=1102&o=SABOTAGE_WIZARDS&q=795&c=7251";
  const text = `${PREAMBLE}\n\n${STATS}\n\nEarly indications show that our operation was a success. Our thieves have disrupted the enemy Wizards' ability to regain their mana. It is expected to last 1 day.\n${KD_FOOTER}`;
  const r = parseRob(text, url, "TestProvince");
  assert.ok(r);
  assert.equal(r.op, "sabotage_wizards");
  assert.equal(r.outcome, "success");
  assert.equal(r.effectDuration, 1);
});

test("parseRob — sabotage_wizards success calmed (no lasting effect)", () => {
  const url = "https://utopia-game.com/wol/game/thievery?p=1102&o=SABOTAGE_WIZARDS&q=121&c=8872";
  const text = `${PREAMBLE}\n\n${STATS}\n\nEarly indications show that our operation was a success. Our thieves have disrupted the enemy Wizards' ability to regain their mana. However, it was quickly calmed and will have no lasting effect..\n${KD_FOOTER}`;
  const r = parseRob(text, url, "TestProvince");
  assert.ok(r);
  assert.equal(r.op, "sabotage_wizards");
  assert.equal(r.outcome, "success");
  assert.equal(r.effectDuration, 0);
});

test("parseRob — sabotage_wizards failure", () => {
  const url = "https://utopia-game.com/wol/game/thievery?p=1108&o=SABOTAGE_WIZARDS&q=121&c=3802";
  const text = `${PREAMBLE}\n\n${STATS}\n\n${FOILED}`;
  const r = parseRob(text, url, "TestProvince");
  assert.ok(r);
  assert.equal(r.op, "sabotage_wizards");
  assert.equal(r.outcome, "failure");
  assert.equal(r.effectDuration, null);
  assert.equal(r.thievesLost, 1);
});

// Arson
test("parseRob — arson success (too few to burn)", () => {
  const url = "https://utopia-game.com/wol/game/thievery?p=797&o=ARSON&q=121&c=4615";
  const text = `${PREAMBLE}\n\n${STATS}\n\nEarly indications show that our operation was a success. Unfortunately, our thieves were too few in number to find any buildings to burn.\n${KD_FOOTER}`;
  const r = parseRob(text, url, "TestProvince");
  assert.ok(r);
  assert.equal(r.op, "arson");
  assert.equal(r.outcome, "success");
  assert.equal(r.acresBurned, 0);
  assert.equal(r.thievesLost, 0);
});

test("parseRob — arson failure", () => {
  const url = "https://utopia-game.com/wol/game/thievery?p=797&o=ARSON&q=121&c=9999";
  const text = `${PREAMBLE}\n\n${STATS}\n\n${FOILED}`;
  const r = parseRob(text, url, "TestProvince");
  assert.ok(r);
  assert.equal(r.op, "arson");
  assert.equal(r.outcome, "failure");
  assert.equal(r.acresBurned, null);
  assert.equal(r.thievesLost, 1);
});

// Greater Arson
test("parseRob — greater_arson success (too few to burn)", () => {
  const url = "https://utopia-game.com/wol/game/thievery?p=364&o=GREATER_ARSON&q=300&c=4986";
  const text = `${PREAMBLE}\n\n${STATS}\n\nEarly indications show that our operation was a success. Unfortunately, our thieves were too few in number to find any buildings to burn.\n${KD_FOOTER}`;
  const r = parseRob(text, url, "TestProvince");
  assert.ok(r);
  assert.equal(r.op, "greater_arson");
  assert.equal(r.outcome, "success");
  assert.equal(r.acresBurned, 0);
});

test("parseRob — greater_arson failure", () => {
  const url = "https://utopia-game.com/wol/game/thievery?p=364&o=GREATER_ARSON&q=800&c=7389";
  const text = `${PREAMBLE}\n\n${STATS}\n\nSources have indicated the mission was foiled. We lost 6 thieves. If we are lucky, they will not rat on who sent them. I am sorry, we will train harder for the next mission.\n${KD_FOOTER}`;
  const r = parseRob(text, url, "TestProvince");
  assert.ok(r);
  assert.equal(r.op, "greater_arson");
  assert.equal(r.outcome, "failure");
  assert.equal(r.thievesLost, 6);
});

// Destabilize Guilds
test("parseRob — destabilize_guilds success", () => {
  const url = "https://utopia-game.com/wol/game/thievery?p=1108&o=DESTABILIZE_GUILDS&q=1000&c=3311";
  const text = `${PREAMBLE}\n\n${STATS}\n\nEarly indications show that our operation was a success. Our thieves have disrupted the enemy Guilds affecting their spellcasting effectiveness! It is expected to last 2 days.\n${KD_FOOTER}`;
  const r = parseRob(text, url, "TestProvince");
  assert.ok(r);
  assert.equal(r.op, "destabilize_guilds");
  assert.equal(r.outcome, "success");
  assert.equal(r.effectDuration, 2);
  assert.equal(r.thievesLost, 0);
});

// Bribe Thieves
test("parseRob — bribe_thieves success (thief lost before success line)", () => {
  const url = "https://utopia-game.com/wol/game/thievery?p=320&o=BRIBE_THIEVES&q=500&c=5945";
  const text = `${PREAMBLE}\n\n${STATS}\n\nWe lost 1 thief in the operation.\nEarly indications show that our operation was a success. Our thieves have bribed members of our enemies' guild!\n${KD_FOOTER}`;
  const r = parseRob(text, url, "TestProvince");
  assert.ok(r);
  assert.equal(r.op, "bribe_thieves");
  assert.equal(r.outcome, "success");
  assert.equal(r.thievesLost, 1);
});

test("parseRob — bribe_thieves failure", () => {
  const url = "https://utopia-game.com/wol/game/thievery?p=320&o=BRIBE_THIEVES&q=134&c=4889";
  const text = `${PREAMBLE}\n\n${STATS}\n\n${FOILED}`;
  const r = parseRob(text, url, "TestProvince");
  assert.ok(r);
  assert.equal(r.op, "bribe_thieves");
  assert.equal(r.outcome, "failure");
  assert.equal(r.thievesLost, 1);
});
