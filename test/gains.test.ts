import { test } from "node:test";
import assert from "node:assert/strict";
import { estimateBreakability, estimateTraditionalMarchAcres, kingdomNetworthFactor, provinceNetworthFactor } from "../lib/gains.ts";
import type { ProvinceRow } from "../lib/db.ts";

function makeProvince(overrides: Partial<ProvinceRow>): ProvinceRow {
  return {
    id: 1,
    name: "TestProvince",
    kingdom: "7:5",
    race: "Orc",
    personality: null,
    land: 1000,
    networth: 300000,
    overview_age: null,
    overview_source: null,
    off_points: null,
    def_points: null,
    military_age: null,
    soldiers: null,
    off_specs: null,
    def_specs: null,
    elites: null,
    war_horses: null,
    peasants: null,
    troops_age: null,
    troops_source: null,
    soldiers_home: null,
    off_specs_home: null,
    def_specs_home: null,
    elites_home: null,
    troops_home_age: null,
    off_home: null,
    def_home: null,
    home_mil_age: null,
    money: null,
    food: null,
    runes: null,
    prisoners: null,
    trade_balance: null,
    thieves: null,
    thieves_age: null,
    wizards: null,
    resources_age: null,
    resources_source: null,
    ome: null,
    dme: null,
    som_age: null,
    sciences_age: null,
    crime_effect: null,
    channeling_effect: null,
    science_total_books: null,
    survey_age: null,
    watch_towers_effect: null,
    thieves_dens_effect: null,
    buildings_built: null,
    buildings_in_progress: null,
    ...overrides,
  };
}

test("provinceNetworthFactor matches the guide breakpoints", () => {
  assert.equal(provinceNetworthFactor(0.5), 0);
  assert.ok(Math.abs(provinceNetworthFactor(0.8) - 0.7) < 1e-9);
  assert.equal(provinceNetworthFactor(1.0), 1);
  assert.ok(Math.abs(provinceNetworthFactor(1.4) - 0.4) < 1e-9);
  assert.equal(provinceNetworthFactor(1.7), 0);
});

test("kingdomNetworthFactor matches the guide breakpoints", () => {
  assert.equal(kingdomNetworthFactor(0.4), 0.8);
  assert.equal(kingdomNetworthFactor(0.8), 0.9500000000000001);
  assert.equal(kingdomNetworthFactor(1.0), 1);
});

test("estimateTraditionalMarchAcres applies base formula and cap", () => {
  const estimate = estimateTraditionalMarchAcres({
    attackerLand: 1000,
    attackerNetworth: 300000,
    defenderLand: 1500,
    defenderNetworth: 300000,
    selfKingdomAvgNetworth: 250000,
    targetKingdomAvgNetworth: 250000,
  });

  assert.ok(estimate);
  assert.equal(estimate.rawAcres, 180);
  assert.equal(estimate.roundedAcres, 180);
  assert.equal(estimate.cap, 200);
  assert.equal(estimate.capApplied, false);
});

test("estimateTraditionalMarchAcres caps oversized gains", () => {
  const estimate = estimateTraditionalMarchAcres({
    attackerLand: 600,
    attackerNetworth: 300000,
    defenderLand: 2000,
    defenderNetworth: 300000,
    selfKingdomAvgNetworth: 250000,
    targetKingdomAvgNetworth: 250000,
  });

  assert.ok(estimate);
  assert.equal(estimate.rawAcres, 120);
  assert.equal(estimate.roundedAcres, 120);
  assert.equal(estimate.capApplied, true);
});

test("estimateTraditionalMarchAcres returns null when required values are missing", () => {
  assert.equal(estimateTraditionalMarchAcres({
    attackerLand: null,
    attackerNetworth: 300000,
    defenderLand: 1200,
    defenderNetworth: 280000,
    selfKingdomAvgNetworth: 250000,
    targetKingdomAvgNetworth: 240000,
  }), null);
});

test("estimateBreakability prefers home offense and home defense", () => {
  const attacker = makeProvince({ off_home: 120000, off_points: 140000 });
  const defender = makeProvince({ def_home: 110000, def_points: 100000 });
  const result = estimateBreakability(attacker, defender);

  assert.equal(result.status, "breakable");
  assert.equal(result.offense, 120000);
  assert.equal(result.defense, 110000);
  assert.equal(result.offenseSource, "off_home");
  assert.equal(result.defenseSource, "def_home");
});

test("estimateBreakability falls back to total values when home values are missing", () => {
  const attacker = makeProvince({ off_points: 98000 });
  const defender = makeProvince({ def_points: 102000 });
  const result = estimateBreakability(attacker, defender);

  assert.equal(result.status, "not_breakable");
  assert.equal(result.offenseSource, "off_points");
  assert.equal(result.defenseSource, "def_points");
});

test("estimateBreakability returns unknown when required values are missing", () => {
  const attacker = makeProvince({});
  const result = estimateBreakability(attacker, null);

  assert.equal(result.status, "unknown");
  assert.equal(result.offenseSource, null);
  assert.equal(result.defenseSource, null);
});
