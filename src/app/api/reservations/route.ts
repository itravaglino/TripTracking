import { categoryEnabled } from "@/lib/categories";
import { json } from "@/lib/http";
import { prefsOf, profileById, publicReservation, reservationsFor } from "@/lib/profiles";
import { sampleReservations } from "@/lib/sample";
import { profileIdFromRequest } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const id = profileIdFromRequest(request);
  if (!id) {
    return json(request, { sample: true, reservations: sampleReservations() });
  }
  const profile = await profileById(id);
  if (!profile) return json(request, { sample: true, reservations: sampleReservations() });
  if (!profile.gmail_linked) {
    const prefs = prefsOf(profile);
    return json(request, {
      sample: true,
      reservations: sampleReservations().filter((item) => categoryEnabled(prefs, item.category)),
    });
  }
  const rows = await reservationsFor(id);
  return json(request, { sample: false, reservations: rows.map(publicReservation) });
}
