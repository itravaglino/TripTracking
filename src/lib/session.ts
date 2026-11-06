import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { sessionSecret } from "./secrets";

const COOKIE = "tt_session";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

type Payload = { id: string; exp: number };

function secret(): string | null {
  return sessionSecret();
}

function sign(body: string, key: string): string {
  return createHmac("sha256", key).update(body).digest("base64url");
}

export function createSessionToken(profileId: string): string | null {
  const key = secret();
  if (!key) return null;
  const body = Buffer.from(
    JSON.stringify({ id: profileId, exp: Math.floor(Date.now() / 1000) + MAX_AGE_SECONDS } satisfies Payload),
  ).toString("base64url");
  return `${body}.${sign(body, key)}`;
}

export function readSessionToken(token: string | null | undefined): string | null {
  if (!token) return null;
  const key = secret();
  if (!key) return null;
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;
  const body = token.slice(0, dot);
  const mac = token.slice(dot + 1);
  const expected = sign(body, key);
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as Payload;
    if (!payload.id || typeof payload.exp !== "number") return null;
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload.id;
  } catch {
    return null;
  }
}

export function sessionCookie(token: string): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${COOKIE}=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${MAX_AGE_SECONDS}${secure}`;
}

export function clearSessionCookie(): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${COOKIE}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0${secure}`;
}

export function profileIdFromRequest(request: Request): string | null {
  const header = request.headers.get("authorization");
  if (header?.toLowerCase().startsWith("bearer ")) {
    const fromBearer = readSessionToken(header.slice(7).trim());
    if (fromBearer) return fromBearer;
  }
  const cookie = request.headers.get("cookie") ?? "";
  const match = cookie.match(/(?:^|;\s*)tt_session=([^;]+)/);
  return readSessionToken(match?.[1] ? decodeURIComponent(match[1]) : null);
}

export function newState(): string {
  return randomBytes(24).toString("base64url");
}

const ALLOWED_RETURN_HOSTS = new Set(["travaglino.me", "www.travaglino.me", "itravaglino.github.io"]);

export function safeReturnTo(value: string | null, request: Request): string {
  const fallback = new URL("/", request.url).toString();
  if (!value) return fallback;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return fallback;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return fallback;
  const own = new URL(request.url);
  const local = url.hostname === "127.0.0.1" || url.hostname === "localhost";
  const sameOrigin = url.origin === own.origin;
  const sitePath = url.pathname === "/trips" || url.pathname.startsWith("/trips/");
  if (sameOrigin || (local && url.protocol === "http:")) return url.origin + url.pathname + url.search;
  if (url.protocol === "https:" && ALLOWED_RETURN_HOSTS.has(url.hostname) && sitePath) {
    return url.origin + url.pathname + url.search;
  }
  return fallback;
}

export function allowsMutation(request: Request): boolean {
  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite === "cross-site") {
    const auth = request.headers.get("authorization") ?? "";
    return auth.toLowerCase().startsWith("bearer ");
  }
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}
