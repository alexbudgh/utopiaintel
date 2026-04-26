import { NextRequest, NextResponse } from "next/server";
import { appendDebugLog } from "@/lib/debug-log";
import { hashKey } from "@/lib/keys";
import { parseIntel } from "@/lib/parsers";
import { getIntelPathname } from "@/lib/parsers/detect";
import {
  storeSoT,
  storeSurvey,
  storeSoM,
  storeSoS,
  storeSoD,
  storeInfiltrate,
  storeKingdom,
  storeState,
  storeKingdomNews,
  storeTrainArmy,
  storeBuild,
  cleanupExpired,
} from "@/lib/db";

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
  sot:          ["province_overview", "total_military_points", "province_troops", "province_resources", "province_status"],
  survey:       ["survey_intel", "survey_buildings"],
  som:          ["home_military_points", "province_troops", "military_intel", "som_armies"],
  sos:          ["sos_intel", "sos_sciences"],
  sod:          ["home_military_points"],
  infiltrate:   ["province_resources"],
  kingdom:      ["kingdom_intel", "kingdom_provinces", "province_overview"],
  state:        ["province_overview", "province_resources", "province_troops"],
  kingdom_news: ["kingdom_news"],
  train_army:   ["province_resources"],
  build:        ["province_resources"],
};

// Run TTL cleanup roughly once per 100 requests
let requestCount = 0;

function intelLog(message: string) {
  console.log(`[intel ${new Date().toISOString()}] ${message}`);
}

export async function POST(request: NextRequest) {
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
  if (!result) {
    intelLog(`from=${fields.prov}  key=${keyHash.slice(0, 8)}  unrecognized  url=${fields.url}`);
    return NextResponse.json({
      success: true,
      parsed: false,
      message: "Received but could not identify intel type",
    });
  }

  const savedBy = fields.prov;
  const pathname = getIntelPathname(fields.url);
  const isSelfThrone = pathname === "/wol/game/throne";

  const province = "name" in result.data ? result.data.name : "—";
  const kingdom  = "kingdom" in result.data ? result.data.kingdom : result.type === "kingdom_news" ? `${result.data.events.length} events` : "—";
  intelLog(`from=${savedBy}  key=${keyHash.slice(0, 8)}  ${result.type.padEnd(12)}  ${province} (${kingdom})  → ${TABLES[result.type]?.join(", ")}`);

  switch (result.type) {
    case "sot":
      storeSoT(result.data, savedBy, keyHash, isSelfThrone);
      break;
    case "survey":
      storeSurvey(result.data, savedBy, keyHash);
      break;
    case "som":
      storeSoM(result.data, savedBy, keyHash);
      break;
    case "sos":
      storeSoS(result.data, savedBy, keyHash);
      break;
    case "sod":
      storeSoD(result.data, savedBy, keyHash);
      break;
    case "infiltrate":
      storeInfiltrate(result.data, savedBy, keyHash);
      break;
    case "kingdom":
      storeKingdom(result.data, savedBy, keyHash);
      break;
    case "state":
      storeState(result.data, savedBy, keyHash);
      break;
    case "kingdom_news":
      storeKingdomNews(result.data, keyHash, new URL(fields.url).searchParams.get("o") === "SNATCH_NEWS");
      break;
    case "train_army":
      storeTrainArmy(result.data, savedBy, keyHash);
      break;
    case "build":
      storeBuild(result.data, savedBy, keyHash);
      break;
  }

  // Periodic cleanup
  if (++requestCount % 100 === 0) {
    cleanupExpired();
  }

  return NextResponse.json({
    success: true,
    parsed: true,
    type: result.type,
  });
}
