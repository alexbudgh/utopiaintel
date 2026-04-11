import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { parseIntel } from "../lib/parsers";
import { getIntelPathname } from "../lib/parsers/detect";
import {
  getDb,
  storeSoT,
  storeKingdom,
  storeSurvey,
  storeKingdomNews,
} from "../lib/db";

type ReplayType = "kingdom" | "survey" | "sot" | "kingdom_news";

interface DebugEntry {
  url: string;
  prov: string;
  data_simple: string;
  received_at?: string;
}

const allowedTypes = new Set<ReplayType>(["kingdom", "survey", "sot", "kingdom_news"]);

function normalizeReceivedAt(receivedAt: string): string {
  const date = new Date(receivedAt);
  if (Number.isNaN(date.getTime())) return receivedAt;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}`;
}

function getReplayTypes(arg: string | undefined): Set<ReplayType> {
  if (!arg) return new Set(allowedTypes);
  const types = new Set<ReplayType>();
  for (const raw of arg.split(",")) {
    const value = raw.trim() as ReplayType;
    if (allowedTypes.has(value)) types.add(value);
  }
  return types.size ? types : new Set(allowedTypes);
}

function getSingleKeyHash() {
  const db = getDb();
  const keys = db.prepare(
    "SELECT DISTINCT key_hash FROM intel_partitions ORDER BY key_hash"
  ).all() as { key_hash: string }[];

  if (keys.length !== 1) {
    throw new Error(`Expected exactly one key_hash in intel_partitions, found ${keys.length}`);
  }
  return keys[0].key_hash;
}

function setLatestKingdomTimestamp(location: string, savedBy: string, receivedAt: string) {
  const db = getDb();
  db.prepare(`
    UPDATE kingdom_intel
    SET received_at = ?
    WHERE id = (
      SELECT id
      FROM kingdom_intel
      WHERE location = ? AND saved_by = ?
      ORDER BY id DESC
      LIMIT 1
    )
  `).run(receivedAt, location, savedBy);
}

function setLatestSurveyTimestamp(provinceName: string, kingdom: string, savedBy: string, receivedAt: string) {
  const db = getDb();
  db.prepare(`
    UPDATE survey_intel
    SET received_at = ?
    WHERE id = (
      SELECT si.id
      FROM survey_intel si
      JOIN provinces p ON p.id = si.province_id
      WHERE p.name = ? AND p.kingdom = ? AND si.saved_by = ?
      ORDER BY si.id DESC
      LIMIT 1
    )
  `).run(receivedAt, provinceName, kingdom, savedBy);
}

function setLatestSoTTimestamps(provinceName: string, kingdom: string, savedBy: string, receivedAt: string) {
  const db = getDb();
  const provinceIdRow = db.prepare(
    "SELECT id FROM provinces WHERE name = ? AND kingdom = ?"
  ).get(provinceName, kingdom) as { id: number } | undefined;
  if (!provinceIdRow) return;

  const provinceId = provinceIdRow.id;
  const stamp = (table: string) => {
    db.prepare(`
      UPDATE ${table}
      SET received_at = ?
      WHERE id = (
        SELECT id
        FROM ${table}
        WHERE province_id = ? AND saved_by = ?
        ORDER BY id DESC
        LIMIT 1
      )
    `).run(receivedAt, provinceId, savedBy);
  };

  stamp("province_overview");
  stamp("total_military_points");
  stamp("province_troops");
  stamp("province_resources");
  stamp("province_status");
  db.prepare(`
    UPDATE province_effects
    SET received_at = ?
    WHERE province_id = ? AND saved_by = ?
  `).run(receivedAt, provinceId, savedBy);
}

function replayEntry(entry: DebugEntry, keyHash: string, allowed: Set<ReplayType>) {
  const parsed = parseIntel(entry.url, entry.data_simple, entry.prov);
  if (!parsed) return null;
  if (!allowed.has(parsed.type as ReplayType)) return null;

  const savedBy = entry.prov;
  const normalizedReceivedAt = entry.received_at ? normalizeReceivedAt(entry.received_at) : null;
  if (parsed.type === "kingdom") {
    storeKingdom(parsed.data, savedBy, keyHash);
    if (normalizedReceivedAt) {
      setLatestKingdomTimestamp(parsed.data.location, savedBy, normalizedReceivedAt);
    }
    return "kingdom";
  }

  if (parsed.type === "survey") {
    storeSurvey(parsed.data, savedBy, keyHash);
    if (normalizedReceivedAt) {
      setLatestSurveyTimestamp(parsed.data.name, parsed.data.kingdom, savedBy, normalizedReceivedAt);
    }
    return "survey";
  }

  if (parsed.type === "sot") {
    const pathname = getIntelPathname(entry.url);
    const isSelfThrone = pathname === "/wol/game/throne";
    storeSoT(parsed.data, savedBy, keyHash, isSelfThrone);
    if (normalizedReceivedAt) {
      setLatestSoTTimestamps(parsed.data.name, parsed.data.kingdom, savedBy, normalizedReceivedAt);
    }
    return "sot";
  }

  if (parsed.type === "kingdom_news") {
    storeKingdomNews(parsed.data, keyHash);
    return "kingdom_news";
  }

  return null;
}

function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    throw new Error("Usage: tsx scripts/replay-debug-log.ts <jsonl...> [--types=kingdom,survey,sot,kingdom_news]");
  }

  const typeArg = args.find((arg) => arg.startsWith("--types="));
  const files = args.filter((arg) => !arg.startsWith("--types="));
  const replayTypes = getReplayTypes(typeArg?.slice("--types=".length));
  const keyHash = getSingleKeyHash();

  let linesSeen = 0;
  let replayed = 0;
  const byType = new Map<string, number>();

  for (const file of files) {
    const fullPath = resolve(file);
    const content = readFileSync(fullPath, "utf8");
    for (const line of content.split("\n")) {
      if (!line.trim()) continue;
      linesSeen += 1;
      const entry = JSON.parse(line) as DebugEntry;
      const type = replayEntry(entry, keyHash, replayTypes);
      if (!type) continue;
      replayed += 1;
      byType.set(type, (byType.get(type) ?? 0) + 1);
    }
  }

  const summary = [...byType.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([type, count]) => `${type}=${count}`)
    .join(" ");

  console.log(`lines=${linesSeen} replayed=${replayed} ${summary}`.trim());
}

main();
