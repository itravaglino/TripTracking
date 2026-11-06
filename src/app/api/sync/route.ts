import { json } from "@/lib/http";
import { profileById } from "@/lib/profiles";
import { allowsMutation, profileIdFromRequest } from "@/lib/session";
import { manualAllowed, syncDue, syncProfile } from "@/lib/sync";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!allowsMutation(request)) return json(request, { error: "forbidden" }, 403);
  const id = profileIdFromRequest(request);
  if (!id) return json(request, { error: "unauthorized" }, 401);
  const profile = await profileById(id);
  if (!profile) return json(request, { error: "unauthorized" }, 401);
  let manual = false;
  try {
    const body = (await request.json()) as { manual?: boolean };
    manual = body.manual === true;
  } catch {
    manual = false;
  }
  if (manual) {
    if (!manualAllowed(profile)) return json(request, { error: "rate_limited" }, 429);
  } else if (!syncDue(profile)) {
    return json(request, { ok: true, skipped: true, scanned: 0, saved: 0 });
  }
  const result = await syncProfile(profile, manual);
  const status = result.error === "sync_in_progress" || result.error === "rate_limited" ? 429 : 200;
  return json(request, result, result.ok ? 200 : status);
}
