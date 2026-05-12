import { test } from "node:test";
import assert from "node:assert/strict";
import { parseSorcery } from "../lib/parsers/sorcery";

const PREAMBLE = `You enter the Magical Academy, where your wizards hone their skills in the mystic arts. Under your guidance, they stand ready to cast powerful spells upon your enemies or strengthen your own kingdom.`;

const STATS = `Wizards\t1,234\nRunes\t5,678\nMana\t87%`;

const METEOR_URL =
  "https://utopia-game.com/wol/game/sorcery?p=319&s=METEOR_SHOWERS";
const GREED_URL = "https://utopia-game.com/wol/game/sorcery?p=319&s=GREED";
const FIREBALL_URL =
  "https://utopia-game.com/wol/game/sorcery?p=319&s=FIREBALL";
const CHASTITY_URL =
  "https://utopia-game.com/wol/game/sorcery?p=319&s=CHASTITY";
const SITTER_URL = "https://utopia-game.com/wol/sit/game/sorcery?p=319&s=GREED";

const TARGET_KD = `Target kingdom is Time For A Book (3:9)`;
const TARGET_PROV = `Select target province:\t8 A Song Of Ice and Fire --- ( 118% )`;

test("parseSorcery — success with target province", () => {
  const text = [
    PREAMBLE,
    "",
    STATS,
    "",
    "You gather 2,500 runes and begin casting, and the spell succeeds. Gold rains down upon your kingdom.",
    `${TARGET_KD}\n${TARGET_PROV}`,
  ].join("\n");
  const r = parseSorcery(text, GREED_URL, "TestProvince");
  assert.ok(r);
  assert.equal(r.spell, "GREED");
  assert.equal(r.outcome, "success");
  assert.equal(r.runesSpent, 2500);
  assert.equal(r.wizardsLost, 0);
  assert.equal(r.durationDays, null);
  assert.equal(r.targetName, "A Song Of Ice and Fire");
  assert.equal(r.targetSlot, 8);
  assert.equal(r.targetKingdom, "3:9");
  assert.equal(r.wizards, 1234);
  assert.equal(r.runes, 5678);
  assert.equal(r.mana, 87);
  assert.equal(r.name, "TestProvince");
  assert.equal(r.kingdom, "");
});

test("parseSorcery — success with duration", () => {
  const text = [
    PREAMBLE,
    "",
    STATS,
    "",
    "You gather 1,800 runes and begin casting, and the spell succeeds. The spell will last for 5 days.",
    `${TARGET_KD}\n${TARGET_PROV}`,
  ].join("\n");
  const r = parseSorcery(text, GREED_URL, "TestProvince");
  assert.ok(r);
  assert.equal(r.outcome, "success");
  assert.equal(r.durationDays, 5);
  assert.equal(r.runesSpent, 1800);
});

test("parseSorcery — failure no explosion", () => {
  const text = [
    PREAMBLE,
    "",
    STATS,
    "",
    "You gather 3,000 runes and begin casting, but the spell fails. Our wizards were unable to channel the required energy.",
    `${TARGET_KD}\n${TARGET_PROV}`,
  ].join("\n");
  const r = parseSorcery(text, METEOR_URL, "TestProvince");
  assert.ok(r);
  assert.equal(r.spell, "METEOR_SHOWERS");
  assert.equal(r.outcome, "failure");
  assert.equal(r.runesSpent, 3000);
  assert.equal(r.wizardsLost, 0);
});

test("parseSorcery — failure with wizard explosion", () => {
  const text = [
    PREAMBLE,
    "",
    STATS,
    "",
    "You gather 4,200 runes and begin casting, but the spell fails. Something went terribly wrong with our spell. 12 wizards were killed in an explosion!",
    `${TARGET_KD}\n${TARGET_PROV}`,
  ].join("\n");
  const r = parseSorcery(text, GREED_URL, "TestProvince");
  assert.ok(r);
  assert.equal(r.outcome, "failure");
  assert.equal(r.wizardsLost, 12);
  assert.equal(r.runesSpent, 4200);
});

test("parseSorcery — 1 wizard lost in explosion", () => {
  const text = [
    PREAMBLE,
    "",
    STATS,
    "",
    "You gather 1,100 runes and begin casting, but the spell fails. Something went terribly wrong with our spell. 1 wizard was killed in an explosion!",
    TARGET_KD,
  ].join("\n");
  const r = parseSorcery(text, FIREBALL_URL, "TestProvince");
  assert.ok(r);
  assert.equal(r.wizardsLost, 1);
});

test("parseSorcery — inline target via 'skies of'", () => {
  const text = [
    PREAMBLE,
    "",
    STATS,
    "",
    "You gather 900 runes and begin casting, and the spell succeeds. Meteors rain down over the skies of A Song Of Ice and Fire (3:9).",
    TARGET_KD,
  ].join("\n");
  const r = parseSorcery(text, METEOR_URL, "TestProvince");
  assert.ok(r);
  assert.equal(r.targetName, "A Song Of Ice and Fire");
  assert.equal(r.targetKingdom, "3:9");
  assert.equal(r.targetSlot, null);
});

test("parseSorcery — inline target via 'womenfolk of'", () => {
  const text = [
    PREAMBLE,
    "",
    STATS,
    "",
    "You gather 750 runes and begin casting, and the spell succeeds. The spell falls upon the womenfolk of A Song Of Ice and Fire (3:9).",
    TARGET_KD,
  ].join("\n");
  const r = parseSorcery(text, CHASTITY_URL, "TestProvince");
  assert.ok(r);
  assert.equal(r.targetName, "A Song Of Ice and Fire");
  assert.equal(r.targetKingdom, "3:9");
});

test("parseSorcery — inline target with slot prefix", () => {
  const text = [
    PREAMBLE,
    "",
    STATS,
    "",
    "You gather 500 runes and begin casting, and the spell succeeds. Our crystal eye reveals the province of 9 - All I see is darkness (3:9).",
  ].join("\n");
  const r = parseSorcery(
    text,
    "https://utopia-game.com/wol/game/sorcery?p=319&s=CRYSTAL_EYE",
    "TestProvince",
  );
  assert.ok(r);
  assert.equal(r.targetName, "All I see is darkness");
  assert.equal(r.targetSlot, 9);
  assert.equal(r.targetKingdom, "3:9");
});

test("parseSorcery — target province form with dash after slot", () => {
  const text = [
    PREAMBLE,
    "",
    STATS,
    "",
    "You gather 500 runes and begin casting, and the spell succeeds. Our crystal eye reveals the province.",
    `${TARGET_KD}\nSelect target province:\t9 - All I see is darkness --- ( 118% )`,
  ].join("\n");
  const r = parseSorcery(
    text,
    "https://utopia-game.com/wol/game/sorcery?p=319&s=CRYSTAL_EYE",
    "TestProvince",
  );
  assert.ok(r);
  assert.equal(r.targetName, "All I see is darkness");
  assert.equal(r.targetSlot, 9);
  assert.equal(r.targetKingdom, "3:9");
});

test("parseSorcery — no target (self-buff spell)", () => {
  const text = [
    PREAMBLE,
    "",
    STATS,
    "",
    "You gather 600 runes and begin casting, and the spell succeeds. Your kingdom is blessed.",
  ].join("\n");
  const r = parseSorcery(text, GREED_URL, "TestProvince");
  assert.ok(r);
  assert.equal(r.targetName, null);
  assert.equal(r.targetSlot, null);
  assert.equal(r.targetKingdom, null);
});

test("parseSorcery — commas in rune count", () => {
  const text = [
    PREAMBLE,
    "",
    STATS,
    "",
    "You gather 12,500 runes and begin casting, and the spell succeeds.",
  ].join("\n");
  const r = parseSorcery(text, GREED_URL, "TestProvince");
  assert.ok(r);
  assert.equal(r.runesSpent, 12500);
});

test("parseSorcery — sitter URL works", () => {
  const text = [
    PREAMBLE,
    "",
    STATS,
    "",
    "You gather 1,000 runes and begin casting, and the spell succeeds.",
  ].join("\n");
  const r = parseSorcery(text, SITTER_URL, "TestProvince");
  assert.ok(r);
  assert.equal(r.spell, "GREED");
});

test("parseSorcery — form page (no result) returns null", () => {
  const text = `${PREAMBLE}\n\n${STATS}\n\n${TARGET_KD}\n${TARGET_PROV}`;
  const r = parseSorcery(text, GREED_URL, "TestProvince");
  assert.equal(r, null);
});

test("parseSorcery — no spell param returns null", () => {
  const text = [
    PREAMBLE,
    "",
    STATS,
    "",
    "You gather 1,000 runes and begin casting, and the spell succeeds.",
  ].join("\n");
  const r = parseSorcery(
    text,
    "https://utopia-game.com/wol/game/sorcery?p=319",
    "TestProvince",
  );
  assert.equal(r, null);
});
