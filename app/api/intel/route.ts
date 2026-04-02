import { appendFile } from "fs/promises";
import path from "path";
import { NextRequest, NextResponse } from "next/server";

const LOG_FILE = path.join(process.cwd(), "intel.jsonl");

interface IntelData {
  data_html: string;
  data_simple: string;
  url: string;
  prov: string;
  key: string;
}

const REQUIRED_FIELDS: (keyof IntelData)[] = [
  "data_html",
  "data_simple",
  "url",
  "prov",
  "key",
];

export async function POST(request: NextRequest) {
  const formData = await request.formData();

  const missing = REQUIRED_FIELDS.filter((f) => !formData.get(f));
  if (missing.length > 0) {
    return NextResponse.json(
      { success: false, error: `Missing fields: ${missing.join(", ")}` },
      { status: 400 },
    );
  }

  const data: IntelData = {
    data_html: formData.get("data_html") as string,
    data_simple: formData.get("data_simple") as string,
    url: formData.get("url") as string,
    prov: formData.get("prov") as string,
    key: formData.get("key") as string,
  };

  const entry = { ...data, received_at: new Date().toISOString() };
  await appendFile(LOG_FILE, JSON.stringify(entry) + "\n");

  return NextResponse.json({ success: true });
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST",
      "Access-Control-Max-Age": "1000",
    },
  });
}
