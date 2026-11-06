import { NextResponse, type NextRequest } from "next/server";

const ALLOWED = new Set([
  "https://travaglino.me",
  "https://www.travaglino.me",
  "https://itravaglino.github.io",
]);

export function middleware(request: NextRequest) {
  if (!request.nextUrl.pathname.startsWith("/api/")) return NextResponse.next();
  const origin = request.headers.get("origin");
  const local = origin ? isLocal(origin) : false;
  const allowed = origin && (ALLOWED.has(origin) || local);
  if (request.method === "OPTIONS") {
    const headers = new Headers({ "cache-control": "private, no-store" });
    if (allowed && origin) {
      headers.set("access-control-allow-origin", origin);
      headers.set("access-control-allow-headers", "authorization, content-type");
      headers.set("access-control-allow-methods", "GET, POST, PUT, DELETE, OPTIONS");
      headers.set("vary", "Origin");
    }
    return new NextResponse(null, { status: 204, headers });
  }
  const response = NextResponse.next();
  if (allowed && origin) {
    response.headers.set("access-control-allow-origin", origin);
    response.headers.set("vary", "Origin");
  }
  return response;
}

function isLocal(origin: string): boolean {
  try {
    const url = new URL(origin);
    return url.protocol === "http:" && (url.hostname === "127.0.0.1" || url.hostname === "localhost");
  } catch {
    return false;
  }
}

export const config = { matcher: "/api/:path*" };
