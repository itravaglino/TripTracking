import { createHash } from "node:crypto";
import { filterByTrack, parseMailboxMessage, SAMPLE_MESSAGES } from "../../public/trips/engine.js";
import { refreshTokenOf, type Viewer } from "./account";
import { sql } from "./db";
import { listReservationMessages, refreshAccessToken } from "./gmail";

type Parsed = ReturnType<typeof parseMailboxMessage>[number];

const running = new Set<string>();

export async function scanViewer(viewer: Viewer, manual: boolean): Promise<{ kept: number; seen: number }> {
  if (!viewer.demo && !viewer.gmailConnected) return { kept: 0, seen: 0 };
  if (running.has(viewer.id)) return { kept: 0, seen: 0 };
  running.add(viewer.id);
  try {
    const locked = await sql<{ user_id: string }>(
      `update profiles set scan_lock_until = now() + interval '2 minutes'
       where user_id = $1 and (scan_lock_until is null or scan_lock_until < now())
       returning user_id`,
      [viewer.id],
    );
    if (!locked[0]) return { kept: 0, seen: 0 };
    const messages = viewer.demo ? SAMPLE_MESSAGES : await realMessages(viewer);
    const parsed = messages.flatMap((message) => parseMailboxMessage(message));
    const keptItems = filterByTrack(parsed, viewer.track).slice(0, 200);
    const existing = await sql<{ n: number }>("select count(*)::int as n from reservations where user_id = $1", [viewer.id]);
    const room = Math.max(0, 500 - Number(existing[0]?.n || 0));
    let kept = 0;
    for (const item of keptItems) {
      if (kept >= room && item.status !== "cancelled") continue;
      if (await storeItem(viewer.id, item)) kept += 1;
    }
    await sql(
      `update profiles set
        last_scan_at = now(),
        next_scan_at = now() + ($2::int * interval '1 minute'),
        last_scan_status = 'ok',
        last_scan_error = '',
        initial_scan_done = true,
        scan_lock_until = null,
        last_manual_scan_at = case when $3 then now() else last_manual_scan_at end
       where user_id = $1`,
      [viewer.id, viewer.scanIntervalMinutes, manual],
    );
    return { kept, seen: messages.length };
  } catch (error) {
    const reason = error instanceof Error ? error.message : "";
    const code = reason === "gmail_unauthorized" ? "gmail_unauthorized" : "scan_failed";
    console.error("trips scan failed", viewer.id, code);
    await sql(
      `update profiles set last_scan_at = now(), last_scan_status = 'error', last_scan_error = $2,
        scan_lock_until = null,
        next_scan_at = now() + interval '30 minutes',
        gmail_connected = case when $3 then false else gmail_connected end,
        token_ciphertext = case when $3 then '' else token_ciphertext end,
        token_iv = case when $3 then '' else token_iv end
       where user_id = $1`,
      [viewer.id, code, code === "gmail_unauthorized"],
    );
    return { kept: 0, seen: 0 };
  } finally {
    running.delete(viewer.id);
  }
}

export async function maybeScan(viewer: Viewer): Promise<void> {
  if (!viewer.setupComplete) return;
  if (!viewer.demo && !viewer.gmailConnected) return;
  if (viewer.nextScanAt && Date.parse(viewer.nextScanAt) > Date.now()) return;
  await scanViewer(viewer, false);
}

export async function reservationsFor(userId: string) {
  const rows = await sql<ReservationRow>(
    `select id, category, status, title, provider, confirmation_code, starts_at, ends_at,
      origin, destination, location, party, flight_number, details, source_subject
     from reservations where user_id = $1
     order by starts_at asc nulls last, title asc`,
    [userId],
  );
  return rows.map((row) => ({
    id: row.id,
    category: row.category,
    status: row.status,
    title: row.title,
    provider: row.provider,
    confirmationCode: row.confirmation_code,
    startsAt: asIso(row.starts_at),
    endsAt: asIso(row.ends_at),
    origin: row.origin,
    destination: row.destination,
    location: row.location,
    party: row.party,
    flightNumber: row.flight_number,
    details: typeof row.details === "string" ? safeJson(row.details) : row.details || {},
    sourceSubject: row.source_subject,
  }));
}

export async function dueViewerIds(): Promise<string[]> {
  const rows = await sql<{ id: string }>(
    `select u.id from users u
     join profiles p on p.user_id = u.id
     where u.demo = false
       and p.gmail_connected = true
       and p.setup_complete = true
       and p.next_scan_at is not null
       and p.next_scan_at <= now()
       and (p.scan_lock_until is null or p.scan_lock_until < now())
     order by p.next_scan_at asc
     limit 3`,
  );
  return rows.map((row) => row.id);
}

async function realMessages(viewer: Viewer) {
  const refresh = refreshTokenOf(viewer);
  if (!refresh) throw new Error("gmail_unauthorized");
  const access = await refreshAccessToken(refresh);
  return listReservationMessages(access, !viewer.initialScanDone);
}

async function storeItem(userId: string, item: Parsed): Promise<boolean> {
  if (item.status === "cancelled" && item.confirmationCode) {
    const updated = await sql(
      `update reservations set status = 'cancelled', updated_at = now()
       where user_id = $1 and confirmation_code = $2
       returning id`,
      [userId, item.confirmationCode],
    );
    if (updated.length > 0) return true;
  }
  const fingerprint = createHash("sha256")
    .update([item.category, item.confirmationCode, item.title, item.startsAt || "", item.origin, item.destination].join("|"))
    .digest("hex")
    .slice(0, 32);
  await sql(
    `insert into reservations (
      id, user_id, category, status, title, provider, confirmation_code, starts_at, ends_at,
      origin, destination, location, party, flight_number, details, source_message_id, source_subject, fingerprint
    ) values (
      $1, $2, $3, $4, $5, $6, $7, $8, $9,
      $10, $11, $12, $13, $14, $15::jsonb, $16, $17, $18
    )
    on conflict (user_id, fingerprint) do update set
      status = excluded.status,
      title = excluded.title,
      provider = excluded.provider,
      confirmation_code = excluded.confirmation_code,
      ends_at = excluded.ends_at,
      location = excluded.location,
      party = excluded.party,
      flight_number = excluded.flight_number,
      details = excluded.details,
      source_subject = excluded.source_subject,
      updated_at = now()`,
    [
      crypto.randomUUID(),
      userId,
      item.category,
      item.status,
      item.title,
      item.provider,
      item.confirmationCode,
      item.startsAt,
      item.endsAt,
      item.origin,
      item.destination,
      item.location,
      item.party,
      item.flightNumber,
      JSON.stringify(item.details || {}),
      item.messageId,
      item.sourceSubject,
      fingerprint,
    ],
  );
  return true;
}

function asIso(value: string | Date | null): string | null {
  if (!value) return null;
  const time = value instanceof Date ? value.getTime() : Date.parse(value);
  if (Number.isNaN(time)) return null;
  return new Date(time).toISOString();
}

function safeJson(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

type ReservationRow = {
  id: string;
  category: string;
  status: string;
  title: string;
  provider: string;
  confirmation_code: string;
  starts_at: string | Date | null;
  ends_at: string | Date | null;
  origin: string;
  destination: string;
  location: string;
  party: string;
  flight_number: string;
  details: unknown;
  source_subject: string;
};
