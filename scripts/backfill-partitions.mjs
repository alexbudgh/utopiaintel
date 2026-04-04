// Backfills intel_partitions for all existing provinces.
// Usage: KEY=your_kingdom_key node scripts/backfill-partitions.mjs
import { createHash } from "crypto";
import { createRequire } from "module";
import { join } from "path";
import { fileURLToPath } from "url";

const require = createRequire(import.meta.url);
const Database = require("better-sqlite3");

const key = process.env.KEY;
if (!key) {
  console.error("Usage: KEY=your_kingdom_key node scripts/backfill-partitions.mjs");
  process.exit(1);
}

const keyHash = createHash("sha256").update(key).digest("hex");
const dbPath = join(fileURLToPath(import.meta.url), "../../intel.db");
const db = new Database(dbPath);

const provinces = db.prepare("SELECT id FROM provinces").all();
const ins = db.prepare("INSERT OR IGNORE INTO intel_partitions (key_hash, province_id) VALUES (?, ?)");
const backfill = db.transaction(() => {
  for (const p of provinces) ins.run(keyHash, p.id);
});
backfill();

console.log(`Backfilled ${provinces.length} provinces.`);
