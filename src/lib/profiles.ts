import type { Preferences } from "./categories";
import { sql } from "./db";

export type Profile = {
  id: string;
  email: string;
  name: string;
  google_sub: string | null;
  gmail_linked: boolean;
  refresh_token_enc: string | null;
  access_token_enc: string | null;
  access_token_expires_at: string | null;
  sync_interval_minutes: number;
  lookback_days: number;
  track_flight: boolean;
  track_lodging: boolean;
  track_transport: boolean;
  track_plan: boolean;
  track_event: boolean;
  setup_complete: boolean;
  last_sync_at: string | null;
  last_sync_status: string | null;
  last_sync_error: string | null;
  last_manual_sync_at: string | null;
  sync_locked_until: string | null;
};

export function prefsOf(profile: Profile): Preferences {
  return {
    trackFlight: profile.track_flight,
    trackLodging: profile.track_lodging,
    trackTransport: profile.track_transport,
    trackPlan: profile.track_plan,
    trackEvent: profile.track_event,
    syncIntervalMinutes: profile.sync_interval_minutes,
    lookbackDays: profile.lookback_days,
  };
}

export async function profileById(id: string): Promise<Profile | null> {
  const rows = await sql<Profile>("select * from profiles where id = $1", [id]);
  return rows[0] ?? null;
}

export async function profileByGoogleSub(sub: string): Promise<Profile | null> {
  const rows = await sql<Profile>("select * from profiles where google_sub = $1", [sub]);
  return rows[0] ?? null;
}

export type ReservationRow = {
  id: string;
  category: string;
  title: string;
  provider: string | null;
  confirmation_code: string | null;
  status: string;
  starts_at: string | null;
  ends_at: string | null;
  origin: string | null;
  destination: string | null;
  location: string | null;
  details: Record<string, string> | string;
  source_subject: string | null;
};

export async function reservationsFor(profileId: string): Promise<ReservationRow[]> {
  return sql<ReservationRow>(
    `select id, category, title, provider, confirmation_code, status, starts_at, ends_at,
            origin, destination, location, details, source_subject
     from reservations
     where profile_id = $1 and hidden = false
     order by starts_at asc nulls last, title asc`,
    [profileId],
  );
}

export function publicReservation(row: ReservationRow) {
  const details = typeof row.details === "string" ? safeJson(row.details) : row.details ?? {};
  return {
    id: row.id,
    category: row.category,
    title: row.title,
    provider: row.provider,
    confirmationCode: row.confirmation_code,
    status: row.status,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    origin: row.origin,
    destination: row.destination,
    location: row.location,
    details,
    sourceSubject: row.source_subject,
  };
}

function safeJson(value: string): Record<string, string> {
  try {
    const parsed = JSON.parse(value) as Record<string, string>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function publicProfile(profile: Profile) {
  return {
    email: profile.email,
    name: profile.name,
    gmailLinked: profile.gmail_linked,
    setupComplete: profile.setup_complete,
    preferences: prefsOf(profile),
    lastSyncAt: profile.last_sync_at,
    lastSyncStatus: profile.last_sync_status,
    lastSyncError: profile.last_sync_error,
  };
}
