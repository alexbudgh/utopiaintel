import { NextResponse } from "next/server";

export function middleware() {
  const response = NextResponse.next();
  response.headers.set("Access-Control-Allow-Origin", "*");
  response.headers.set("Access-Control-Allow-Methods", "POST");
  response.headers.set("Access-Control-Max-Age", "1000");
  return response;
}

export const config = {
  matcher: "/api/:path*",
};
