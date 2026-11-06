import { createSession, createDemoUser, clearGmail, deleteSession, publicViewer, saveProfile, upsertGoogleUser, viewerFromRequest } from "../../../src/lib/account";
import { sha256 } from "../../../src/lib/crypto";
import { sql } from "../../../src/lib/db";
import { exchangeCode, googleAuthUrl, googleProfile, revokeToken } from "../../../src/lib/gmail";
import {
  cookieHeader,
  corsHeaders,
  googleConfigured,
  json,
  newToken,
  readCookie,
  readJson,
  requestOrigin,
  safeReturn,
  sameOriginMutation,
  sessionCookie,
  shortCookie,
} from "../../../src/lib/http";
import { safeEqual } from "../../../src/lib/crypto";
import { normalizeSettings } from "../../../public/trips/engine.js";
import { loadViewer } from "../../../src/lib/account";
import { dueViewerIds, maybeScan, reservationsFor, scanViewer } from "../../../src/lib/scan";
import { startScheduler } from "../../../src/lib/scheduler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const demoHits = new Map<string, { count: number; reset: number }>();

export function OPTIONS(request: Request): Response {
  return new Response(null, { status: 204, headers: corsHeaders(request) });
}

export function GET(request: Request, context: { params: Promise<{ path: string[] }> }): Promise<Response> {
  return handle(request, context);
}

export function POST(request: Request, context: { params: Promise<{ path: string[] }> }): Promise<Response> {
  return handle(request, context);
}

export function PUT(request: Request, context: { params: Promise<{ path: string[] }> }): Promise<Response> {
  return handle(request, context);
}

async function handle(request: Request, context: { params: Promise<{ path: string[] }> }): Promise<Response> {
  startScheduler();
  const path = (await context.params).path.join("/");
  try {
    if (path === "me" && request.method === "GET") return me(request);
    if (path === "reservations" && request.method === "GET") return reservations(request);
    if (path === "settings" && request.method === "PUT") return settings(request);
    if (path === "scan" && request.method === "POST") return scan(request);
    if (path === "auth/google" && request.method === "GET") return googleStart(request);
    if (path === "auth/google/callback" && request.method === "GET") return googleCallback(request);
    if (path === "auth/exchange" && request.method === "POST") return exchange(request);
    if (path === "auth/demo" && request.method === "POST") return demo(request);
    if (path === "auth/logout" && request.method === "POST") return logout(request);
    if (path === "auth/disconnect" && request.method === "POST") return disconnect(request);
    if (path === "cron" && request.method === "POST") return cron(request);
    return json(request, { error: "not_found" }, 404);
  } catch (error) {
    const reason = error instanceof Error ? error.message : "";
    if (reason === "body_too_large") return json(request, { error: "body_too_large" }, 413);
    console.error("trips api failed", path, error instanceof Error ? error.name : "error");
    return json(request, { error: "server_error" }, 500);
  }
}

async function me(request: Request): Promise<Response> {
  const viewer = await viewerFromRequest(request);
  return json(request, {
    service: "trips",
    googleConfigured: googleConfigured(),
    viewer: viewer ? publicViewer(viewer) : null,
  });
}

async function reservations(request: Request): Promise<Response> {
  const viewer = await viewerFromRequest(request);
  if (!viewer) return json(request, { error: "unauthorized" }, 401);
  await maybeScan(viewer);
  const fresh = (await viewerFromRequest(request)) || viewer;
  return json(request, {
    service: "trips",
    viewer: publicViewer(fresh),
    reservations: await reservationsFor(fresh.id),
  });
}

async function settings(request: Request): Promise<Response> {
  const denied = mutationDenied(request);
  if (denied) return denied;
  const viewer = await viewerFromRequest(request);
  if (!viewer) return json(request, { error: "unauthorized" }, 401);
  const body = await readJson(request);
  const record = body && typeof body === "object" ? body as { track?: unknown; scanIntervalMinutes?: unknown; setupComplete?: unknown } : {};
  const normalized = normalizeSettings({
    track: record.track,
    scanIntervalMinutes: record.scanIntervalMinutes,
  });
  const setupComplete = record.setupComplete === true || viewer.setupComplete;
  await saveProfile(viewer.id, normalized, setupComplete);
  const fresh = await viewerFromRequest(request);
  return json(request, { viewer: fresh ? publicViewer(fresh) : null });
}

async function scan(request: Request): Promise<Response> {
  const denied = mutationDenied(request);
  if (denied) return denied;
  const viewer = await viewerFromRequest(request);
  if (!viewer) return json(request, { error: "unauthorized" }, 401);
  if (!viewer.setupComplete) return json(request, { error: "setup_required" }, 409);
  if (viewer.lastManualScanAt && Date.now() - Date.parse(viewer.lastManualScanAt) < 60_000) {
    return json(request, { error: "rate_limited" }, 429);
  }
  const result = await scanViewer(viewer, true);
  const fresh = (await viewerFromRequest(request)) || viewer;
  return json(request, {
    ...result,
    viewer: publicViewer(fresh),
    reservations: await reservationsFor(fresh.id),
  });
}

function googleStart(request: Request): Response {
  if (!googleConfigured()) return json(request, { error: "google_not_configured" }, 503);
  const origin = requestOrigin(request);
  const url = new URL(request.url);
  const back = safeReturn(url.searchParams.get("return"), origin).href;
  const state = newToken(24);
  const headers = cookieHeader(
    shortCookie("trips_oauth_state", state, 600),
    shortCookie("trips_oauth_return", back, 600),
  );
  return redirect(googleAuthUrl(origin, state), headers);
}

async function googleCallback(request: Request): Promise<Response> {
  const origin = requestOrigin(request);
  const back = safeReturn(readCookie(request, "trips_oauth_return"), origin);
  const fail = (code: string) => {
    back.searchParams.set("error", code);
    return redirect(back.href, cookieHeader(shortCookie("trips_oauth_state", "", 0), shortCookie("trips_oauth_return", "", 0)));
  };
  if (!googleConfigured()) return fail("google_not_configured");
  const url = new URL(request.url);
  if (url.searchParams.get("error")) return fail("access_denied");
  const state = url.searchParams.get("state") || "";
  const expected = readCookie(request, "trips_oauth_state");
  const code = url.searchParams.get("code") || "";
  if (!state || state.length > 200 || state !== expected || !code || code.length > 2048) return fail("oauth_failed");
  const tokens = await exchangeCode(origin, code);
  if (!tokens.access_token || !tokens.refresh_token) return fail("oauth_failed");
  const profile = await googleProfile(tokens.access_token);
  const userId = await upsertGoogleUser(profile, tokens.refresh_token);
  const token = await createSession(userId);
  const headers = cookieHeader(
    sessionCookie(token, 60 * 60 * 24 * 30),
    shortCookie("trips_oauth_state", "", 0),
    shortCookie("trips_oauth_return", "", 0),
  );
  if (back.origin === origin) return redirect(back.href, headers);
  const loginCode = newToken(24);
  await sql(
    "insert into login_codes (code_hash, session_token, expires_at) values ($1, $2, now() + interval '2 minutes')",
    [sha256(loginCode), token],
  );
  back.hash = `code=${loginCode}`;
  return redirect(back.href, headers);
}

async function exchange(request: Request): Promise<Response> {
  const denied = mutationDenied(request);
  if (denied) return denied;
  const body = await readJson(request);
  const code = body && typeof body === "object" && typeof (body as { code?: unknown }).code === "string"
    ? (body as { code: string }).code
    : "";
  if (!code || code.length > 200) return json(request, { error: "invalid_code" }, 400);
  await sql("delete from login_codes where expires_at < now()");
  const rows = await sql<{ session_token: string }>(
    "delete from login_codes where code_hash = $1 and expires_at > now() returning session_token",
    [sha256(code)],
  );
  const token = rows[0]?.session_token;
  if (!token) return json(request, { error: "invalid_code" }, 400);
  return json(request, { token }, 200, cookieHeader(sessionCookie(token, 60 * 60 * 24 * 30)));
}

async function demo(request: Request): Promise<Response> {
  const denied = mutationDenied(request);
  if (denied) return denied;
  if (!allowDemo(clientIp(request))) return json(request, { error: "rate_limited" }, 429);
  const userId = await createDemoUser();
  const token = await createSession(userId);
  return json(request, { token }, 200, cookieHeader(sessionCookie(token, 60 * 60 * 24 * 30)));
}

async function logout(request: Request): Promise<Response> {
  const denied = mutationDenied(request);
  if (denied) return denied;
  const viewer = await viewerFromRequest(request);
  if (viewer) await deleteSession(viewer.sessionId);
  return json(request, { ok: true }, 200, cookieHeader(sessionCookie("", 0)));
}

async function disconnect(request: Request): Promise<Response> {
  const denied = mutationDenied(request);
  if (denied) return denied;
  const viewer = await viewerFromRequest(request);
  if (!viewer) return json(request, { error: "unauthorized" }, 401);
  const token = await clearGmail(viewer.id);
  if (token) await revokeToken(token);
  await sql("delete from reservations where user_id = $1", [viewer.id]);
  const fresh = await viewerFromRequest(request);
  return json(request, { viewer: fresh ? publicViewer(fresh) : null });
}

async function cron(request: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET?.trim() || "";
  if (!secret) return json(request, { error: "not_found" }, 404);
  const header = request.headers.get("authorization") || "";
  const presented = header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : "";
  if (!presented || !safeEqual(presented, secret)) return json(request, { error: "unauthorized" }, 401);
  const ids = await dueViewerIds();
  let scanned = 0;
  for (const id of ids) {
    const viewer = await loadViewer(id);
    if (!viewer) continue;
    await scanViewer(viewer, false);
    scanned += 1;
  }
  return json(request, { scanned });
}

function mutationDenied(request: Request): Response | null {
  if (request.method === "GET" || request.method === "OPTIONS") return null;
  if (!sameOriginMutation(request)) return json(request, { error: "forbidden" }, 403);
  return null;
}

function redirect(location: string, extra?: Headers): Response {
  const headers = extra || new Headers();
  headers.set("location", location);
  headers.set("cache-control", "no-store");
  return new Response(null, { status: 302, headers });
}

function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "";
  return forwarded || "local";
}

function allowDemo(ip: string): boolean {
  const now = Date.now();
  const entry = demoHits.get(ip);
  if (!entry || entry.reset < now) {
    demoHits.set(ip, { count: 1, reset: now + 60 * 60 * 1000 });
    return true;
  }
  entry.count += 1;
  return entry.count <= 20;
}
