import { NextRequest, NextResponse } from "next/server";
import { parseIntel } from "@/lib/parsers";
import {
  storeSoT,
  storeSurvey,
  storeSoM,
  storeSoS,
  storeSoD,
  storeKingdom,
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

  const result = parseIntel(fields.url, fields.data_simple);
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
