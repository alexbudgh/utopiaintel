import { test } from "node:test";
import assert from "node:assert/strict";
import { parseAttack } from "../lib/parsers/attack";

const PREAMBLE = `You enter your War Room. Surrounded by your most highly ranked military commanders, you stand ready to give orders to your troops. However, like most military commanders, none are willing to offer their advice. The decisions you make must be your own.

You can learn more about attack options from the guide, and read a report on your current military status on the Military Council page.`;

const FORM_FOOTER = `Deployable Generals\t3\tMercenary Cost\t167 gold coins\nMercenary Rate\tOne per 5.0 Troops
Target kingdom is Time For A Book (3:9)
Target Province\t\nSelect Attack Type\t`;

// Traditional March success variants
test("parseAttack — TM success with prisoners and buildings", () => {
  const text = `${PREAMBLE}
Your forces arrive at The Illuminae Files (3:9). A tough battle took place, but we have managed a victory! Your army has taken 30 acres! 15 acres of buildings survived and can be refitted to fit our needs. We also gained 52 specialist training credits. 154 peasants settled on your new lands.
We lost 63 Swordsmen and 63 horses in this battle.
We killed about 33 enemy troops. We also imprisoned 65 additional troops in our Dungeons.
Our forces will be available again in 10.90 days (on May 21 of YR0).
${FORM_FOOTER}`;
  const r = parseAttack(text, "TestProvince");
  assert.ok(r);
  assert.equal(r.attackType, "traditional_march");
  assert.equal(r.outcome, "success");
  assert.equal(r.targetName, "The Illuminae Files");
  assert.equal(r.targetKingdom, "3:9");
  assert.equal(r.acresTaken, 30);
  assert.equal(r.buildingsSurvived, 15);
  assert.equal(r.specialistCredits, 52);
  assert.equal(r.peasantsSettled, 154);
  assert.equal(r.enemyKilled, 33);
  assert.equal(r.enemyImprisoned, 65);
  assert.ok(Math.abs((r.returnDays ?? 0) - 10.90) < 0.001);
  assert.equal(r.name, "TestProvince");
  assert.equal(r.kingdom, "");
});

test("parseAttack — TM success no prisoners", () => {
  const text = `${PREAMBLE}
Your forces arrive at The Cay (3:9). A tough battle took place, but we have managed a victory! Your army has taken 20 acres! 12 acres of buildings survived and can be refitted to fit our needs. We also gained 29 specialist training credits. 49 peasants settled on your new lands.
We lost 29 Warriors and 29 horses in this battle.
We killed about 19 enemy troops.
Our forces will be available again in 11.47 days (on May 23 of YR0).`;
  const r = parseAttack(text, "TestProvince");
  assert.ok(r);
  assert.equal(r.attackType, "traditional_march");
  assert.equal(r.acresTaken, 20);
  assert.equal(r.enemyImprisoned, null);
  assert.ok(Math.abs((r.returnDays ?? 0) - 11.47) < 0.001);
});

test("parseAttack — TM success 'emerged victorious' variant", () => {
  const text = `${PREAMBLE}
Your forces arrive at Blacktongue Thief (3:9). Our army has emerged victorious on the battlefield! Your army has taken 7 acres! 1 acre of buildings survived and can be refitted to fit our needs. We also gained 2 specialist training credits. 27 peasants settled on your new lands.
We lost 28 soldiers and 28 horses in this battle.
We killed about 3 enemy troops. We also imprisoned 7 additional troops in our Dungeons.
Our forces will be available again in 14.79 days (on June 15 of YR0).`;
  const r = parseAttack(text, "TestProvince");
  assert.ok(r);
  assert.equal(r.attackType, "traditional_march");
  assert.equal(r.outcome, "success");
  assert.equal(r.acresTaken, 7);
  assert.equal(r.buildingsSurvived, 1);
});

test("parseAttack — TM success with comma in acres", () => {
  const text = `${PREAMBLE}
Your forces arrive at Time for PL-SQL (3:9). A tough battle took place, but we have managed a victory! Your army has taken 1,200 acres! 600 acres of buildings survived and can be refitted to fit our needs. We also gained 195 specialist training credits. 403 peasants settled on your new lands.
We lost 61 Skeletons and 61 horses in this battle.
We killed about 78 enemy troops. We also imprisoned 155 additional troops in our Dungeons.
Our forces will be available again in 15.48 days (on June 15 of YR0).`;
  const r = parseAttack(text, "TestProvince");
  assert.ok(r);
  assert.equal(r.acresTaken, 1200);
  assert.equal(r.buildingsSurvived, 600);
});

// Ambush
test("parseAttack — ambush (recaptured acres)", () => {
  const text = `${PREAMBLE}
Only through a complete breach of the enemy's defenses will our ability be unleashed!
Your forces arrive at The Illuminae Files (3:9). A tough battle took place, but we have managed a victory! Your army has recaptured 30 acres from our enemy! Taking full control of our new land will take 8.20 days, and will be available on May 20 of YR0.
We lost 29 Skeletons and 29 horses in this battle.
We killed about 37 enemy troops. We also imprisoned 70 additional troops in our Dungeons.
Our forces will be available again in 8.20 days (on May 20 of YR0).`;
  const r = parseAttack(text, "TestProvince");
  assert.ok(r);
  assert.equal(r.attackType, "ambush");
  assert.equal(r.outcome, "success");
  assert.equal(r.acresTaken, 30);
  assert.equal(r.enemyKilled, 37);
  assert.equal(r.enemyImprisoned, 70);
  assert.ok(Math.abs((r.returnDays ?? 0) - 8.20) < 0.001);
  // No specialist credits or peasants for ambush
  assert.equal(r.specialistCredits, null);
  assert.equal(r.peasantsSettled, null);
});

test("parseAttack — selected attack type wins when present", () => {
  const text = `${PREAMBLE}
Your forces arrive at The Illuminae Files (3:9). A tough battle took place, but we have managed a victory! Your army has taken 30 acres!
Our forces will be available again in 10.90 days (on May 21 of YR0).
Deployable Generals\t3
Target kingdom is Time For A Book (3:9)
Target Province\t3 The Illuminae Files --- ( 90% )
Select Attack Type\tConquest
Modify Attack Time\t0 hours`;
  const r = parseAttack(text, "TestProvince");
  assert.ok(r);
  assert.equal(r.attackType, "conquest");
});

test("parseAttack — massacre result wins over trailing form selection", () => {
  const text = `${PREAMBLE}
Your forces arrive at Blacktongue Thief (3:9). A tough battle took place, but we have managed a victory! Your army massacred 434 peasants, thieves, and wizards!
We lost 12 soldiers, 103 Swordsmen and 13 Knights in this battle.
We killed about 46 enemy troops. We also imprisoned 98 additional troops in our Dungeons.
Our forces will be available again in 13.34 days (on March 24 of YR0).
Deployable Generals\t3
Target kingdom is Time For A Book (3:9)
Target Province\t3 Blacktongue Thief --- ( 37% )
Select Attack Type\tTraditional March
Modify Attack Time\t0 hours`;
  const r = parseAttack(text, "TestProvince");
  assert.ok(r);
  assert.equal(r.attackType, "massacre");
  assert.equal(r.massacred, 434);
  assert.equal(r.acresTaken, null);
  assert.ok(Math.abs((r.returnDays ?? 0) - 13.34) < 0.001);
});

// Failure
test("parseAttack — failure suffered defeat", () => {
  const text = `${PREAMBLE}
Your forces arrive at The Illuminae Files (3:9). A tough battle took place, but we suffered defeat.
We lost 50 Swordsmen and 40 horses in this battle.
Our forces will be available again in 10.90 days (on May 21 of YR0).`;
  const r = parseAttack(text, "TestProvince");
  assert.ok(r);
  assert.equal(r.outcome, "failure");
  assert.equal(r.attackType, "unknown");
  assert.equal(r.acresTaken, null);
  assert.equal(r.targetName, "The Illuminae Files");
  assert.equal(r.targetKingdom, "3:9");
});

// Sitter URL
test("parseAttack — sitter URL result", () => {
  const text = `${PREAMBLE}
Your forces arrive at The Sum of All Fears (3:9). A tough battle took place, but we have managed a victory! Your army has taken 31 acres! 14 acres of buildings survived and can be refitted to fit our needs. We also gained 39 specialist training credits. 117 peasants settled on your new lands.
We lost 40 Skeletons and 34 horses in this battle.
We killed about 19 enemy troops. We also imprisoned 36 additional troops in our Dungeons.
Our forces will be available again in 11.48 days (on May 23 of YR0).`;
  const r = parseAttack(text, "TestProvince");
  assert.ok(r);
  assert.equal(r.targetName, "The Sum of All Fears");
  assert.equal(r.targetKingdom, "3:9");
  assert.equal(r.acresTaken, 31);
});

// Form pages
test("parseAttack — form page (no result) returns null", () => {
  const text = `${PREAMBLE}\n${FORM_FOOTER}`;
  const r = parseAttack(text, "TestProvince");
  assert.equal(r, null);
});

test("parseAttack — no selfProv returns null", () => {
  const text = `${PREAMBLE}
Your forces arrive at The Illuminae Files (3:9). A tough battle took place, but we have managed a victory! Your army has taken 30 acres!
Our forces will be available again in 10.90 days (on May 21 of YR0).`;
  const r = parseAttack(text, undefined);
  assert.equal(r, null);
});
