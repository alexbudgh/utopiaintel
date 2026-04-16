import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createDebugLogWriter, getDebugLogConfig, type DebugLogEntry } from "../lib/debug-log";

async function withTempDir(run: (dir: string) => Promise<void> | void) {
  const dir = await mkdtemp(path.join(tmpdir(), "utopiaintel-debug-log-"));
  try {
    await run(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function makeEntry(id: string): DebugLogEntry {
  return {
    url: `https://utopia-game.com/wol/game/throne?id=${id}`,
    prov: `TestProvince${id}`,
    data_simple: `payload-${id}`,
    key_hash: `hash-${id}`,
    received_at: "2026-04-16T12:00:00.000Z",
  };
}

test("getDebugLogConfig uses defaults and overrides", () => {
  const defaults = getDebugLogConfig({ INTEL_DEBUG: "1" }, "/tmp/app");
  assert.equal(defaults.enabled, true);
  assert.equal(defaults.filePath, "/tmp/app/intel_debug.jsonl");
  assert.equal(defaults.maxBytes, 10 * 1024 * 1024);
  assert.equal(defaults.maxFiles, 5);

  const overrides = getDebugLogConfig({
    INTEL_DEBUG: "0",
    INTEL_DEBUG_PATH: "/var/log/custom.jsonl",
    INTEL_DEBUG_MAX_BYTES: "2048",
    INTEL_DEBUG_MAX_FILES: "7",
  }, "/tmp/app");
  assert.equal(overrides.enabled, false);
  assert.equal(overrides.filePath, "/var/log/custom.jsonl");
  assert.equal(overrides.maxBytes, 2048);
  assert.equal(overrides.maxFiles, 7);
});

test("createDebugLogWriter appends entries without rotating under threshold", async () => {
  await withTempDir(async (dir) => {
    const filePath = path.join(dir, "intel_debug.jsonl");
    const writer = createDebugLogWriter({
      enabled: true,
      filePath,
      maxBytes: 4096,
      maxFiles: 3,
    });

    await writer.append(makeEntry("one"));
    await writer.append(makeEntry("two"));

    const contents = await readFile(filePath, "utf8");
    const lines = contents.trim().split("\n");
    assert.equal(lines.length, 2);
    assert.equal(JSON.parse(lines[0]).prov, "TestProvinceone");
    assert.equal(JSON.parse(lines[1]).prov, "TestProvincetwo");
  });
});

test("createDebugLogWriter rotates files when the next write exceeds maxBytes", async () => {
  await withTempDir(async (dir) => {
    const filePath = path.join(dir, "intel_debug.jsonl");
    const writer = createDebugLogWriter({
      enabled: true,
      filePath,
      maxBytes: 150,
      maxFiles: 3,
    });

    await writer.append(makeEntry("one"));
    await writer.append(makeEntry("two"));
    await writer.append(makeEntry("three"));

    const active = await readFile(filePath, "utf8");
    const rotated = await readFile(`${filePath}.1`, "utf8");

    assert.match(active, /TestProvincethree/);
    assert.doesNotMatch(active, /TestProvinceone/);
    assert.match(rotated, /TestProvincetwo/);
  });
});

test("createDebugLogWriter prunes files beyond maxFiles", async () => {
  await withTempDir(async (dir) => {
    const filePath = path.join(dir, "intel_debug.jsonl");
    const writer = createDebugLogWriter({
      enabled: true,
      filePath,
      maxBytes: 120,
      maxFiles: 2,
    });

    for (const id of ["one", "two", "three", "four", "five"]) {
      await writer.append(makeEntry(id));
    }

    const files = (await readdir(dir)).sort();
    assert.deepEqual(files, ["intel_debug.jsonl", "intel_debug.jsonl.1", "intel_debug.jsonl.2"]);
    const oldestRetained = await readFile(path.join(dir, "intel_debug.jsonl.2"), "utf8");
    assert.doesNotMatch(oldestRetained, /TestProvinceone/);
  });
});

test("createDebugLogWriter serializes concurrent appends without losing lines", async () => {
  await withTempDir(async (dir) => {
    const filePath = path.join(dir, "intel_debug.jsonl");
    const writer = createDebugLogWriter({
      enabled: true,
      filePath,
      maxBytes: 8192,
      maxFiles: 3,
    });

    await Promise.all([
      writer.append(makeEntry("one")),
      writer.append(makeEntry("two")),
      writer.append(makeEntry("three")),
      writer.append(makeEntry("four")),
    ]);

    const contents = await readFile(filePath, "utf8");
    const lines = contents.trim().split("\n");
    assert.equal(lines.length, 4);
    assert.deepEqual(
      lines.map((line) => JSON.parse(line).prov),
      ["TestProvinceone", "TestProvincetwo", "TestProvincethree", "TestProvincefour"],
    );
  });
});
