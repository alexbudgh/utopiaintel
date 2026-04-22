import { test } from "node:test";
import assert from "node:assert/strict";
import { computeCell, NIGHT_STRIKE_UNITS, OPS } from "../lib/thievery";
import type { ProvinceRow } from "../lib/db";

function assertApprox(actual: number, expected: number, epsilon = 0.01, message?: string): void {
  assert.ok(
    Math.abs(actual - expected) < epsilon,
    message ?? `expected ${actual} to be within ${epsilon} of ${expected}`,
  );
}

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
    throne_age: null,
    sciences_age: null,
    crime_effect: null,
    channeling_effect: null,
    siege_effect: null,
    science_total_books: null,
    survey_age: null,
    watch_towers_effect: null,
    thieves_dens_effect: null,
    castles_effect: null,
    housing_effect: null,
    barren_land: null,
    homes_built: null,
    total_pop: null,
    max_pop: null,
    buildings_built: null,
    buildings_in_progress: null,
    armies_out_count: null,
    land_incoming: null,
    earliest_return: null,
    som_armies_json: null,
    throne_armies_json: null,
    armies_out_json: null,
    shielding_effect: null,
    free_specialist_credits: null,
    free_specialist_credits_age: null,
    free_building_credits: null,
    free_building_credits_age: null,
    ...overrides,
  };
}

// --- OPS cap rates ---

test("computeCell — vaults OOW cap is 5.2%", () => {
  const att = makeProvince({ networth: 100000 });
  const def = makeProvince({ money: 100000, networth: 100000 });
  const r = computeCell(att, def, "vaults", false);
  assertApprox(r.rawCap!, 5200);
});

test("computeCell — vaults war cap is 14%", () => {
  const att = makeProvince({ networth: 100000 });
  const def = makeProvince({ money: 100000, networth: 100000 });
  const r = computeCell(att, def, "vaults", true);
  assertApprox(r.rawCap!, 14000);
});

test("computeCell — granaries OOW cap is 31.5%", () => {
  const att = makeProvince({ networth: 100000 });
  const def = makeProvince({ food: 100000, networth: 100000 });
  const r = computeCell(att, def, "granaries", false);
  assertApprox(r.rawCap!, 31500);
});

test("computeCell — granaries war cap is 46%", () => {
  const att = makeProvince({ networth: 100000 });
  const def = makeProvince({ food: 100000, networth: 100000 });
  const r = computeCell(att, def, "granaries", true);
  assertApprox(r.rawCap!, 46000);
});

test("computeCell — towers OOW cap is 24.5%", () => {
  const att = makeProvince({ networth: 100000 });
  const def = makeProvince({ runes: 100000, networth: 100000 });
  const r = computeCell(att, def, "towers", false);
  assertApprox(r.rawCap!, 24500);
});

test("computeCell — towers war cap is 35%", () => {
  const att = makeProvince({ networth: 100000 });
  const def = makeProvince({ runes: 100000, networth: 100000 });
  const r = computeCell(att, def, "towers", true);
  assertApprox(r.rawCap!, 35000);
});

// --- NW ratio ---

test("computeCell — NW ratio is min(att/def, def/att)", () => {
  const att = makeProvince({ networth: 80000 });
  const def = makeProvince({ money: 100000, networth: 200000 });
  const r = computeCell(att, def, "vaults", false);
  // min(80k/200k, 200k/80k) = min(0.4, 2.5) = 0.4
  assertApprox(r.nwRatio!, 0.4, 1e-9);
});

test("computeCell — NW ratio is symmetric (larger attacker)", () => {
  const att = makeProvince({ networth: 200000 });
  const def = makeProvince({ money: 100000, networth: 80000 });
  const r = computeCell(att, def, "vaults", false);
  // min(200k/80k, 80k/200k) = min(2.5, 0.4) = 0.4
  assertApprox(r.nwRatio!, 0.4, 1e-9);
});

test("computeCell — NW ratio defaults to 1.0 when attacker NW is null", () => {
  const att = makeProvince({ networth: null });
  const def = makeProvince({ money: 100000, networth: 200000 });
  const r = computeCell(att, def, "vaults", false);
  assert.equal(r.nwRatio, null);
  // value should use 1.0 in place of ratio
  assertApprox(r.value!, r.rawCap!);
});

test("computeCell — NW ratio defaults to 1.0 when defender NW is null", () => {
  const att = makeProvince({ networth: 100000 });
  const def = makeProvince({ money: 100000, networth: null });
  const r = computeCell(att, def, "vaults", false);
  assert.equal(r.nwRatio, null);
  assertApprox(r.value!, r.rawCap!);
});

// --- Shielding and watchtowers ---

test("computeCell — shielding reduces value", () => {
  const att = makeProvince({ networth: 100000 });
  const def = makeProvince({ money: 100000, networth: 100000, shielding_effect: 20 });
  const r = computeCell(att, def, "vaults", false);
  assertApprox(r.shieldingFactor, 0.8, 1e-9);
  assertApprox(r.value!, 5200 * 0.8);
});

test("computeCell — watchtowers reduce value", () => {
  const att = makeProvince({ networth: 100000 });
  const def = makeProvince({ money: 100000, networth: 100000, watch_towers_effect: 10 });
  const r = computeCell(att, def, "vaults", false);
  assertApprox(r.watchtowersFactor, 0.9, 1e-9);
  assertApprox(r.value!, 5200 * 0.9);
});

test("computeCell — shielding and watchtowers stack multiplicatively", () => {
  const att = makeProvince({ networth: 100000 });
  const def = makeProvince({ money: 100000, networth: 100000, shielding_effect: 20, watch_towers_effect: 10 });
  const r = computeCell(att, def, "vaults", false);
  assertApprox(r.value!, 5200 * 0.8 * 0.9);
});

test("computeCell — missing shielding data defaults shieldingFactor to 1.0", () => {
  const att = makeProvince({ networth: 100000 });
  const def = makeProvince({ money: 100000, networth: 100000, shielding_effect: null });
  const r = computeCell(att, def, "vaults", false);
  assert.equal(r.shieldingFactor, 1);
});

test("computeCell — missing watchtowers data defaults watchtowersFactor to 1.0", () => {
  const att = makeProvince({ networth: 100000 });
  const def = makeProvince({ money: 100000, networth: 100000, watch_towers_effect: null });
  const r = computeCell(att, def, "vaults", false);
  assert.equal(r.watchtowersFactor, 1);
});

// --- Null resource ---

test("computeCell — returns null value when defender resource is null", () => {
  const att = makeProvince({ networth: 100000 });
  const def = makeProvince({ money: null, networth: 100000 });
  const r = computeCell(att, def, "vaults", false);
  assert.equal(r.value, null);
  assert.equal(r.rawCap, null);
  assert.equal(r.nwRatio, null);
});

// --- Full formula ---

test("computeCell — full formula: rawCap × nwRatio × shielding × watchtowers", () => {
  const att = makeProvince({ networth: 80000 });
  const def = makeProvince({
    money: 200000,
    networth: 200000,
    shielding_effect: 10,
    watch_towers_effect: 5,
  });
  const r = computeCell(att, def, "vaults", false);
  const expectedRawCap = 200000 * OPS.vaults.capOow; // 10400
  const expectedNwRatio = Math.min(80000 / 200000, 200000 / 80000); // 0.4
  const expectedValue = expectedRawCap * expectedNwRatio * 0.9 * 0.95;
  assertApprox(r.value!, expectedValue);
});

// --- Night Strike ---

test("computeCell — Night Strike war formula applies per-unit caps and rates", () => {
  const att = makeProvince({ thieves: 10000, networth: 100000 });
  const def = makeProvince({
    networth: 100000,
    soldiers: 100000,
    off_specs: 50000,
    def_specs: 40000,
    elites: 30000,
  });
  const r = computeCell(att, def, "night_strike", true);
  const soldiersCap = 100000 * NIGHT_STRIKE_UNITS.soldiers.warCap;
  const offSpecsCap = 50000 * NIGHT_STRIKE_UNITS.off_specs.warCap;
  const defSpecsCap = 40000 * NIGHT_STRIKE_UNITS.def_specs.warCap;
  const elitesCap = 30000 * NIGHT_STRIKE_UNITS.elites.warCap;
  const soldiersActual = Math.min(soldiersCap, 10000 * NIGHT_STRIKE_UNITS.soldiers.warRate);
  const offSpecsActual = Math.min(offSpecsCap, 10000 * NIGHT_STRIKE_UNITS.off_specs.warRate);
  const defSpecsActual = Math.min(defSpecsCap, 10000 * NIGHT_STRIKE_UNITS.def_specs.warRate);
  const elitesActual = Math.min(elitesCap, 10000 * NIGHT_STRIKE_UNITS.elites.warRate);
  assert.equal(r.kind, "night_strike");
  assert.ok(r.nightStrike);
  assertApprox(r.nightStrike!.capValue!, soldiersCap + offSpecsCap + defSpecsCap + elitesCap);
  assertApprox(r.nightStrike!.actualValue!, soldiersActual + offSpecsActual + defSpecsActual + elitesActual);
  assertApprox(r.value!, r.nightStrike!.actualValue!);
});

test("computeCell — Night Strike out-of-war soldier formula uses OOW values", () => {
  const att = makeProvince({ thieves: 1000, networth: 100000 });
  const def = makeProvince({ soldiers: 10000, networth: 100000 });
  const r = computeCell(att, def, "night_strike", false);
  const expectedCap = 10000 * NIGHT_STRIKE_UNITS.soldiers.oowCap!;
  const expectedActual = Math.min(expectedCap, 1000 * NIGHT_STRIKE_UNITS.soldiers.oowRate!);
  assert.equal(r.kind, "night_strike");
  const soldiers = r.nightStrike!.breakdown.find((unit) => unit.key === "soldiers")!;
  assertApprox(soldiers.rawCap!, expectedCap);
  assertApprox(soldiers.rawActual!, expectedActual);
});

test("computeCell — Night Strike OOW specialists use fallback values when guide is incomplete", () => {
  const att = makeProvince({ thieves: 1000, networth: 100000 });
  const def = makeProvince({
    networth: 100000,
    off_specs: 10000,
    def_specs: 10000,
    elites: 10000,
  });
  const r = computeCell(att, def, "night_strike", false);
  assert.equal(r.kind, "night_strike");
  const offSpecs = r.nightStrike!.breakdown.find((unit) => unit.key === "off_specs")!;
  const defSpecs = r.nightStrike!.breakdown.find((unit) => unit.key === "def_specs")!;
  const elites = r.nightStrike!.breakdown.find((unit) => unit.key === "elites")!;
  const offSpecsCap = 10000 * NIGHT_STRIKE_UNITS.off_specs.warCap;
  const offSpecsActual = Math.min(offSpecsCap, 1000 * NIGHT_STRIKE_UNITS.off_specs.oowRate!);
  const defSpecsCap = 10000 * NIGHT_STRIKE_UNITS.def_specs.warCap;
  const defSpecsActual = Math.min(defSpecsCap, 1000 * NIGHT_STRIKE_UNITS.def_specs.warRate);
  const elitesCap = 10000 * NIGHT_STRIKE_UNITS.elites.warCap;
  const elitesActual = Math.min(elitesCap, 1000 * NIGHT_STRIKE_UNITS.elites.warRate);
  assert.equal(offSpecs.usedFallback, true);
  assertApprox(offSpecs.rawCap!, offSpecsCap);
  assertApprox(offSpecs.rawActual!, offSpecsActual);
  assert.equal(defSpecs.usedFallback, true);
  assertApprox(defSpecs.rawCap!, defSpecsCap);
  assertApprox(defSpecs.rawActual!, defSpecsActual);
  assert.equal(elites.usedFallback, true);
  assertApprox(elites.rawCap!, elitesCap);
  assertApprox(elites.rawActual!, elitesActual);
});

test("computeCell — Night Strike applies NW ratio, shielding, and watchtowers multiplicatively", () => {
  const att = makeProvince({ thieves: 10000, networth: 80000 });
  const def = makeProvince({
    networth: 200000,
    soldiers: 10000,
    shielding_effect: 10,
    watch_towers_effect: 5,
  });
  const r = computeCell(att, def, "night_strike", false);
  const soldiers = r.nightStrike!.breakdown.find((unit) => unit.key === "soldiers")!;
  const expected = 10000 * NIGHT_STRIKE_UNITS.soldiers.oowCap! * 0.4 * 0.9 * 0.95;
  assertApprox(soldiers.adjustedCap!, expected);
  assertApprox(r.value!, expected);
});

test("computeCell — Night Strike falls back to cap total when attacker thieves are unknown", () => {
  const att = makeProvince({ thieves: null, networth: 100000 });
  const def = makeProvince({ networth: 100000, soldiers: 10000 });
  const r = computeCell(att, def, "night_strike", false);
  const expectedCap = 10000 * NIGHT_STRIKE_UNITS.soldiers.oowCap!;
  assert.equal(r.kind, "night_strike");
  assert.equal(r.nightStrike!.actualValue, null);
  assertApprox(r.nightStrike!.capValue!, expectedCap);
  assertApprox(r.value!, expectedCap);
});

test("computeCell — Night Strike returns partial totals when some target troop counts are missing", () => {
  const att = makeProvince({ thieves: 10000, networth: 100000 });
  const def = makeProvince({
    networth: 100000,
    soldiers: 10000,
    off_specs: null,
    def_specs: 10000,
    elites: null,
  });
  const r = computeCell(att, def, "night_strike", true);
  const expectedSoldiers = 10000 * NIGHT_STRIKE_UNITS.soldiers.warCap;
  const expectedDefSpecs = 10000 * NIGHT_STRIKE_UNITS.def_specs.warCap;
  assert.equal(r.kind, "night_strike");
  assert.equal(r.nightStrike!.partial, true);
  assertApprox(r.nightStrike!.capValue!, expectedSoldiers + expectedDefSpecs);
  assertApprox(r.value!, expectedSoldiers + expectedDefSpecs);
});
