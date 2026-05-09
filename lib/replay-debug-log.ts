import { createReadStream } from "node:fs";
import { resolve } from "node:path";
import { hashKey } from "./keys";
import readline from "node:readline";
import { buildIntelOpAttempt } from "./intel-ops";
import { parseIntel } from "./parsers";
import { getIntelPathname, matchesGamePath, extractProvinceOperationsInfo } from "./parsers/detect";
import { parseKingdomNews } from "./parsers/kingdom_news";
import { parseSoT } from "./parsers/sot";
import {
  getDb,
  storeSoT,
  storeKingdom,
  storeSurvey,
  storeKingdomNews,
  storeState,
  storeSoM,
  storeSoS,
  storeSoD,
  storeInfiltrate,
  storeTrainArmy,
  storeBuild,
  storeRob,
  storeIntelOp,
  storeSorcery,
  storeAttack,
  setMetricsCacheRefreshEnabled,
  flushMetricsCacheRefreshQueue,
} from "./db";

export type ReplayType = "kingdom" | "survey" | "sot" | "kingdom_news" | "state" | "som" | "sos" | "sod" | "infiltrate" | "train_army" | "build" | "rob" | "sorcery" | "attack";

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
  refreshMetrics?: boolean;
}

export interface ReplaySummary {
  linesSeen: number;
  replayed: number;
  byType: Map<string, number>;
}

export const allowedReplayTypes = new Set<ReplayType>(["kingdom", "survey", "sot", "kingdom_news", "state", "som", "sos", "sod", "infiltrate", "train_army", "build", "rob", "sorcery", "attack"]);

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
  return hashKey(rawKey);
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

export function replayEntry(entry: DebugEntry, allowed: Set<ReplayType>, options: { keyHash?: string; assumeKeyHash?: string; dryRun?: boolean } = {}) {
  if (!shouldReplayEntry(entry, options.keyHash)) return null;
  const parsed = parseIntel(entry.url, entry.data_simple, entry.prov);
  const intelOpAttempt = buildIntelOpAttempt(entry.url, entry.data_simple, parsed);
  if (!parsed) {
    if (!intelOpAttempt || !allowed.has(intelOpAttempt.intelType)) return null;

    const keyHash = resolveReplayKeyHash(entry, options.assumeKeyHash);
    const normalizedReceivedAt = entry.received_at ? normalizeReceivedAt(entry.received_at) : null;
    if (options.dryRun) return intelOpAttempt.intelType;

    storeIntelOp(intelOpAttempt, entry.prov, keyHash, normalizedReceivedAt ?? undefined);
    return intelOpAttempt.intelType;
  }

  const shouldReplayParsed = allowed.has(parsed.type as ReplayType);
  const shouldReplayIntelOp = !!intelOpAttempt && allowed.has(intelOpAttempt.intelType);
  if (!shouldReplayParsed && !shouldReplayIntelOp) return null;

  const keyHash = resolveReplayKeyHash(entry, options.assumeKeyHash);
  const savedBy = entry.prov;
  const normalizedReceivedAt = entry.received_at ? normalizeReceivedAt(entry.received_at) : null;
  if (options.dryRun) return shouldReplayParsed ? parsed.type : intelOpAttempt?.intelType ?? null;

  if (shouldReplayIntelOp) storeIntelOp(intelOpAttempt, savedBy, keyHash, normalizedReceivedAt ?? undefined);
  if (!shouldReplayParsed) return intelOpAttempt?.intelType ?? null;

  if (parsed.type === "kingdom") {
    storeKingdom(parsed.data, savedBy, keyHash, normalizedReceivedAt ?? undefined);
    return "kingdom";
  }

  if (parsed.type === "survey") {
    const isSelfInternal = matchesGamePath(getIntelPathname(entry.url), "council_internal");
    storeSurvey(parsed.data, savedBy, keyHash, isSelfInternal, normalizedReceivedAt ?? undefined);
    return "survey";
  }

  if (parsed.type === "sot") {
    const pathname = getIntelPathname(entry.url);
    const isSelfThrone = matchesGamePath(pathname, "throne");
    storeSoT(parsed.data, savedBy, keyHash, isSelfThrone, normalizedReceivedAt ?? undefined);
    return "sot";
  }

  if (parsed.type === "kingdom_news") {
    const params = new URL(entry.url).searchParams;
    const isExternalNews =
      params.get("o")?.toUpperCase() === "SNATCH_NEWS" ||
      params.get("s")?.toUpperCase() === "CRYSTAL_EYE";
    const urlKingdom = extractProvinceOperationsInfo(entry.url)?.kingdom ?? null;
    storeKingdomNews(parsed.data, keyHash, isExternalNews, normalizedReceivedAt ?? undefined, urlKingdom);
    return "kingdom_news";
  }

  if (parsed.type === "state") {
    storeState(parsed.data, savedBy, keyHash, normalizedReceivedAt ?? undefined);
    return "state";
  }

  if (parsed.type === "som") {
    const isSelfMilitary = matchesGamePath(getIntelPathname(entry.url), "council_military");
    storeSoM(parsed.data, savedBy, keyHash, isSelfMilitary, normalizedReceivedAt ?? undefined);
    return "som";
  }

  if (parsed.type === "sos") {
    const isSelfScience = matchesGamePath(getIntelPathname(entry.url), "council_science");
    storeSoS(parsed.data, savedBy, keyHash, isSelfScience, normalizedReceivedAt ?? undefined);
    return "sos";
  }

  if (parsed.type === "sod") {
    storeSoD(parsed.data, savedBy, keyHash, normalizedReceivedAt ?? undefined);
    return "sod";
  }

  if (parsed.type === "infiltrate") {
    storeInfiltrate(parsed.data, savedBy, keyHash, normalizedReceivedAt ?? undefined);
    return "infiltrate";
  }

  if (parsed.type === "train_army") {
    storeTrainArmy(parsed.data, savedBy, keyHash, normalizedReceivedAt ?? undefined);
    return "train_army";
  }

  if (parsed.type === "build") {
    storeBuild(parsed.data, savedBy, keyHash, normalizedReceivedAt ?? undefined);
    return "build";
  }

  if (parsed.type === "rob") {
    storeRob(parsed.data, savedBy, keyHash, normalizedReceivedAt ?? undefined);
    return "rob";
  }

  if (parsed.type === "sorcery") {
    storeSorcery(parsed.data, savedBy, keyHash, normalizedReceivedAt ?? undefined);
    if (parsed.data.spell === "CRYSTAL_EYE") {
      const newsData = parseKingdomNews(entry.data_simple);
      if (newsData) {
        const urlKingdom = extractProvinceOperationsInfo(entry.url)?.kingdom ?? null;
        storeKingdomNews(newsData, keyHash, true, normalizedReceivedAt ?? undefined, urlKingdom);
      }
    }
    if (parsed.data.spell === "CRYSTAL_BALL") {
      const sotData = parseSoT(entry.data_simple);
      if (sotData) storeSoT(sotData, savedBy, keyHash, false, normalizedReceivedAt ?? undefined);
    }
    return "sorcery";
  }

  if (parsed.type === "attack") {
    storeAttack(parsed.data, savedBy, keyHash, normalizedReceivedAt ?? undefined);
    return "attack";
  }

  return null;
}

export async function replayDebugLogs({ files, replayTypes, keyHash, assumeKeyHash, dryRun = false, refreshMetrics = false }: ReplayOptions): Promise<ReplaySummary> {
  const restoreMetricsCacheRefresh = setMetricsCacheRefreshEnabled(refreshMetrics);
  const byType = new Map<string, number>();
  let linesSeen = 0;
  let replayed = 0;

  try {
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
  } finally {
    if (refreshMetrics && !dryRun) await flushMetricsCacheRefreshQueue();
    restoreMetricsCacheRefresh();
  }

  return {
    linesSeen,
    replayed,
    byType,
  };
}
