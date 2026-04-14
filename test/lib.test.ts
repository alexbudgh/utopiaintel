import { test } from "node:test";
import assert from "node:assert/strict";
import { computeWizardCount, NW_PER_WIZARD, RACE_NW } from "../lib/nw";
import { computeAmbushRawOff } from "../lib/ambush";
import { formatNum, fullValueTooltip, parseUtopiaDate } from "../lib/ui";
import { getRaceByName, normalizeScienceName } from "../lib/game";

// ---------------------------------------------------------------------------
// computeWizardCount
// ---------------------------------------------------------------------------

// Baseline inputs derived from the verified province in nw.ts comments:
// Undead, 2469 acres, 517,597 NW, 6,606 wizards, NW/wiz=7
// We use a round-number version for easy hand-verification.

function baseInputs() {
  return {
    race: "Undead",
    networth: 517_597,
    land: 2469,
    soldiers: 0,
    off_specs: 0,
    def_specs: 0,
    elites: 0,
    war_horses: 0,
    peasants: 0,
    prisoners: 0,
    thieves: 0,
    money: 0,
    buildings_built: 0,
    buildings_in_progress: 0,
    science_total_books: 0,
  };
}

test("computeWizardCount — returns null when race is missing", () => {
  assert.equal(computeWizardCount({ ...baseInputs(), race: null }), null);
});

test("computeWizardCount — returns null when networth is missing", () => {
  assert.equal(computeWizardCount({ ...baseInputs(), networth: null }), null);
});

test("computeWizardCount — returns null when land is missing", () => {
  assert.equal(computeWizardCount({ ...baseInputs(), land: null }), null);
});

test("computeWizardCount — returns null when thieves is missing", () => {
  assert.equal(computeWizardCount({ ...baseInputs(), thieves: null }), null);
});

test("computeWizardCount — returns null when buildings_built is missing", () => {
  assert.equal(computeWizardCount({ ...baseInputs(), buildings_built: null }), null);
});

test("computeWizardCount — returns null when science_total_books is missing", () => {
  assert.equal(computeWizardCount({ ...baseInputs(), science_total_books: null }), null);
});

test("computeWizardCount — returns null for negative residual (over-counted non-wizard NW)", () => {
  // Force a massive troop count that exceeds total NW
  const r = computeWizardCount({ ...baseInputs(), elites: 1_000_000 });
  assert.equal(r, null);
});

test("computeWizardCount — returns null for unknown race", () => {
  assert.equal(computeWizardCount({ ...baseInputs(), race: "Dragon" }), null);
});

test("computeWizardCount — pure land/building NW with no units or resources", () => {
  // With no troops, money, science, or thieves:
  //   landBuildingNw = land*40 + buildings_built*20
  //   residual = networth - landBuildingNw
  //   wizards = residual / 7
  const land = 1000;
  const buildings = 500;
  const landNw = land * 40 + buildings * 20;
  const wizardNw = 7_000; // 1000 wizards × 7
  const nw = landNw + wizardNw;
  const result = computeWizardCount({ ...baseInputs(), race: "Human", networth: nw, land, buildings_built: buildings });
  assert.ok(result != null);
  assert.ok(Math.abs(result - 1000) < 1, `expected ~1000 wizards, got ${result}`);
});

test("computeWizardCount — troops contribute to NW correctly (Orc elites)", () => {
  // Orc elite NW weight = 7.0 (from RACE_NW)
  const land = 1000;
  const buildings = 0;
  const elites = 500;
  const landNw = land * 40;
  const eliteNw = elites * RACE_NW["Orc"].elites;
  const wizardNw = 700; // 100 wizards
  const nw = landNw + eliteNw + wizardNw;
  const result = computeWizardCount({ ...baseInputs(), race: "Orc", networth: nw, land, elites });
  assert.ok(result != null);
  assert.ok(Math.abs(result - 100) < 1, `expected ~100 wizards, got ${result}`);
});

test("computeWizardCount — thieves contribute NW at 5 per thief", () => {
  const land = 500;
  const thieves = 200;
  const landNw = land * 40;
  const thievesNw = thieves * 5;
  const wizardNw = 350; // 50 wizards
  const nw = landNw + thievesNw + wizardNw;
  const result = computeWizardCount({ ...baseInputs(), race: "Human", networth: nw, land, thieves });
  assert.ok(result != null);
  assert.ok(Math.abs(result - 50) < 1, `expected ~50 wizards, got ${result}`);
});

test("computeWizardCount — money contributes NW at 1 per 1000 gold", () => {
  const land = 500;
  const money = 500_000;
  const landNw = land * 40;
  const moneyNw = money / 1000;
  const wizardNw = 700; // 100 wizards
  const nw = landNw + moneyNw + wizardNw;
  const result = computeWizardCount({ ...baseInputs(), race: "Human", networth: nw, land, money });
  assert.ok(result != null);
  assert.ok(Math.abs(result - 100) < 1, `expected ~100 wizards, got ${result}`);
});

test("computeWizardCount — buildings_in_progress contribute at 10 per acre", () => {
  const land = 500;
  const inProgress = 100;
  const landNw = land * 40 + inProgress * 10;
  const wizardNw = 700;
  const nw = landNw + wizardNw;
  const result = computeWizardCount({ ...baseInputs(), race: "Human", networth: nw, land, buildings_in_progress: inProgress });
  assert.ok(result != null);
  assert.ok(Math.abs(result - 100) < 1, `expected ~100 wizards, got ${result}`);
});

test("computeWizardCount — NW_PER_WIZARD constant is 7", () => {
  assert.equal(NW_PER_WIZARD, 7);
});

// ---------------------------------------------------------------------------
// computeAmbushRawOff
// ---------------------------------------------------------------------------

test("computeAmbushRawOff — returns null for null/unknown race", () => {
  assert.equal(computeAmbushRawOff(null, { elites: 100, offSpecs: 100, soldiers: 100 }), null);
  assert.equal(computeAmbushRawOff("Dragon", { elites: 100, offSpecs: 100, soldiers: 100 }), null);
});

test("computeAmbushRawOff — Orc: elites defend at 1, offSpecs at 10, soldiers at 3", () => {
  // Formula: (elites*eliteDef + offSpecs*defSpecDef + soldiers*soldierOff) * 0.8 + 1
  const elites = 100, offSpecs = 50, soldiers = 200;
  const expected = (elites * 1 + offSpecs * 10 + soldiers * 3) * 0.8 + 1;
  assert.equal(computeAmbushRawOff("Orc", { elites, offSpecs, soldiers }), expected);
});

test("computeAmbushRawOff — Elf: elites defend at 6, offSpecs (Rangers) at 13, soldiers at 3", () => {
  const elites = 50, offSpecs = 100, soldiers = 0;
  const expected = (elites * 6 + offSpecs * 13 + soldiers * 3) * 0.8 + 1;
  assert.equal(computeAmbushRawOff("Elf", { elites, offSpecs, soldiers }), expected);
});

test("computeAmbushRawOff — zero army gives 1 (minimum)", () => {
  const result = computeAmbushRawOff("Human", { elites: 0, offSpecs: 0, soldiers: 0 });
  assert.equal(result, 1);
});

test("computeAmbushRawOff — all nine races are covered", () => {
  const races = ["Avian", "Dark Elf", "Dwarf", "Elf", "Faery", "Halfling", "Human", "Orc", "Undead"];
  for (const race of races) {
    const result = computeAmbushRawOff(race, { elites: 100, offSpecs: 100, soldiers: 100 });
    assert.ok(result != null && result > 0, `${race} should return a positive value`);
  }
});

// ---------------------------------------------------------------------------
// formatNum
// ---------------------------------------------------------------------------

test("formatNum — null/undefined returns em-dash", () => {
  assert.equal(formatNum(null), "—");
  assert.equal(formatNum(undefined), "—");
});

test("formatNum — values below 1000 returned as-is via toLocaleString", () => {
  assert.equal(formatNum(0), "0");
  assert.equal(formatNum(999), "999");
  assert.equal(formatNum(42), "42");
});

test("formatNum — values 1000–999999 rounded to nearest k", () => {
  assert.equal(formatNum(1000), "1k");
  assert.equal(formatNum(1499), "1k");
  assert.equal(formatNum(1500), "2k");  // Math.round(1500/1000) = 2
  assert.equal(formatNum(999_999), "1000k");
});

test("formatNum — values ≥ 1 000 000 shown as M with one decimal", () => {
  assert.equal(formatNum(1_000_000), "1.0M");
  assert.equal(formatNum(1_500_000), "1.5M");
  assert.equal(formatNum(12_345_678), "12.3M");
});

// ---------------------------------------------------------------------------
// fullValueTooltip
// ---------------------------------------------------------------------------

test("fullValueTooltip — returns null when value is null", () => {
  assert.equal(fullValueTooltip("—", null), null);
});

test("fullValueTooltip — returns null when displayed already equals full value", () => {
  // formatNum(999) = "999", formatExactNum(999) = "999" — same, no tooltip needed
  assert.equal(fullValueTooltip("999", 999), null);
});

test("fullValueTooltip — returns tooltip when displayed is abbreviated", () => {
  // formatNum(1500) = "2k", full value is "1,500"
  const tip = fullValueTooltip("2k", 1500);
  assert.ok(tip != null);
  assert.ok(tip.includes("1,500"), `expected tooltip to contain "1,500", got: ${tip}`);
});

test("fullValueTooltip — suffix is appended to full value in tooltip", () => {
  // e.g. OME displayed as "85.3%" but exact is "85.2914%"
  const tip = fullValueTooltip("85.3%", 85.29144, { suffix: "%" });
  assert.ok(tip != null);
  assert.ok(tip.includes("%"), `expected tooltip to contain "%", got: ${tip}`);
  assert.ok(tip.includes("85.2914"), `expected tooltip to contain full value, got: ${tip}`);
});

test("fullValueTooltip — returns null when value rounds to same as displayed with suffix", () => {
  // If displayed "85.3%" and exact is also "85.3%"
  assert.equal(fullValueTooltip("85.3%", 85.3, { suffix: "%" }), null);
});

// ---------------------------------------------------------------------------
// parseUtopiaDate edge cases
// ---------------------------------------------------------------------------

test("parseUtopiaDate — returns -1 for invalid month", () => {
  assert.equal(parseUtopiaDate("August 1 of YR9"), -1);
  assert.equal(parseUtopiaDate("December 1 of YR9"), -1);
});

test("parseUtopiaDate — returns -1 for malformed strings", () => {
  assert.equal(parseUtopiaDate(""), -1);
  assert.equal(parseUtopiaDate("not a date"), -1);
  assert.equal(parseUtopiaDate("January of YR9"), -1);  // missing day
});

test("parseUtopiaDate — January 1 of YR0 is ordinal 0", () => {
  assert.equal(parseUtopiaDate("January 1 of YR0"), 0);
});

test("parseUtopiaDate — month matching is case-sensitive (months must be title-case)", () => {
  // The regex has the /i flag but UTOPIA_MONTHS.indexOf() is case-sensitive,
  // so only title-case months (as produced by formatUtopiaDate) are accepted.
  assert.equal(parseUtopiaDate("january 1 of YR0"), -1);
  assert.equal(parseUtopiaDate("JANUARY 1 OF YR0"), -1);
});

// ---------------------------------------------------------------------------
// getRaceByName / normalizeScienceName
// ---------------------------------------------------------------------------

test("getRaceByName — matches full name case-insensitively", () => {
  assert.equal(getRaceByName("Orc")?.name, "Orc");
  assert.equal(getRaceByName("orc")?.name, "Orc");
  assert.equal(getRaceByName("DARK ELF")?.name, "Dark Elf");
});

test("getRaceByName — matches short name case-insensitively", () => {
  assert.equal(getRaceByName("OR")?.name, "Orc");
  assert.equal(getRaceByName("de")?.name, "Dark Elf");
});

test("getRaceByName — returns undefined for unknown race", () => {
  assert.equal(getRaceByName("Dragon"), undefined);
  assert.equal(getRaceByName(""), undefined);
});

test("normalizeScienceName — maps alt names to canonical names", () => {
  assert.equal(normalizeScienceName("Income"), "Alchemy");
  assert.equal(normalizeScienceName("Building Effectiveness"), "Tools");
  assert.equal(normalizeScienceName("Population Limits"), "Housing");
  assert.equal(normalizeScienceName("Food"), "Production");
  assert.equal(normalizeScienceName("Thievery Effectiveness"), "Crime");
  assert.equal(normalizeScienceName("Magic Effectiveness"), "Channeling");
});

test("normalizeScienceName — passes through canonical names unchanged", () => {
  assert.equal(normalizeScienceName("Alchemy"), "Alchemy");
  assert.equal(normalizeScienceName("Housing"), "Housing");
  assert.equal(normalizeScienceName("Channeling"), "Channeling");
});

test("normalizeScienceName — passes through unknown names unchanged", () => {
  assert.equal(normalizeScienceName("SomethingNew"), "SomethingNew");
});
