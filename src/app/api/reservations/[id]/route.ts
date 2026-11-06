import { sql } from "@/lib/db";
import { json } from "@/lib/http";
import { allowsMutation, profileIdFromRequest } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!allowsMutation(request)) return json(request, { error: "forbidden" }, 403);
  const profileId = profileIdFromRequest(request);
  if (!profileId) return json(request, { error: "unauthorized" }, 401);
  const { id } = await context.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return json(request, { error: "not_found" }, 404);
  const rows = await sql(
    "update reservations set hidden = true, updated_at = now() where id = $1 and profile_id = $2 returning id",
    [id, profileId],
  );
  if (rows.length === 0) return json(request, { error: "not_found" }, 404);
  return json(request, { ok: true });
}
