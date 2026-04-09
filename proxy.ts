import { NextRequest, NextResponse } from "next/server";

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // CORS for API routes
  if (pathname.startsWith("/api/")) {
    const response = NextResponse.next();
    response.headers.set("Access-Control-Allow-Origin", "*");
    response.headers.set("Access-Control-Allow-Methods", "POST");
    response.headers.set("Access-Control-Max-Age", "1000");
    return response;
  }

  // Auth for UI routes
  if (!pathname.startsWith("/login")) {
    const cookie = request.cookies.get("auth")?.value;
    if (!cookie) {
      const proto = request.headers.get("x-forwarded-proto") ?? "https";
      const host = request.headers.get("host") ?? "";
      return NextResponse.redirect(new URL("/login", `${proto}://${host}`));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
