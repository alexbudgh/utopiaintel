import { NextResponse } from "next/server";
import { withAxiom, AxiomRequest } from "next-axiom";
import { appendDebugLog } from "@/lib/debug-log";
import { hashKey } from "@/lib/keys";
import { buildIntelOpAttempt } from "@/lib/intel-ops";
import { parseIntel } from "@/lib/parsers";
import {
  getIntelPathname,
  matchesGamePath,
  extractProvinceOperationsInfo,
} from "@/lib/parsers/detect";
import { parseKingdomNews } from "@/lib/parsers/kingdom_news";
import { parseProvinceNews } from "@/lib/parsers/province_news";
import { parseSoT } from "@/lib/parsers/sot";
import { getDbApi } from "@/lib/db-api";
import {
  isProvinceLogsUrl,
  parseProvinceLogs,
  storeProvinceLogResult,
} from "@/lib/province-logs";

interface IntelFields {
  data_html: string;
  data_simple: string;
  url: string;
  prov: string;
  key: string;
}

const REQUIRED_FIELDS: (keyof IntelFields)[] = [
  "data_html",
  "data_simple",
  "url",
  "prov",
  "key",
];

const TABLES: Record<string, string[]> = {
  sot: [
    "province_overview",
    "total_military_points",
    "province_troops",
    "province_resources",
    "province_status",
  ],
  survey: ["survey_intel", "survey_buildings"],
  som: [
    "home_military_points",
    "province_troops",
    "military_intel",
    "som_armies",
  ],
  sos: ["sos_intel", "sos_sciences"],
  sod: ["home_military_points"],
  infiltrate: ["province_resources"],
  kingdom: ["kingdom_intel", "kingdom_provinces", "province_overview"],
  state: ["province_overview", "province_resources", "province_troops"],
  kingdom_news: ["kingdom_news"],
  train_army: ["province_resources"],
  build: ["province_resources"],
  rob: ["rob_ops"],
  sorcery: ["sorcery_ops"],
  attack: ["attack_ops"],
  province_logs: [
    "attack_ops",
    "rob_ops",
    "sorcery_ops",
    "intel_ops",
    "military_intel",
    "home_military_points",
    "province_resources",
  ],
};

// Run TTL cleanup roughly once per 100 requests
let requestCount = 0;

function intelLog(message: string) {
  console.log(`[intel ${new Date().toISOString()}] ${message}`);
}

type ParseResult = NonNullable<ReturnType<typeof parseIntel>>;

function getLogProvince(result: ParseResult): string {
  if (result.type === "kingdom") return "—";
  return "name" in result.data ? result.data.name : "—";
}

function getLogKingdom(result: ParseResult): string {
  if (result.type === "kingdom")
    return `${result.data.name} (${result.data.location})`;
  if (result.type === "kingdom_news")
    return `${result.data.events.length} events`;
  if (result.type === "province_news")
    return `${result.data.events.length} events`;
  return "kingdom" in result.data ? result.data.kingdom : "—";
}

export const POST = withAxiom(async (request: AxiomRequest) => {
  const formData = await request.formData();

  const missing = REQUIRED_FIELDS.filter((f) => !formData.get(f));
  if (missing.length > 0) {
    return NextResponse.json(
      { success: false, error: `Missing fields: ${missing.join(", ")}` },
      { status: 400 },
    );
  }

  const fields: IntelFields = {
    data_html: formData.get("data_html") as string,
    data_simple: formData.get("data_simple") as string,
    url: formData.get("url") as string,
    prov: formData.get("prov") as string,
    key: formData.get("key") as string,
  };
  const keyHash = hashKey(fields.key);

  void appendDebugLog({
    url: fields.url,
    prov: fields.prov,
    data_simple: fields.data_simple,
    key_hash: keyHash,
    received_at: new Date().toISOString(),
  }).catch(() => {});

  const result = parseIntel(fields.url, fields.data_simple, fields.prov);
  const intelOpAttempt = buildIntelOpAttempt(
    fields.url,
    fields.data_simple,
    result,
  );
  const db = getDbApi();
  if (isProvinceLogsUrl(fields.url)) {
    const results = parseProvinceLogs(fields.data_simple, fields.prov);
    for (const logResult of results) {
      await storeProvinceLogResult(db, logResult, fields.prov, keyHash);
    }

    const byType = results.reduce<Record<string, number>>((acc, item) => {
      acc[item.type] = (acc[item.type] ?? 0) + 1;
      return acc;
    }, {});
    intelLog(
      `from=${fields.prov}  key=${keyHash.slice(0, 8)}  province_logs  ${results.length} ops  → ${TABLES.province_logs.join(", ")}`,
    );
    request.log.info("intel", {
      type: "province_logs",
      parsedOps: results.length,
      byType,
      savedBy: fields.prov,
      keyHash: keyHash.slice(0, 8),
    });

    if (++requestCount % 100 === 0) {
      void db.cleanupExpired();
    }

    return NextResponse.json({
      success: true,
      parsed: results.length > 0,
      type: "province_logs",
      parsedOps: results.length,
      byType,
    });
  }

  if (intelOpAttempt)
    await db.storeIntelOp(intelOpAttempt, fields.prov, keyHash);

  if (!result) {
    intelLog(
      `from=${fields.prov}  key=${keyHash.slice(0, 8)}  unrecognized  url=${fields.url}`,
    );
    request.log.warn("unrecognized intel", {
      url: fields.url,
      prov: fields.prov,
      keyHash: keyHash.slice(0, 8),
    });
    return NextResponse.json({
      success: true,
      parsed: false,
      message: "Received but could not identify intel type",
    });
  }

  const savedBy = fields.prov;
  const pathname = getIntelPathname(fields.url);
  const isSelfThrone = matchesGamePath(pathname, "throne");
  const isSelfMilitary = matchesGamePath(pathname, "council_military");
  const isSelfScience = matchesGamePath(pathname, "council_science");
  const isSelfInternal = matchesGamePath(pathname, "council_internal");

  const province = getLogProvince(result);
  const kingdom = getLogKingdom(result);
  intelLog(
    `from=${savedBy}  key=${keyHash.slice(0, 8)}  ${result.type.padEnd(12)}  ${province} (${kingdom})  → ${TABLES[result.type]?.join(", ")}`,
  );
  request.log.info("intel", {
    type: result.type,
    province,
    kingdom,
    savedBy,
    keyHash: keyHash.slice(0, 8),
  });

  switch (result.type) {
    case "sot":
      await db.storeSoT(result.data, savedBy, keyHash, isSelfThrone);
      if (isSelfThrone) {
        const newsData = parseProvinceNews(fields.data_simple);
        if (newsData) await db.storeProvinceNews(newsData, savedBy, keyHash);
      }
      break;
    case "survey":
      await db.storeSurvey(result.data, savedBy, keyHash, isSelfInternal);
      break;
    case "som":
      await db.storeSoM(result.data, savedBy, keyHash, isSelfMilitary);
      break;
    case "sos":
      await db.storeSoS(result.data, savedBy, keyHash, isSelfScience);
      break;
    case "sod":
      await db.storeSoD(result.data, savedBy, keyHash);
      break;
    case "infiltrate":
      await db.storeInfiltrate(result.data, savedBy, keyHash);
      break;
    case "kingdom":
      await db.storeKingdom(result.data, savedBy, keyHash);
      break;
    case "state":
      await db.storeState(result.data, savedBy, keyHash);
      break;
    case "kingdom_news": {
      const params = new URL(fields.url).searchParams;
      const isExternalNews =
        params.get("o")?.toUpperCase() === "SNATCH_NEWS" ||
        params.get("s")?.toUpperCase() === "CRYSTAL_EYE";
      const urlKingdom =
        extractProvinceOperationsInfo(fields.url)?.kingdom ?? null;
      await db.storeKingdomNews(
        result.data,
        keyHash,
        isExternalNews,
        undefined,
        urlKingdom,
      );
      break;
    }
    case "province_news":
      await db.storeProvinceNews(result.data, savedBy, keyHash);
      break;
    case "train_army":
      await db.storeTrainArmy(result.data, savedBy, keyHash);
      break;
    case "build":
      await db.storeBuild(result.data, savedBy, keyHash);
      break;
    case "rob":
      await db.storeRob(result.data, savedBy, keyHash);
      break;
    case "sorcery":
      await db.storeSorcery(result.data, savedBy, keyHash);
      if (result.data.spell === "CRYSTAL_EYE") {
        const newsData = parseKingdomNews(fields.data_simple);
        if (newsData) {
          const urlKingdom =
            extractProvinceOperationsInfo(fields.url)?.kingdom ?? null;
          await db.storeKingdomNews(
            newsData,
            keyHash,
            true,
            undefined,
            urlKingdom,
          );
        }
      }
      if (result.data.spell === "CRYSTAL_BALL") {
        const sotData = parseSoT(fields.data_simple);
        if (sotData) await db.storeSoT(sotData, savedBy, keyHash);
      }
      break;
    case "attack":
      await db.storeAttack(result.data, savedBy, keyHash);
      break;
  }

  // Periodic cleanup
  if (++requestCount % 100 === 0) {
    void db.cleanupExpired();
  }

  return NextResponse.json({
    success: true,
    parsed: true,
    type: result.type,
  });
});
