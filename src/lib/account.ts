import { CATEGORIES, normalizeSettings } from "../../public/trips/engine.js";
import { decryptSecret, encryptSecret, sha256 } from "./crypto";
import { sql } from "./db";
import { newToken, readCookie } from "./http";

export type Track = Record<(typeof CATEGORIES)[number], boolean>;

export type Viewer = {
  id: string;
  email: string;
  name: string;
  demo: boolean;
  sessionId: string;
  gmailConnected: boolean;
  gmailEmail: string;
  setupComplete: boolean;
  scanIntervalMinutes: number;
  track: Track;
  initialScanDone: boolean;
  lastScanAt: string | null;
  nextScanAt: string | null;
  lastScanStatus: string;
  lastScanError: string;
  lastManualScanAt: string | null;
  tokenCiphertext: string;
  tokenIv: string;
};

type UserRow = {
  id: string;
  email: string;
  name: string;
  demo: boolean;
  session_id: string;
  gmail_connected: boolean;
  gmail_email: string;
  setup_complete: boolean;
  scan_interval_minutes: number;
  track_flights: boolean;
  track_lodging: boolean;
  track_transport: boolean;
  track_plans: boolean;
  track_events: boolean;
  initial_scan_done: boolean;
  last_scan_at: string | null;
  next_scan_at: string | null;
  last_scan_status: string;
  last_scan_error: string;
  last_manual_scan_at: string | null;
  token_ciphertext: string;
  token_iv: string;
};

const VIEWER_SQL = `
  select u.id, u.email, u.name, u.demo, s.id as session_id,
    p.gmail_connected, p.gmail_email, p.setup_complete, p.scan_interval_minutes,
    p.track_flights, p.track_lodging, p.track_transport, p.track_plans, p.track_events,
    p.initial_scan_done, p.last_scan_at, p.next_scan_at, p.last_scan_status, p.last_scan_error,
    p.last_manual_scan_at, p.token_ciphertext, p.token_iv
  from sessions s
  join users u on u.id = s.user_id
  join profiles p on p.user_id = u.id
  where s.token_hash = $1 and s.expires_at > now()
`;

export async function viewerFromRequest(request: Request): Promise<Viewer | null> {
  const header = request.headers.get("authorization") || "";
  const bearer = header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : "";
  const token = bearer || readCookie(request, "trips_session");
  if (!token || token.length > 200) return null;
  const rows = await sql<UserRow>(VIEWER_SQL, [sha256(token)]);
  const row = rows[0];
  if (!row) return null;
  const settings = normalizeSettings({
    scanIntervalMinutes: row.scan_interval_minutes,
    track: {
      flight: row.track_flights,
      lodging: row.track_lodging,
      transport: row.track_transport,
      plan: row.track_plans,
      event: row.track_events,
    },
  });
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    demo: row.demo,
    sessionId: row.session_id,
    gmailConnected: row.gmail_connected,
    gmailEmail: row.gmail_email,
    setupComplete: row.setup_complete,
    scanIntervalMinutes: settings.scanIntervalMinutes,
    track: settings.track,
    initialScanDone: row.initial_scan_done,
    lastScanAt: iso(row.last_scan_at),
    nextScanAt: iso(row.next_scan_at),
    lastScanStatus: row.last_scan_status,
    lastScanError: row.last_scan_error,
    lastManualScanAt: iso(row.last_manual_scan_at),
    tokenCiphertext: row.token_ciphertext,
    tokenIv: row.token_iv,
  };
}

export function publicViewer(viewer: Viewer) {
  return {
    name: viewer.name,
    email: viewer.demo ? "" : viewer.email,
    demo: viewer.demo,
    gmailConnected: viewer.gmailConnected,
    gmailEmail: viewer.demo ? "" : viewer.gmailEmail,
    setupComplete: viewer.setupComplete,
    scanIntervalMinutes: viewer.scanIntervalMinutes,
    track: viewer.track,
    lastScanAt: viewer.lastScanAt,
    nextScanAt: viewer.nextScanAt,
    lastScanStatus: viewer.lastScanStatus,
    lastScanError: viewer.lastScanError,
  };
}

export async function createSession(userId: string): Promise<string> {
  const token = newToken();
  await sql(
    `insert into sessions (id, user_id, token_hash, expires_at)
     values ($1, $2, $3, now() + interval '30 days')`,
    [crypto.randomUUID(), userId, sha256(token)],
  );
  return token;
}

export async function deleteSession(sessionId: string): Promise<void> {
  await sql("delete from sessions where id = $1", [sessionId]);
}

export async function saveProfile(
  userId: string,
  settings: { track: Track; scanIntervalMinutes: number },
  setupComplete: boolean,
): Promise<void> {
  await sql(
    `update profiles set
      track_flights = $2, track_lodging = $3, track_transport = $4, track_plans = $5, track_events = $6,
      scan_interval_minutes = $7, setup_complete = $8,
      next_scan_at = case when $8 then now() else next_scan_at end
     where user_id = $1`,
    [
      userId,
      settings.track.flight,
      settings.track.lodging,
      settings.track.transport,
      settings.track.plan,
      settings.track.event,
      settings.scanIntervalMinutes,
      setupComplete,
    ],
  );
  for (const category of CATEGORIES) {
    if (!settings.track[category]) {
      await sql("delete from reservations where user_id = $1 and category = $2", [userId, category]);
    }
  }
}

export async function upsertGoogleUser(profile: { sub: string; email: string; name: string }, refreshToken: string): Promise<string> {
  const sealed = encryptSecret(refreshToken);
  const existing = await sql<{ id: string }>("select id from users where google_sub = $1", [profile.sub]);
  const userId = existing[0]?.id || crypto.randomUUID();
  if (!existing[0]) {
    await sql(
      "insert into users (id, google_sub, email, name, demo) values ($1, $2, $3, $4, false)",
      [userId, profile.sub, profile.email, profile.name],
    );
    await sql("insert into profiles (user_id, gmail_connected, gmail_email, token_ciphertext, token_iv) values ($1, true, $2, $3, $4)", [
      userId,
      profile.email,
      sealed.ciphertext,
      sealed.iv,
    ]);
  } else {
    await sql("update users set email = $2, name = case when $3 = '' then name else $3 end where id = $1", [
      userId,
      profile.email,
      profile.name,
    ]);
    await sql(
      `update profiles set gmail_connected = true, gmail_email = $2, token_ciphertext = $3, token_iv = $4, last_scan_error = ''
       where user_id = $1`,
      [userId, profile.email, sealed.ciphertext, sealed.iv],
    );
  }
  return userId;
}

export async function createDemoUser(): Promise<string> {
  const userId = crypto.randomUUID();
  const stamp = userId.slice(0, 8);
  await sql(
    "insert into users (id, email, name, demo) values ($1, $2, $3, true)",
    [userId, `demo-${stamp}@example.invalid`, "Invitado de muestra"],
  );
  await sql("insert into profiles (user_id) values ($1)", [userId]);
  return userId;
}

export function refreshTokenOf(viewer: Viewer): string {
  if (!viewer.tokenCiphertext || !viewer.tokenIv) return "";
  return decryptSecret(viewer.tokenCiphertext, viewer.tokenIv);
}

export async function clearGmail(userId: string): Promise<string> {
  const rows = await sql<{ token_ciphertext: string; token_iv: string }>(
    "select token_ciphertext, token_iv from profiles where user_id = $1",
    [userId],
  );
  let token = "";
  if (rows[0]?.token_ciphertext && rows[0]?.token_iv) {
    try {
      token = decryptSecret(rows[0].token_ciphertext, rows[0].token_iv);
    } catch {
      token = "";
    }
  }
  await sql(
    `update profiles set gmail_connected = false, gmail_email = '', token_ciphertext = '', token_iv = '',
      initial_scan_done = false, last_scan_status = '', last_scan_error = ''
     where user_id = $1`,
    [userId],
  );
  return token;
}

function iso(value: string | Date | null): string | null {
  if (!value) return null;
  const time = value instanceof Date ? value.getTime() : Date.parse(value);
  if (Number.isNaN(time)) return null;
  return new Date(time).toISOString();
}

export async function loadViewer(userId: string): Promise<Viewer | null> {
  const rows = await sql<UserRow>(
    `select u.id, u.email, u.name, u.demo, '' as session_id,
      p.gmail_connected, p.gmail_email, p.setup_complete, p.scan_interval_minutes,
      p.track_flights, p.track_lodging, p.track_transport, p.track_plans, p.track_events,
      p.initial_scan_done, p.last_scan_at, p.next_scan_at, p.last_scan_status, p.last_scan_error,
      p.last_manual_scan_at, p.token_ciphertext, p.token_iv
     from users u
     join profiles p on p.user_id = u.id
     where u.id = $1`,
    [userId],
  );
  const row = rows[0];
  if (!row) return null;
  const settings = normalizeSettings({
    scanIntervalMinutes: row.scan_interval_minutes,
    track: {
      flight: row.track_flights,
      lodging: row.track_lodging,
      transport: row.track_transport,
      plan: row.track_plans,
      event: row.track_events,
    },
  });
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    demo: row.demo,
    sessionId: "",
    gmailConnected: row.gmail_connected,
    gmailEmail: row.gmail_email,
    setupComplete: row.setup_complete,
    scanIntervalMinutes: settings.scanIntervalMinutes,
    track: settings.track,
    initialScanDone: row.initial_scan_done,
    lastScanAt: iso(row.last_scan_at),
    nextScanAt: iso(row.next_scan_at),
    lastScanStatus: row.last_scan_status,
    lastScanError: row.last_scan_error,
    lastManualScanAt: iso(row.last_manual_scan_at),
    tokenCiphertext: row.token_ciphertext,
    tokenIv: row.token_iv,
  };
}
