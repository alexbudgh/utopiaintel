import { createReadStream } from "node:fs";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import readline from "node:readline";
import { parseIntel } from "./parsers";
import { getIntelPathname } from "./parsers/detect";
import {
  getDb,
  storeSoT,
  storeKingdom,
  storeSurvey,
  storeKingdomNews,
  storeState,
  storeSoM,
  storeTrainArmy,
  storeBuild,
} from "./db";

export type ReplayType = "kingdom" | "survey" | "sot" | "kingdom_news" | "state" | "som" | "train_army" | "build";

export interface DebugEntry {
  url: string;
  prov: string;
  data_simple: string;
  received_at?: string;
  key_hash?: string;
}

export interface ReplayOptions {
  files: string[];
  replayTypes: Set<ReplayType>;
  keyHash?: string;
  assumeKeyHash?: string;
  dryRun?: boolean;
}

export interface ReplaySummary {
  linesSeen: number;
  replayed: number;
  byType: Map<string, number>;
}

export const allowedReplayTypes = new Set<ReplayType>(["kingdom", "survey", "sot", "kingdom_news", "state", "som", "train_army", "build"]);

export function normalizeReceivedAt(receivedAt: string): string {
  const date = new Date(receivedAt);
  if (Number.isNaN(date.getTime())) return receivedAt;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}`;
}

export function getReplayTypes(arg: string | undefined): Set<ReplayType> {
  if (!arg) return new Set(allowedReplayTypes);
  const types = new Set<ReplayType>();
  for (const raw of arg.split(",")) {
    const value = raw.trim() as ReplayType;
    if (allowedReplayTypes.has(value)) types.add(value);
  }
  return types.size ? types : new Set(allowedReplayTypes);
}

export function hashReplayKey(rawKey: string): string {
  return createHash("sha256").update(rawKey).digest("hex");
}

export function getSingleKeyHash() {
  const db = getDb();
  const keys = db.prepare(
    "SELECT DISTINCT key_hash FROM intel_partitions ORDER BY key_hash"
  ).all() as { key_hash: string }[];

  if (keys.length !== 1) {
    throw new Error(`Replay is ambiguous: debug entries do not include key_hash and intel_partitions contains ${keys.length} keys. Pass --assume-key-hash=... or log key_hash in intel_debug.jsonl.`);
  }
  return keys[0].key_hash;
}

export function shouldReplayEntry(entry: DebugEntry, filterKeyHash?: string): boolean {
  if (!filterKeyHash) return true;
  return entry.key_hash === filterKeyHash;
}

export function resolveReplayKeyHash(entry: DebugEntry, assumeKeyHash?: string): string {
  if (entry.key_hash) return entry.key_hash;
  if (assumeKeyHash) return assumeKeyHash;
  return getSingleKeyHash();
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
  stamp("military_intel");
  db.prepare(`
    UPDATE province_effects
    SET received_at = ?
    WHERE province_id = ? AND saved_by = ?
  `).run(receivedAt, provinceId, savedBy);
}

export function replayEntry(entry: DebugEntry, allowed: Set<ReplayType>, options: { keyHash?: string; assumeKeyHash?: string; dryRun?: boolean } = {}) {
  if (!shouldReplayEntry(entry, options.keyHash)) return null;
  const parsed = parseIntel(entry.url, entry.data_simple, entry.prov);
  if (!parsed) return null;
  if (!allowed.has(parsed.type as ReplayType)) return null;

  const keyHash = resolveReplayKeyHash(entry, options.assumeKeyHash);
  const savedBy = entry.prov;
  const normalizedReceivedAt = entry.received_at ? normalizeReceivedAt(entry.received_at) : null;
  if (options.dryRun) return parsed.type;

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
    storeKingdomNews(parsed.data, keyHash, new URL(entry.url).searchParams.get("o") === "SNATCH_NEWS");
    return "kingdom_news";
  }

  if (parsed.type === "state") {
    storeState(parsed.data, savedBy, keyHash);
    return "state";
  }

  if (parsed.type === "som") {
    storeSoM(parsed.data, savedBy, keyHash);
    return "som";
  }

  if (parsed.type === "train_army") {
    storeTrainArmy(parsed.data, savedBy, keyHash);
    return "train_army";
  }

  if (parsed.type === "build") {
    storeBuild(parsed.data, savedBy, keyHash);
    return "build";
  }

  return null;
}

export async function replayDebugLogs({ files, replayTypes, keyHash, assumeKeyHash, dryRun = false }: ReplayOptions): Promise<ReplaySummary> {
  const byType = new Map<string, number>();
  let linesSeen = 0;
  let replayed = 0;

  for (const file of files) {
    const fullPath = resolve(file);
    const stream = createReadStream(fullPath, "utf8");
    const rl = readline.createInterface({
      input: stream,
      crlfDelay: Infinity,
    });

    for await (const line of rl) {
      if (!line.trim()) continue;
      linesSeen += 1;
      const entry = JSON.parse(line) as DebugEntry;
      const type = replayEntry(entry, replayTypes, { keyHash, assumeKeyHash, dryRun });
      if (!type) continue;
      replayed += 1;
      byType.set(type, (byType.get(type) ?? 0) + 1);
    }
  }

  return {
    linesSeen,
    replayed,
    byType,
  };
}
