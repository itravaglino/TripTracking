import { randomUUID } from "node:crypto";
import { sql } from "@/lib/db";
import { exchangeCode, identityFromIdToken } from "@/lib/gmail";
import { redirect } from "@/lib/http";
import { profileByGoogleSub } from "@/lib/profiles";
import { encryptSecret } from "@/lib/secrets";
import { createSessionToken, safeReturnTo, sessionCookie } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const fail = (code: string, returnTo?: string) => {
    const back = new URL(returnTo || "/", request.url);
    if (back.origin !== url.origin) back.pathname = "/trips";
    back.searchParams.set("error", code);
    return redirect(back.toString());
  };

  const state = url.searchParams.get("state");
  const code = url.searchParams.get("code");
  const denied = url.searchParams.get("error");
  if (!state) return fail("oauth_state");
  const rows = await sql<{ return_to: string }>("delete from oauth_states where state = $1 returning return_to", [state]);
  const returnTo = safeReturnTo(rows[0]?.return_to ?? null, request);
  if (!rows[0]) return fail("oauth_state", returnTo);
  if (denied || !code) return fail("oauth_denied", returnTo);

  try {
    const tokens = await exchangeCode(code, new URL("/api/auth/callback", request.url).toString());
    const identity = identityFromIdToken(tokens.idToken);
    if (!identity) return fail("oauth_identity", returnTo);
    const existing = await profileByGoogleSub(identity.sub);
    const refreshEnc = tokens.refreshToken
      ? encryptSecret(tokens.refreshToken)
      : existing?.refresh_token_enc ?? null;
    const accessEnc = encryptSecret(tokens.accessToken);
    if (!refreshEnc || !accessEnc) return fail("encryption_key", returnTo);
    const expiresAt = new Date(Date.now() + tokens.expiresIn * 1000).toISOString();
    const id = existing?.id ?? randomUUID();
    if (existing) {
      await sql(
        `update profiles set email = $2, name = $3, gmail_linked = true,
           refresh_token_enc = $4, access_token_enc = $5, access_token_expires_at = $6, updated_at = now()
         where id = $1`,
        [id, identity.email, identity.name, refreshEnc, accessEnc, expiresAt],
      );
    } else {
      await sql(
        `insert into profiles (
           id, email, name, google_sub, gmail_linked, refresh_token_enc, access_token_enc, access_token_expires_at
         ) values ($1,$2,$3,$4,true,$5,$6,$7)`,
        [id, identity.email, identity.name, identity.sub, refreshEnc, accessEnc, expiresAt],
      );
    }
    const session = createSessionToken(id);
    if (!session) return fail("session_secret", returnTo);
    const destination = new URL(returnTo);
    if (destination.origin !== url.origin) {
      destination.hash = `session=${session}`;
    }
    return redirect(destination.toString(), [sessionCookie(session)]);
  } catch {
    return fail("oauth_exchange", returnTo);
  }
}
