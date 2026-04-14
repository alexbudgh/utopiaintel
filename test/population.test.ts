import { test } from "node:test";
import assert from "node:assert/strict";
import { estimatePop } from "../lib/population";
import type { PopInputs } from "../lib/population";

function makeInputs(overrides: Partial<PopInputs>): PopInputs {
  return {
    race: null,
    honor_title: null,
    barren_land: null,
    homes_built: null,
    buildings_built: null,
    buildings_in_progress: null,
    survey_age: null,
    housing_effect: null,
    sciences_age: null,
    networth: null,
    land: null,
    peasants: null,
    soldiers: null,
    off_specs: null,
    def_specs: null,
    elites: null,
    war_horses: null,
    money: null,
    thieves: null,
    thieves_age: null,
    wizards: null,
    prisoners: null,
    troops_age: null,
    resources_age: null,
    training_off_specs: null,
    training_def_specs: null,
    training_elites: null,
    training_thieves: null,
    som_age: null,
    science_total_books: null,
    ...overrides,
  };
}

// Shared tick timestamps for same-tick checks
const T1 = "2026-01-01 01:00:00";

test("estimatePop — maxPop: base formula (built×25 + barren×15 + homes×10)", () => {
  const { maxPop } = estimatePop(makeInputs({
    buildings_built: 500,   // 500 built acres (includes 100 homes)
    homes_built: 100,
    barren_land: 200,
    buildings_in_progress: 0,
    housing_effect: 0,
    survey_age: T1,
    sciences_age: T1,
  }));
  // rawCap = 500×25 + 0×25 + 200×15 + 100×10 = 12500 + 3000 + 1000 = 16500
  assert.equal(maxPop, 16500);
});

test("estimatePop — maxPop: buildings_in_progress adds to capacity", () => {
  const { maxPop } = estimatePop(makeInputs({
    buildings_built: 500,
    homes_built: 100,
    barren_land: 0,
    buildings_in_progress: 200,
    housing_effect: 0,
    survey_age: T1,
    sciences_age: T1,
  }));
  // rawCap = 500×25 + 200×25 + 0×15 + 100×10 = 12500 + 5000 + 1000 = 18500
  assert.equal(maxPop, 18500);
});

test("estimatePop — maxPop: housing science multiplier applied", () => {
  const { maxPop } = estimatePop(makeInputs({
    buildings_built: 1000,
    homes_built: 0,
    barren_land: 0,
    buildings_in_progress: 0,
    housing_effect: 10,   // +10%
    survey_age: T1,
    sciences_age: T1,
  }));
  // rawCap = 1000×25 = 25000; ×1.10 = 27500
  assert.equal(maxPop, 27500);
});

test("estimatePop — maxPop: Halfling race factor 1.1×", () => {
  const { maxPop } = estimatePop(makeInputs({
    race: "Halfling",
    buildings_built: 1000,
    homes_built: 0,
    barren_land: 0,
    buildings_in_progress: 0,
    housing_effect: 0,
    survey_age: T1,
    sciences_age: T1,
  }));
  // 1000×25 = 25000; ×1.1 = 27500
  assert.equal(maxPop, 27500);
});

test("estimatePop — maxPop: honor title multiplier (Duke = 1.10×)", () => {
  const { maxPop } = estimatePop(makeInputs({
    honor_title: "Duke",
    buildings_built: 1000,
    homes_built: 0,
    barren_land: 0,
    buildings_in_progress: 0,
    housing_effect: 0,
    survey_age: T1,
    sciences_age: T1,
  }));
  // 1000×25 = 25000; ×1.10 = 27500
  assert.equal(maxPop, 27500);
});

test("estimatePop — maxPop: all multipliers stack", () => {
  const { maxPop } = estimatePop(makeInputs({
    race: "Halfling",
    honor_title: "Knight",   // 1.01
    buildings_built: 1000,
    homes_built: 200,
    barren_land: 100,
    buildings_in_progress: 50,
    housing_effect: 13.2,
    survey_age: T1,
    sciences_age: T1,
  }));
  // rawCap = 1000×25 + 50×25 + 100×15 + 200×10 = 25000 + 1250 + 1500 + 2000 = 29750
  // ×1.1 (Halfling) × 1.132 (housing) × 1.01 (Knight)
  const expected = Math.round(29750 * 1.1 * 1.132 * 1.01);
  assert.equal(maxPop, expected);
});

test("estimatePop — maxPop: null when survey missing", () => {
  const { maxPop, needsForMax } = estimatePop(makeInputs({
    housing_effect: 10,
    sciences_age: T1,
  }));
  assert.equal(maxPop, null);
  assert.ok(needsForMax.some((s) => s.includes("Survey")));
});

test("estimatePop — maxPop: null when housing missing", () => {
  const { maxPop, needsForMax } = estimatePop(makeInputs({
    buildings_built: 500,
    homes_built: 0,
    barren_land: 0,
    survey_age: T1,
  }));
  assert.equal(maxPop, null);
  assert.ok(needsForMax.some((s) => s.includes("SoS")));
});

test("estimatePop — maxPop: null when survey and SoS are different ticks", () => {
  const { maxPop, needsForMax } = estimatePop(makeInputs({
    buildings_built: 500,
    homes_built: 0,
    barren_land: 0,
    housing_effect: 10,
    survey_age: "2026-01-01 01:00:00",
    sciences_age: "2026-01-01 02:00:00",  // different tick
  }));
  assert.equal(maxPop, null);
  assert.ok(needsForMax.some((s) => s.includes("same tick")));
});

test("estimatePop — currentPop: sums all unit types excluding prisoners and war horses", () => {
  const { currentPop } = estimatePop(makeInputs({
    peasants: 10000,
    soldiers: 2000,
    off_specs: 1000,
    def_specs: 3000,
    elites: 5000,
    war_horses: 500,    // excluded
    prisoners: 100,     // excluded
    thieves: 800,
    wizards: 700,
    training_off_specs: 200,
    training_def_specs: 300,
    training_elites: 400,
    training_thieves: 50,
    troops_age: T1,
    resources_age: T1,
    som_age: T1,
  }));
  // 10000+2000+1000+3000+5000+800+700+200+300+400+50 = 23450
  assert.equal(currentPop, 23450);
});

test("estimatePop — currentPop: null when SoT missing", () => {
  const { currentPop, needsForCurrent } = estimatePop(makeInputs({
    training_off_specs: 0,
    training_def_specs: 0,
    training_elites: 0,
    training_thieves: 0,
    som_age: T1,
  }));
  assert.equal(currentPop, null);
  assert.ok(needsForCurrent.some((s) => s.includes("SoT")));
});

test("estimatePop — currentPop: null when SoM missing", () => {
  const { currentPop, needsForCurrent } = estimatePop(makeInputs({
    peasants: 10000,
    soldiers: 0,
    off_specs: 0,
    def_specs: 0,
    elites: 0,
    troops_age: T1,
    resources_age: T1,
  }));
  assert.equal(currentPop, null);
  assert.ok(needsForCurrent.some((s) => s.includes("SoM")));
});

test("estimatePop — currentPop: null when SoT and SoM are different ticks", () => {
  const { currentPop, needsForCurrent } = estimatePop(makeInputs({
    peasants: 10000,
    soldiers: 0,
    off_specs: 0,
    def_specs: 0,
    elites: 0,
    training_off_specs: 0,
    training_def_specs: 0,
    training_elites: 0,
    training_thieves: 0,
    troops_age: "2026-01-01 01:00:00",
    resources_age: "2026-01-01 01:00:00",
    som_age: "2026-01-01 02:00:00",  // different tick
  }));
  assert.equal(currentPop, null);
  assert.ok(needsForCurrent.some((s) => s.includes("same tick")));
});

test("estimatePop — wizardsEstimated: false when wizards directly known", () => {
  const { wizardsEstimated } = estimatePop(makeInputs({
    peasants: 1000,
    soldiers: 0,
    off_specs: 0,
    def_specs: 0,
    elites: 0,
    wizards: 500,
    training_off_specs: 0,
    training_def_specs: 0,
    training_elites: 0,
    training_thieves: 0,
    troops_age: T1,
    resources_age: T1,
    som_age: T1,
  }));
  assert.equal(wizardsEstimated, false);
});
