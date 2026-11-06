import { json } from "@/lib/http";
import { cronConfigured } from "@/lib/secrets";
import { dueProfiles, syncProfile } from "@/lib/sync";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!cronConfigured()) return json(request, { error: "cron_disabled" }, 404);
  const expected = process.env.CRON_SECRET?.trim() ?? "";
  const header = request.headers.get("authorization") ?? "";
  const token = header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : "";
  if (!token || token !== expected) return json(request, { error: "unauthorized" }, 401);
  const profiles = await dueProfiles(8);
  const results = [];
  for (const profile of profiles) {
    const result = await syncProfile(profile, false);
    results.push({ id: profile.id, ok: result.ok, saved: result.saved, error: result.error ?? null });
  }
  return json(request, { ran: results.length, results });
}
