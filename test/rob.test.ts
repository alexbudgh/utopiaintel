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
