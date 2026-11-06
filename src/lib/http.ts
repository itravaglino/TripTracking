import { randomBytes } from "node:crypto";

const SITE_ORIGINS = new Set(["https://travaglino.me", "https://www.travaglino.me"]);

export function requestOrigin(request: Request): string {
  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim() ?? "";
  const host = forwardedHost || request.headers.get("host") || "";
  if (!/^[a-zA-Z0-9.:-]+$/.test(host)) throw new Error("bad_host");
  const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() ?? "";
  const proto = forwardedProto === "http" || forwardedProto === "https"
    ? forwardedProto
    : host.startsWith("localhost") || host.startsWith("127.0.0.1")
      ? "http"
      : "https";
  return `${proto}://${host}`;
}

export function isLocalOrigin(origin: string): boolean {
  try {
    const url = new URL(origin);
    return (url.protocol === "http:" || url.protocol === "https:")
      && (url.hostname === "localhost" || url.hostname === "127.0.0.1");
  } catch {
    return false;
  }
}

export function allowedOrigin(origin: string, selfOrigin: string): boolean {
  if (origin === selfOrigin) return true;
  if (SITE_ORIGINS.has(origin)) return true;
  return isLocalOrigin(origin) && isLocalOrigin(selfOrigin);
}

export function corsHeaders(request: Request): Headers {
  const headers = new Headers();
  const origin = request.headers.get("origin");
  if (!origin) return headers;
  let self = "";
  try {
    self = requestOrigin(request);
  } catch {
    return headers;
  }
  if (!allowedOrigin(origin, self)) return headers;
  headers.set("access-control-allow-origin", origin);
  headers.set("access-control-allow-credentials", "true");
  headers.set("access-control-allow-headers", "authorization, content-type, x-trips-request");
  headers.set("access-control-allow-methods", "GET, POST, PUT, DELETE, OPTIONS");
  headers.set("vary", "Origin");
  return headers;
}

export function json(request: Request, body: unknown, status = 200, extra?: Headers): Response {
  const headers = corsHeaders(request);
  headers.set("content-type", "application/json; charset=utf-8");
  headers.set("cache-control", "private, no-store");
  if (extra) extra.forEach((value, key) => headers.append(key, value));
  return new Response(JSON.stringify(body), { status, headers });
}

export function noContent(request: Request, extra?: Headers): Response {
  const headers = corsHeaders(request);
  headers.set("cache-control", "private, no-store");
  if (extra) extra.forEach((value, key) => headers.append(key, value));
  return new Response(null, { status: 204, headers });
}

export function sameOriginMutation(request: Request): boolean {
  if (request.headers.get("x-trips-request") !== "1") return false;
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    return allowedOrigin(origin, requestOrigin(request));
  } catch {
    return false;
  }
}

export function readCookie(request: Request, name: string): string {
  const header = request.headers.get("cookie") || "";
  for (const part of header.split(";")) {
    const [rawKey, ...rest] = part.trim().split("=");
    if (rawKey === name) return decodeURIComponent(rest.join("="));
  }
  return "";
}

export function sessionCookie(token: string, maxAge: number): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure; SameSite=None" : "; SameSite=Lax";
  const age = maxAge > 0 ? `; Max-Age=${maxAge}` : "; Max-Age=0";
  return `trips_session=${encodeURIComponent(token)}${age}; Path=/; HttpOnly${secure}`;
}

export function shortCookie(name: string, value: string, maxAge: number): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${name}=${encodeURIComponent(value)}; Max-Age=${maxAge}; Path=/; HttpOnly; SameSite=Lax${secure}`;
}

export function cookieHeader(...cookies: string[]): Headers {
  const headers = new Headers();
  for (const cookie of cookies) headers.append("set-cookie", cookie);
  return headers;
}

export function newToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function safeReturn(value: string | null, selfOrigin: string): URL {
  const fallback = new URL("/trips", selfOrigin);
  if (!value) return fallback;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return fallback;
  }
  if (url.pathname !== "/trips" && url.pathname !== "/trips/") return fallback;
  if (url.origin === selfOrigin || SITE_ORIGINS.has(url.origin)) return new URL("/trips", url.origin);
  if (isLocalOrigin(url.origin) && isLocalOrigin(selfOrigin)) return new URL("/trips", url.origin);
  return fallback;
}

export async function readJson(request: Request): Promise<unknown> {
  const text = await request.text();
  if (text.length > 8000) throw new Error("body_too_large");
  if (!text) return {};
  return JSON.parse(text) as unknown;
}

export function googleConfigured(): boolean {
  return Boolean(
    process.env.GOOGLE_CLIENT_ID?.trim()
    && process.env.GOOGLE_CLIENT_SECRET?.trim()
    && (process.env.TOKEN_ENCRYPTION_KEY?.trim().length ?? 0) >= 16,
  );
}
