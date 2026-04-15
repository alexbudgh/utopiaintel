import { test } from "node:test";
import assert from "node:assert/strict";
import { computeCell, OPS } from "../lib/thievery";
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
  assert.ok(Math.abs(r.rawCap! - 5200) < 0.01);
});

test("computeCell — vaults war cap is 14%", () => {
  const att = makeProvince({ networth: 100000 });
  const def = makeProvince({ money: 100000, networth: 100000 });
  const r = computeCell(att, def, "vaults", true);
  assert.ok(Math.abs(r.rawCap! - 14000) < 0.01);
});

test("computeCell — granaries OOW cap is 31.5%", () => {
  const att = makeProvince({ networth: 100000 });
  const def = makeProvince({ food: 100000, networth: 100000 });
  const r = computeCell(att, def, "granaries", false);
  assert.ok(Math.abs(r.rawCap! - 31500) < 0.01);
});

test("computeCell — granaries war cap is 46%", () => {
  const att = makeProvince({ networth: 100000 });
  const def = makeProvince({ food: 100000, networth: 100000 });
  const r = computeCell(att, def, "granaries", true);
  assert.ok(Math.abs(r.rawCap! - 46000) < 0.01);
});

test("computeCell — towers OOW cap is 24.5%", () => {
  const att = makeProvince({ networth: 100000 });
  const def = makeProvince({ runes: 100000, networth: 100000 });
  const r = computeCell(att, def, "towers", false);
  assert.ok(Math.abs(r.rawCap! - 24500) < 0.01);
});

test("computeCell — towers war cap is 35%", () => {
  const att = makeProvince({ networth: 100000 });
  const def = makeProvince({ runes: 100000, networth: 100000 });
  const r = computeCell(att, def, "towers", true);
  assert.ok(Math.abs(r.rawCap! - 35000) < 0.01);
});

// --- NW ratio ---

test("computeCell — NW ratio is min(att/def, def/att)", () => {
  const att = makeProvince({ networth: 80000 });
  const def = makeProvince({ money: 100000, networth: 200000 });
  const r = computeCell(att, def, "vaults", false);
  // min(80k/200k, 200k/80k) = min(0.4, 2.5) = 0.4
  assert.ok(Math.abs(r.nwRatio! - 0.4) < 1e-9);
});

test("computeCell — NW ratio is symmetric (larger attacker)", () => {
  const att = makeProvince({ networth: 200000 });
  const def = makeProvince({ money: 100000, networth: 80000 });
  const r = computeCell(att, def, "vaults", false);
  // min(200k/80k, 80k/200k) = min(2.5, 0.4) = 0.4
  assert.ok(Math.abs(r.nwRatio! - 0.4) < 1e-9);
});

test("computeCell — NW ratio defaults to 1.0 when attacker NW is null", () => {
  const att = makeProvince({ networth: null });
  const def = makeProvince({ money: 100000, networth: 200000 });
  const r = computeCell(att, def, "vaults", false);
  assert.equal(r.nwRatio, null);
  // value should use 1.0 in place of ratio
  assert.ok(Math.abs(r.value! - r.rawCap!) < 0.01);
});

test("computeCell — NW ratio defaults to 1.0 when defender NW is null", () => {
  const att = makeProvince({ networth: 100000 });
  const def = makeProvince({ money: 100000, networth: null });
  const r = computeCell(att, def, "vaults", false);
  assert.equal(r.nwRatio, null);
  assert.ok(Math.abs(r.value! - r.rawCap!) < 0.01);
});

// --- Shielding and watchtowers ---

test("computeCell — shielding reduces value", () => {
  const att = makeProvince({ networth: 100000 });
  const def = makeProvince({ money: 100000, networth: 100000, shielding_effect: 20 });
  const r = computeCell(att, def, "vaults", false);
  assert.ok(Math.abs(r.shieldingFactor - 0.8) < 1e-9);
  assert.ok(Math.abs(r.value! - 5200 * 0.8) < 0.01);
});

test("computeCell — watchtowers reduce value", () => {
  const att = makeProvince({ networth: 100000 });
  const def = makeProvince({ money: 100000, networth: 100000, watch_towers_effect: 10 });
  const r = computeCell(att, def, "vaults", false);
  assert.ok(Math.abs(r.watchtowersFactor - 0.9) < 1e-9);
  assert.ok(Math.abs(r.value! - 5200 * 0.9) < 0.01);
});

test("computeCell — shielding and watchtowers stack multiplicatively", () => {
  const att = makeProvince({ networth: 100000 });
  const def = makeProvince({ money: 100000, networth: 100000, shielding_effect: 20, watch_towers_effect: 10 });
  const r = computeCell(att, def, "vaults", false);
  assert.ok(Math.abs(r.value! - 5200 * 0.8 * 0.9) < 0.01);
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
  assert.ok(Math.abs(r.value! - expectedValue) < 0.01);
});
