import { clampPreferences } from "@/lib/categories";
import { sql } from "@/lib/db";
import { json } from "@/lib/http";
import { profileById, publicProfile } from "@/lib/profiles";
import { allowsMutation, profileIdFromRequest } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function PUT(request: Request) {
  if (!allowsMutation(request)) return json(request, { error: "forbidden" }, 403);
  const id = profileIdFromRequest(request);
  if (!id) return json(request, { error: "unauthorized" }, 401);
  const profile = await profileById(id);
  if (!profile) return json(request, { error: "unauthorized" }, 401);
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return json(request, { error: "invalid_body" }, 400);
  }
  const prefs = clampPreferences({
    trackFlight: Boolean(body.trackFlight),
    trackLodging: Boolean(body.trackLodging),
    trackTransport: Boolean(body.trackTransport),
    trackPlan: Boolean(body.trackPlan),
    trackEvent: Boolean(body.trackEvent),
    syncIntervalMinutes: Number(body.syncIntervalMinutes),
    lookbackDays: Number(body.lookbackDays),
  });
  const setupComplete = body.setupComplete === true || profile.setup_complete;
  await sql(
    `update profiles set
       track_flight = $2, track_lodging = $3, track_transport = $4, track_plan = $5, track_event = $6,
       sync_interval_minutes = $7, lookback_days = $8, setup_complete = $9, updated_at = now()
     where id = $1`,
    [
      id,
      prefs.trackFlight,
      prefs.trackLodging,
      prefs.trackTransport,
      prefs.trackPlan,
      prefs.trackEvent,
      prefs.syncIntervalMinutes,
      prefs.lookbackDays,
      setupComplete,
    ],
  );
  const updated = await profileById(id);
  return json(request, { profile: updated ? publicProfile(updated) : null });
}
