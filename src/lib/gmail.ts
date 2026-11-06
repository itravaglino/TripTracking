const TOKEN_URL = "https://oauth2.googleapis.com/token";
const USERINFO_URL = "https://www.googleapis.com/oauth2/v3/userinfo";
const GMAIL_PREFIX = "https://gmail.googleapis.com/gmail/v1/users/me/";

const RESERVATION_QUERY = [
  "subject:(reserva OR reservation OR booking OR itinerary OR confirmation OR confirmacion OR vuelo OR flight",
  "OR hotel OR airbnb OR boarding OR check-in OR pasaje OR ticket OR tren OR transfer OR entrada)",
  'OR "FlightReservation" OR "LodgingReservation" OR "reservationNumber"',
  'OR "codigo de reserva" OR "código de reserva"',
].join(" ");

export type GmailProfile = { sub: string; email: string; name: string };

export type GmailMessage = {
  messageId: string;
  from: string;
  subject: string;
  html: string;
  text: string;
};

type TokenResponse = {
  access_token?: string;
  refresh_token?: string;
  error?: string;
};

export function googleAuthUrl(origin: string, state: string): string {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID?.trim() || "",
    redirect_uri: `${origin}/api/auth/google/callback`,
    response_type: "code",
    scope: "openid email profile https://www.googleapis.com/auth/gmail.readonly",
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export async function exchangeCode(origin: string, code: string): Promise<TokenResponse> {
  return tokenRequest({
    code,
    client_id: clientId(),
    client_secret: clientSecret(),
    redirect_uri: `${origin}/api/auth/google/callback`,
    grant_type: "authorization_code",
  });
}

export async function refreshAccessToken(refreshToken: string): Promise<string> {
  const body = await tokenRequest({
    refresh_token: refreshToken,
    client_id: clientId(),
    client_secret: clientSecret(),
    grant_type: "refresh_token",
  });
  if (!body.access_token) throw new Error(body.error || "refresh_failed");
  return body.access_token;
}

export async function googleProfile(accessToken: string): Promise<GmailProfile> {
  const response = await fetch(USERINFO_URL, {
    headers: { authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) throw new Error("profile_failed");
  const body = (await response.json()) as { sub?: string; email?: string; name?: string; email_verified?: boolean };
  if (!body.sub || !body.email || body.email_verified === false) throw new Error("profile_incomplete");
  return { sub: body.sub, email: body.email, name: body.name || "" };
}

export async function listReservationMessages(accessToken: string, initial: boolean): Promise<GmailMessage[]> {
  const window = initial ? "400d" : "21d";
  const query = `newer_than:${window} (${RESERVATION_QUERY})`;
  const listUrl = `${GMAIL_PREFIX}messages?maxResults=25&q=${encodeURIComponent(query)}`;
  const listed = await gmailJson(accessToken, listUrl) as { messages?: { id: string }[] };
  const ids = (listed.messages || []).map((message) => message.id).slice(0, 25);
  const messages: GmailMessage[] = [];
  for (const id of ids) {
    const full = await gmailJson(accessToken, `${GMAIL_PREFIX}messages/${encodeURIComponent(id)}?format=full`) as {
      id?: string;
      payload?: GmailPart;
    };
    messages.push(readMessage(full.id || id, full.payload));
  }
  return messages;
}

export async function revokeToken(token: string): Promise<void> {
  await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    signal: AbortSignal.timeout(12_000),
  }).catch(() => undefined);
}

type GmailPart = {
  mimeType?: string;
  body?: { data?: string; size?: number };
  parts?: GmailPart[];
  headers?: { name: string; value: string }[];
};

function readMessage(id: string, payload: GmailPart | undefined): GmailMessage {
  const headers = payload?.headers || [];
  const header = (name: string) => headers.find((item) => item.name.toLowerCase() === name)?.value || "";
  let html = "";
  let text = "";
  const walk = (part: GmailPart | undefined) => {
    if (!part) return;
    const size = part.body?.size ?? 0;
    if (size > 250_000) return;
    const decoded = part.body?.data ? decodeBase64Url(part.body.data).slice(0, 300_000) : "";
    if (part.mimeType === "text/html" && decoded && html.length < 300_000) html += decoded;
    if (part.mimeType === "text/plain" && decoded && text.length < 300_000) text += decoded;
    for (const child of part.parts || []) walk(child);
  };
  walk(payload);
  return { messageId: id, from: header("from").slice(0, 300), subject: header("subject").slice(0, 300), html, text };
}

function decodeBase64Url(value: string): string {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(padded, "base64").toString("utf8");
}

async function gmailJson(accessToken: string, url: string): Promise<unknown> {
  if (!url.startsWith(GMAIL_PREFIX)) throw new Error("gmail_url");
  const response = await fetch(url, {
    headers: { authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(15_000),
  });
  if (response.status === 401) throw new Error("gmail_unauthorized");
  if (!response.ok) throw new Error("gmail_failed");
  return response.json();
}

async function tokenRequest(body: Record<string, string>): Promise<TokenResponse> {
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body),
    signal: AbortSignal.timeout(15_000),
  });
  const parsed = (await response.json().catch(() => ({}))) as TokenResponse;
  if (!response.ok && !parsed.error) parsed.error = "token_failed";
  return parsed;
}

function clientId(): string {
  return process.env.GOOGLE_CLIENT_ID?.trim() || "";
}

function clientSecret(): string {
  return process.env.GOOGLE_CLIENT_SECRET?.trim() || "";
}
