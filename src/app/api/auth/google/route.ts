import { sql } from "@/lib/db";
import { redirect } from "@/lib/http";
import { googleConfigured } from "@/lib/secrets";
import { newState, safeReturnTo } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const returnTo = safeReturnTo(url.searchParams.get("return_to"), request);
  if (!googleConfigured()) {
    return redirect(`${new URL("/", request.url).origin}/?error=google_not_configured`);
  }
  const state = newState();
  await sql("delete from oauth_states where created_at < now() - interval '30 minutes'");
  await sql("insert into oauth_states (state, return_to) values ($1, $2)", [state, returnTo]);
  const redirectUri = new URL("/api/auth/callback", request.url).toString();
  const auth = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  auth.searchParams.set("client_id", process.env.GOOGLE_CLIENT_ID ?? "");
  auth.searchParams.set("redirect_uri", redirectUri);
  auth.searchParams.set("response_type", "code");
  auth.searchParams.set(
    "scope",
    "openid email profile https://www.googleapis.com/auth/gmail.readonly",
  );
  auth.searchParams.set("access_type", "offline");
  auth.searchParams.set("prompt", "consent");
  auth.searchParams.set("include_granted_scopes", "true");
  auth.searchParams.set("state", state);
  return redirect(auth.toString());
}
