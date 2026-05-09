import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

test("replayEntry inserts original received_at directly", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "utopiaintel-replay-timestamp-"));
  process.env.INTEL_DB_PATH = path.join(dir, "intel.db");

  try {
    const { replayEntry, normalizeReceivedAt } = await import("../lib/replay-debug-log");
    const { getDb, flushMetricsCacheRefreshQueue } = await import("../lib/db");

    const receivedAt = "2026-05-03T03:57:27.581Z";
    const expected = normalizeReceivedAt(receivedAt);
    const type = replayEntry(
      {
        url: "https://utopia-game.com/wol/game/council_state",
        prov: "Replay Timestamp",
        received_at: receivedAt,
        key_hash: "timestamp-key",
        data_simple: [
          "Current Networth\t500,000 gold coins",
          "Current Land\t850 acres",
          "Peasants\t1,234",
          "Thieves\t567",
          "Wizards\t89",
          "Total\t1,890",
          "Max Population\t2,100",
        ].join("\n"),
      },
      new Set(["state"]),
    );

    assert.equal(type, "state");
    const db = getDb();
    for (const table of ["province_overview", "province_resources", "province_troops"]) {
      const row = db.prepare(`SELECT received_at FROM ${table}`).get() as { received_at: string };
      assert.equal(row.received_at, expected, table);
    }
    await flushMetricsCacheRefreshQueue();
    db.close();
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
