import { createReadStream } from "node:fs";
import { resolve } from "node:path";
import { hashKey } from "./keys";
import readline from "node:readline";
import { buildIntelOpAttempt } from "./intel-ops";
import { parseIntel } from "./parsers";
import { getIntelPathname, matchesGamePath, extractProvinceOperationsInfo } from "./parsers/detect";
import { parseKingdomNews } from "./parsers/kingdom_news";
import { parseSoT } from "./parsers/sot";
import { getDbApi, setMetricsCacheRefreshEnabled, flushMetricsCacheRefreshQueue } from "./db-api";

export type ReplayType = "kingdom" | "survey" | "sot" | "kingdom_news" | "province_news" | "state" | "som" | "sos" | "sod" | "infiltrate" | "train_army" | "build" | "rob" | "sorcery" | "attack";

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

export const allowedReplayTypes = new Set<ReplayType>(["kingdom", "survey", "sot", "kingdom_news", "province_news", "state", "som", "sos", "sod", "infiltrate", "train_army", "build", "rob", "sorcery", "attack"]);

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

export function shouldReplayEntry(entry: DebugEntry, filterKeyHash?: string): boolean {
  if (!filterKeyHash) return true;
  return entry.key_hash === filterKeyHash;
}

export function resolveReplayKeyHash(entry: DebugEntry, assumeKeyHash?: string): string {
  if (entry.key_hash) return entry.key_hash;
  if (assumeKeyHash) return assumeKeyHash;
  throw new Error("Cannot resolve key_hash: entry has no key_hash and --assume-key-hash was not provided.");
}

export async function replayEntry(entry: DebugEntry, allowed: Set<ReplayType>, options: { keyHash?: string; assumeKeyHash?: string; dryRun?: boolean } = {}): Promise<string | null> {
  if (!shouldReplayEntry(entry, options.keyHash)) return null;
  const parsed = parseIntel(entry.url, entry.data_simple, entry.prov);
  const intelOpAttempt = buildIntelOpAttempt(entry.url, entry.data_simple, parsed);
  if (!parsed) {
    if (!intelOpAttempt || !allowed.has(intelOpAttempt.intelType)) return null;

    const keyHash = resolveReplayKeyHash(entry, options.assumeKeyHash);
    const normalizedReceivedAt = entry.received_at ? normalizeReceivedAt(entry.received_at) : null;
    if (options.dryRun) return intelOpAttempt.intelType;

    await getDbApi().storeIntelOp(intelOpAttempt, entry.prov, keyHash, normalizedReceivedAt ?? undefined);
    return intelOpAttempt.intelType;
  }

  const shouldReplayParsed = allowed.has(parsed.type as ReplayType);
  const shouldReplayIntelOp = !!intelOpAttempt && allowed.has(intelOpAttempt.intelType);
  if (!shouldReplayParsed && !shouldReplayIntelOp) return null;

  const keyHash = resolveReplayKeyHash(entry, options.assumeKeyHash);
  const savedBy = entry.prov;
  const normalizedReceivedAt = entry.received_at ? normalizeReceivedAt(entry.received_at) : null;
  if (options.dryRun) return shouldReplayParsed ? parsed.type : intelOpAttempt?.intelType ?? null;

  const db = getDbApi();
  const ra = normalizedReceivedAt ?? undefined;

  if (shouldReplayIntelOp) await db.storeIntelOp(intelOpAttempt, savedBy, keyHash, ra);
  if (!shouldReplayParsed) return intelOpAttempt?.intelType ?? null;

  if (parsed.type === "kingdom") {
    await db.storeKingdom(parsed.data, savedBy, keyHash, ra);
    return "kingdom";
  }

  if (parsed.type === "survey") {
    const isSelfInternal = matchesGamePath(getIntelPathname(entry.url), "council_internal");
    await db.storeSurvey(parsed.data, savedBy, keyHash, isSelfInternal, ra);
    return "survey";
  }

  if (parsed.type === "sot") {
    const isSelfThrone = matchesGamePath(getIntelPathname(entry.url), "throne");
    await db.storeSoT(parsed.data, savedBy, keyHash, isSelfThrone, ra);
    return "sot";
  }

  if (parsed.type === "kingdom_news") {
    const params = new URL(entry.url).searchParams;
    const isExternalNews =
      params.get("o")?.toUpperCase() === "SNATCH_NEWS" ||
      params.get("s")?.toUpperCase() === "CRYSTAL_EYE";
    const urlKingdom = extractProvinceOperationsInfo(entry.url)?.kingdom ?? null;
    await db.storeKingdomNews(parsed.data, keyHash, isExternalNews, ra, urlKingdom);
    return "kingdom_news";
  }

  if (parsed.type === "state") {
    await db.storeState(parsed.data, savedBy, keyHash, ra);
    return "state";
  }

  if (parsed.type === "som") {
    const isSelfMilitary = matchesGamePath(getIntelPathname(entry.url), "council_military");
    await db.storeSoM(parsed.data, savedBy, keyHash, isSelfMilitary, ra);
    return "som";
  }

  if (parsed.type === "sos") {
    const isSelfScience = matchesGamePath(getIntelPathname(entry.url), "council_science");
    await db.storeSoS(parsed.data, savedBy, keyHash, isSelfScience, ra);
    return "sos";
  }

  if (parsed.type === "sod") {
    await db.storeSoD(parsed.data, savedBy, keyHash, ra);
    return "sod";
  }

  if (parsed.type === "infiltrate") {
    await db.storeInfiltrate(parsed.data, savedBy, keyHash, ra);
    return "infiltrate";
  }

  if (parsed.type === "train_army") {
    await db.storeTrainArmy(parsed.data, savedBy, keyHash, ra);
    return "train_army";
  }

  if (parsed.type === "build") {
    await db.storeBuild(parsed.data, savedBy, keyHash, ra);
    return "build";
  }

  if (parsed.type === "rob") {
    await db.storeRob(parsed.data, savedBy, keyHash, ra);
    return "rob";
  }

  if (parsed.type === "sorcery") {
    await db.storeSorcery(parsed.data, savedBy, keyHash, ra);
    if (parsed.data.spell === "CRYSTAL_EYE") {
      const newsData = parseKingdomNews(entry.data_simple);
      if (newsData) {
        const urlKingdom = extractProvinceOperationsInfo(entry.url)?.kingdom ?? null;
        await db.storeKingdomNews(newsData, keyHash, true, ra, urlKingdom);
      }
    }
    if (parsed.data.spell === "CRYSTAL_BALL") {
      const sotData = parseSoT(entry.data_simple);
      if (sotData) await db.storeSoT(sotData, savedBy, keyHash, false, ra);
    }
    return "sorcery";
  }

  if (parsed.type === "attack") {
    await db.storeAttack(parsed.data, savedBy, keyHash, ra);
    return "attack";
  }

  if (parsed.type === "province_news") {
    await db.storeProvinceNews(parsed.data, savedBy, keyHash, ra);
    return "province_news";
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
      const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

      for await (const line of rl) {
        if (!line.trim()) continue;
        linesSeen += 1;
        const entry = JSON.parse(line) as DebugEntry;
        const type = await replayEntry(entry, replayTypes, { keyHash, assumeKeyHash, dryRun });
        if (!type) continue;
        replayed += 1;
        byType.set(type, (byType.get(type) ?? 0) + 1);
      }
    }
  } finally {
    if (refreshMetrics && !dryRun) await flushMetricsCacheRefreshQueue();
    restoreMetricsCacheRefresh();
  }

  return { linesSeen, replayed, byType };
}
