import { randomUUID } from "node:crypto";
import { categoryEnabled, enabledCategories, type Preferences } from "./categories";
import { sql } from "./db";
import { accessTokenFor, gmailQuery, listTravelMessages, readMessage } from "./gmail";
import { parseReservationEmail } from "./parse-reservations";
import { prefsOf, type Profile } from "./profiles";

export type SyncResult = {
  ok: boolean;
  scanned: number;
  saved: number;
  error?: string;
};

export async function syncProfile(profile: Profile, manual: boolean): Promise<SyncResult> {
  const prefs = prefsOf(profile);
  const categories = enabledCategories(prefs);
  if (!profile.gmail_linked) return { ok: false, scanned: 0, saved: 0, error: "gmail_not_linked" };
  if (categories.length === 0) return { ok: false, scanned: 0, saved: 0, error: "nothing_enabled" };

  const locked = await sql<{ id: string }>(
    `update profiles
     set sync_locked_until = now() + interval '2 minutes', updated_at = now()
     where id = $1 and (sync_locked_until is null or sync_locked_until < now())
     returning id`,
    [profile.id],
  );
  if (locked.length === 0) return { ok: false, scanned: 0, saved: 0, error: "sync_in_progress" };

  try {
    const token = await accessTokenFor(profile);
    const ids = await listTravelMessages(token, gmailQuery(categories, prefs.lookbackDays), 20);
    let saved = 0;
    for (const id of ids) {
      const seen = await sql(
        "select message_id from processed_messages where profile_id = $1 and message_id = $2",
        [profile.id, id],
      );
      if (seen.length > 0) continue;
      const message = await readMessage(token, id);
      const parsed = parseReservationEmail(message).filter((item) => categoryEnabled(prefs, item.category));
      for (const item of parsed) {
        await sql(
          `insert into reservations (
             id, profile_id, category, title, provider, confirmation_code, status,
             starts_at, ends_at, origin, destination, location, details,
             source_message_id, source_subject, dedupe_key
           ) values (
             $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb,$14,$15,$16
           )
           on conflict (profile_id, dedupe_key) do update set
             title = excluded.title,
             provider = excluded.provider,
             confirmation_code = excluded.confirmation_code,
             status = excluded.status,
             starts_at = excluded.starts_at,
             ends_at = excluded.ends_at,
             origin = excluded.origin,
             destination = excluded.destination,
             location = excluded.location,
             details = excluded.details,
             source_subject = excluded.source_subject,
             updated_at = now()`,
          [
            randomUUID(),
            profile.id,
            item.category,
            item.title,
            item.provider,
            item.confirmationCode,
            item.status,
            item.startsAt,
            item.endsAt,
            item.origin,
            item.destination,
            item.location,
            JSON.stringify(item.details),
            message.id,
            message.subject,
            item.dedupeKey,
          ],
        );
        saved += 1;
      }
      await sql(
        "insert into processed_messages (profile_id, message_id) values ($1, $2) on conflict do nothing",
        [profile.id, id],
      );
    }
    await sql(
      `update profiles set
         last_sync_at = now(),
         last_sync_status = 'ok',
         last_sync_error = null,
         last_manual_sync_at = case when $2 then now() else last_manual_sync_at end,
         sync_locked_until = null,
         updated_at = now()
       where id = $1`,
      [profile.id, manual],
    );
    return { ok: true, scanned: ids.length, saved };
  } catch (error) {
    const code = error instanceof Error ? error.message : "sync_failed";
    const safe = ["unauthorized", "refresh_failed", "missing_refresh_token", "list_failed", "read_failed"].includes(code)
      ? code
      : "sync_failed";
    if (safe === "unauthorized" || safe === "refresh_failed" || safe === "missing_refresh_token") {
      await sql("update profiles set gmail_linked = false, updated_at = now() where id = $1", [profile.id]);
    }
    await sql(
      `update profiles set last_sync_at = now(), last_sync_status = 'error', last_sync_error = $2,
         sync_locked_until = null, updated_at = now() where id = $1`,
      [profile.id, safe],
    );
    return { ok: false, scanned: 0, saved: 0, error: safe };
  }
}

export function syncDue(profile: Profile, now = Date.now()): boolean {
  if (!profile.gmail_linked || !profile.setup_complete) return false;
  if (!profile.last_sync_at) return true;
  const elapsed = now - new Date(profile.last_sync_at).getTime();
  return elapsed >= profile.sync_interval_minutes * 60_000;
}

export async function dueProfiles(limit = 8): Promise<Profile[]> {
  return sql<Profile>(
    `select * from profiles
     where gmail_linked = true and setup_complete = true
       and (last_sync_at is null or last_sync_at < now() - (sync_interval_minutes * interval '1 minute'))
       and (sync_locked_until is null or sync_locked_until < now())
     order by last_sync_at asc nulls first
     limit $1`,
    [limit],
  );
}

export function manualAllowed(profile: Profile, now = Date.now()): boolean {
  if (!profile.last_manual_sync_at) return true;
  return now - new Date(profile.last_manual_sync_at).getTime() >= 60_000;
}

export type { Preferences };
