import { test } from "node:test";
import assert from "node:assert/strict";
import {
  castlesProtectionFactor,
  estimateBreakability,
  estimateTraditionalMarchAcres,
  incomingRelationGainsFactor,
  kingdomNetworthFactor,
  mapGainsFactor,
  outgoingRelationGainsFactor,
  provinceNetworthFactor,
  siegeScienceFactor,
  warMinimumGainsFloor,
} from "../lib/gains";
import type { ProvinceRow } from "../lib/db";

function makeProvince(overrides: Partial<ProvinceRow>): ProvinceRow {
  return {
    id: 1,
    slot: null,
    name: "TestProvince",
    kingdom: "7:5",
    race: "Orc",
    personality: null,
    honor_title: null,
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
    building_efficiency: null,
    thieves: null,
    thieves_age: null,
    wizards: null,
    resources_age: null,
    resources_source: null,
    hit_status: null,
    status_age: null,
    ome: null,
    dme: null,
    som_age: null,
    sciences_age: null,
    crime_effect: null,
    channeling_effect: null,
    siege_effect: null,
    science_total_books: null,
    survey_age: null,
    watch_towers_effect: null,
    thieves_dens_effect: null,
    castles_effect: null,
    buildings_built: null,
    buildings_in_progress: null,
    armies_out_count: null,
    land_incoming: null,
    earliest_return: null,
    armies_out_json: null,
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

test("mapGainsFactor uses midpoint estimates out of war", () => {
  assert.equal(mapGainsFactor(null, "oow"), 1);
  assert.equal(mapGainsFactor("a little", "oow"), 0.895);
  assert.equal(mapGainsFactor("moderately", "oow"), 0.695);
  assert.equal(mapGainsFactor("pretty heavily", "oow"), 0.495);
  assert.equal(mapGainsFactor("extremely badly", "oow"), 0.245);
});

test("mapGainsFactor uses war values from the MAP guide", () => {
  assert.equal(mapGainsFactor("a little", "war"), 0.895);
  assert.equal(mapGainsFactor("moderately", "war"), 0.8);
  assert.equal(mapGainsFactor("pretty heavily", "war"), 0.8);
  assert.equal(mapGainsFactor("extremely badly", "war"), 0.8);
});

test("castlesProtectionFactor uses direct survey effect", () => {
  assert.equal(castlesProtectionFactor(null), 1);
  assert.equal(castlesProtectionFactor(0), 1);
  assert.equal(castlesProtectionFactor(12), 0.88);
  assert.equal(castlesProtectionFactor(37.5), 0.625);
});

test("warMinimumGainsFloor applies only in war", () => {
  assert.equal(warMinimumGainsFloor(1500, "oow"), 0);
  assert.equal(warMinimumGainsFloor(1500, "war"), 60);
  assert.equal(warMinimumGainsFloor(null, "war"), 0);
});

test("siegeScienceFactor uses direct SoS battle gains effect", () => {
  assert.equal(siegeScienceFactor(null), 1);
  assert.equal(siegeScienceFactor(0), 1);
  assert.equal(siegeScienceFactor(6.4), 1.064);
});

test("relation gains factors match the Relations guide", () => {
  assert.equal(outgoingRelationGainsFactor(null), 1);
  assert.equal(outgoingRelationGainsFactor("Unfriendly"), 1.04);
  assert.equal(outgoingRelationGainsFactor("Hostile"), 1.1);
  assert.equal(incomingRelationGainsFactor(null), 1);
  assert.equal(incomingRelationGainsFactor("Unfriendly"), 1.015);
  assert.equal(incomingRelationGainsFactor("Hostile"), 1.03);
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

test("estimateTraditionalMarchAcres applies MAP out of war", () => {
  const estimate = estimateTraditionalMarchAcres({
    attackerLand: 1000,
    attackerNetworth: 300000,
    defenderLand: 1500,
    defenderNetworth: 300000,
    selfKingdomAvgNetworth: 250000,
    targetKingdomAvgNetworth: 250000,
    defenderHitStatus: "moderately",
    relationState: "oow",
  });

  assert.ok(estimate);
  assert.equal(estimate.mapFactor, 0.695);
  assert.equal(estimate.rawAcres, 125.1);
  assert.equal(estimate.roundedAcres, 125);
  assert.equal(estimate.relationState, "oow");
});

test("estimateTraditionalMarchAcres applies reduced war MAP", () => {
  const estimate = estimateTraditionalMarchAcres({
    attackerLand: 1000,
    attackerNetworth: 300000,
    defenderLand: 1500,
    defenderNetworth: 300000,
    selfKingdomAvgNetworth: 250000,
    targetKingdomAvgNetworth: 250000,
    defenderHitStatus: "extremely badly",
    relationState: "war",
  });

  assert.ok(estimate);
  assert.equal(estimate.mapFactor, 0.8);
  assert.equal(estimate.rawAcres, 144);
  assert.equal(estimate.roundedAcres, 144);
  assert.equal(estimate.relationState, "war");
});

test("estimateTraditionalMarchAcres applies relation modifiers", () => {
  const estimate = estimateTraditionalMarchAcres({
    attackerLand: 1000,
    attackerNetworth: 300000,
    defenderLand: 1500,
    defenderNetworth: 300000,
    selfKingdomAvgNetworth: 250000,
    targetKingdomAvgNetworth: 250000,
    ourAttitudeToThem: "Hostile",
    theirAttitudeToUs: "Unfriendly",
  });

  assert.ok(estimate);
  assert.equal(estimate.ourRelationFactor, 1.1);
  assert.equal(estimate.theirRelationFactor, 1.015);
  assert.equal(estimate.combinedRelationFactor, 1.1165);
  assert.equal(estimate.rawAcres, 200);
  assert.equal(estimate.capApplied, true);
});

test("estimateTraditionalMarchAcres applies direct castles protection", () => {
  const estimate = estimateTraditionalMarchAcres({
    attackerLand: 1000,
    attackerNetworth: 300000,
    defenderLand: 1500,
    defenderNetworth: 300000,
    selfKingdomAvgNetworth: 250000,
    targetKingdomAvgNetworth: 250000,
    defenderCastlesEffect: 12,
  });

  assert.ok(estimate);
  assert.equal(estimate.castlesEffect, 12);
  assert.equal(estimate.castlesFactor, 0.88);
  assert.equal(estimate.rawAcres, 158.4);
  assert.equal(estimate.roundedAcres, 158);
});

test("estimateTraditionalMarchAcres applies the war minimum-gains floor", () => {
  const estimate = estimateTraditionalMarchAcres({
    attackerLand: 1000,
    attackerNetworth: 800000,
    defenderLand: 1500,
    defenderNetworth: 300000,
    selfKingdomAvgNetworth: 250000,
    targetKingdomAvgNetworth: 250000,
    relationState: "war",
  });

  assert.ok(estimate);
  assert.equal(estimate.rpnwFactor, 0);
  assert.equal(estimate.warFloor, 60);
  assert.equal(estimate.warFloorApplied, true);
  assert.equal(estimate.rawAcres, 60);
  assert.equal(estimate.roundedAcres, 60);
});

test("estimateTraditionalMarchAcres applies attacker siege science", () => {
  const estimate = estimateTraditionalMarchAcres({
    attackerLand: 1000,
    attackerNetworth: 300000,
    defenderLand: 1500,
    defenderNetworth: 300000,
    selfKingdomAvgNetworth: 250000,
    targetKingdomAvgNetworth: 250000,
    attackerSiegeEffect: 6.4,
  });

  assert.ok(estimate);
  assert.equal(estimate.siegeEffect, 6.4);
  assert.equal(estimate.siegeFactor, 1.064);
  assert.equal(estimate.rawAcres, 191.52);
  assert.equal(estimate.roundedAcres, 192);
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
