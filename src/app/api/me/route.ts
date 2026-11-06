import { json } from "@/lib/http";
import { profileById, publicProfile } from "@/lib/profiles";
import { googleConfigured, sessionSecret } from "@/lib/secrets";
import { profileIdFromRequest } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const configured = googleConfigured() && Boolean(sessionSecret()) && Boolean(process.env.TOKEN_ENCRYPTION_KEY?.trim());
  const id = profileIdFromRequest(request);
  if (!id) return json(request, { authenticated: false, googleConfigured: configured });
  const profile = await profileById(id);
  if (!profile) return json(request, { authenticated: false, googleConfigured: configured });
  return json(request, { authenticated: true, googleConfigured: configured, profile: publicProfile(profile) });
}
