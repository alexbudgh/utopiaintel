import { appendFile } from "fs/promises";
import path from "path";
import { NextRequest, NextResponse } from "next/server";
import { parseIntel } from "@/lib/parsers";
import {
  storeSoT,
  storeSurvey,
  storeSoM,
  storeSoS,
  storeSoD,
  storeKingdom,
  storeState,
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

const DEBUG_LOG = process.env.INTEL_DEBUG === "1";
const LOG_FILE = path.join(process.cwd(), "intel_debug.jsonl");

// Run TTL cleanup roughly once per 100 requests
let requestCount = 0;

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

  if (DEBUG_LOG) {
    const entry = {
      url: fields.url,
      prov: fields.prov,
      data_simple: fields.data_simple,
      received_at: new Date().toISOString(),
    };
    appendFile(LOG_FILE, JSON.stringify(entry) + "\n").catch(() => {});
  }

  const result = parseIntel(fields.url, fields.data_simple, fields.prov);
  if (!result) {
    return NextResponse.json({
      success: true,
      parsed: false,
      message: "Received but could not identify intel type",
    });
  }

  const savedBy = fields.prov;

  switch (result.type) {
    case "sot":
      storeSoT(result.data, savedBy);
      break;
    case "survey":
      storeSurvey(result.data, savedBy);
      break;
    case "som":
      storeSoM(result.data, savedBy);
      break;
    case "sos":
      storeSoS(result.data, savedBy);
      break;
    case "sod":
      storeSoD(result.data, savedBy);
      break;
    case "kingdom":
      storeKingdom(result.data, savedBy);
      break;
    case "state":
      storeState(result.data, savedBy);
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
